"""
Facturación router — combina Formas de Pago + Recibos Emitidos en un Excel
descargable. Módulo independiente del flujo de Ingresos/Pagos/Conciliación y
de Reporte 601: no lee la base de datos para generar sus reportes — la
única excepción es el guardado opcional del detalle de Tablas_Forma_Pago ya
corregido (ver /tablas-forma-pago/guardar más abajo), pensado como insumo
para una futura funcionalidad de análisis, no parte del flujo de generación
— y el registro suelto de facturas por día (/tablas-forma-pago/facturas-dia),
solo como constancia de que ese día se facturó algo, sin amarrarlo a
ninguna cuenta de las 7 tablas.
"""

import json
import logging
from datetime import date
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.descargas import cabecera_descarga
from app.core.security import get_current_user
from app.db.session import get_db
from app.models import BalanzaCuenta, FacturacionFacturaAdjunta, FacturacionTablaFormaPagoDetalle
from app.services.excel_processor import (
    agregar_pue_ppd_tablas_forma_pago,
    generar_reporte_categoria_tabla_forma_pago_excel,
    generar_reporte_facturacion_excel,
    generar_reporte_tablas_forma_pago_guardado_excel,
    leer_filas_completas_tablas_forma_pago,
)
from app.services.facturacion import (
    aplicar_ediciones_segunda_limpieza,
    aplicar_movimientos_periodo,
    calcular_detalle_balanza_punto_venta,
    celdas_editadas_segunda_limpieza,
    clasificar_pos_en_punto_venta,
    clave_fila_segunda_limpieza,
    CLAVE_ANALITICA_POR_TABLA,
    combinar_formas_pago_y_recibos,
    combinar_formas_pago_y_recibos_completo,
    construir_segunda_limpieza,
    corregir_cupon_ventas,
    corregir_total_subtotal_pago_mixto,
    detectar_duplicados_forma_pago_mixta,
    detectar_filas_revision_segunda_limpieza,
    eliminar_adjunto_factura,
    extraer_cuentas_por_segmento,
    filas_a_registros_tabla_forma_pago,
    guardar_adjunto_factura,
    leer_excel_balanza,
    leer_excel_facturacion,
    leer_excel_movimientos,
    MAPEO_BALANZA_POR_PUNTO_VENTA,
    PUNTOS_VENTA_ANALITICA,
    ruta_absoluta_adjunto,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generar")
async def generar_facturacion(
    formas_pago: UploadFile = File(..., description="Archivo Excel de Formas de Pago"),
    recibos_emitidos: UploadFile = File(..., description="Archivo Excel de Recibos Emitidos"),
    movimientos_periodo: UploadFile | None = File(
        None, description="Archivo Excel de Movimientos por Periodo (opcional)"
    ),
    ediciones: str | None = Form(
        None,
        description="JSON con ediciones manuales de la vista de duplicados: "
        '[{"clave": "...", "cambios": {"Columna": valor, ...}}, ...]',
    ),
    current_user: dict = Depends(get_current_user),
):
    archivos_requeridos = [formas_pago, recibos_emitidos]
    if movimientos_periodo is not None:
        archivos_requeridos.append(movimientos_periodo)
    for archivo in archivos_requeridos:
        if not archivo.filename.lower().endswith((".xls", ".xlsx")):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido_formas_pago = await formas_pago.read()
    contenido_recibos_emitidos = await recibos_emitidos.read()
    contenido_movimientos = await movimientos_periodo.read() if movimientos_periodo is not None else None

    try:
        ediciones_parseadas = json.loads(ediciones) if ediciones else []
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"El campo 'ediciones' no es JSON válido: {str(e)}")

    try:
        df_formas_pago = await leer_excel_facturacion(contenido_formas_pago)
        df_recibos_emitidos = await leer_excel_facturacion(contenido_recibos_emitidos)
        df_combinados = combinar_formas_pago_y_recibos(df_formas_pago, df_recibos_emitidos)
        df_segunda_limpieza = construir_segunda_limpieza(df_combinados)

        if contenido_movimientos is not None:
            df_movimientos = await leer_excel_movimientos(contenido_movimientos)
            cuentas_por_segmento = extraer_cuentas_por_segmento(df_movimientos)
            df_segunda_limpieza = aplicar_movimientos_periodo(df_segunda_limpieza, cuentas_por_segmento)

        # La corrección de pago mixto va DESPUÉS de Movimientos por Periodo:
        # necesita la FORMA DE PAGO final de cada fila (Movimientos puede
        # reemplazarla) para decidir cuál fila es Efectivo/cuál es la ancla.
        df_segunda_limpieza, celdas_editadas = corregir_total_subtotal_pago_mixto(df_segunda_limpieza, df_combinados)

        df_segunda_limpieza, celdas_cupon = corregir_cupon_ventas(df_segunda_limpieza)
        for idx, columnas in celdas_cupon.items():
            celdas_editadas.setdefault(idx, set()).update(columnas)

        if ediciones_parseadas:
            for idx, columnas in celdas_editadas_segunda_limpieza(df_segunda_limpieza, ediciones_parseadas).items():
                celdas_editadas.setdefault(idx, set()).update(columnas)
            df_segunda_limpieza = aplicar_ediciones_segunda_limpieza(df_segunda_limpieza, ediciones_parseadas)

        excel_bytes = await generar_reporte_facturacion_excel(df_combinados, df_segunda_limpieza, celdas_editadas)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error generando el reporte de Facturación")
        raise HTTPException(status_code=400, detail=f"Error al procesar los archivos: {str(e)}")

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Facturacion.xlsx"},
    )


@router.post("/duplicados-preview")
async def duplicados_preview(
    formas_pago: UploadFile = File(..., description="Archivo Excel de Formas de Pago"),
    recibos_emitidos: UploadFile = File(..., description="Archivo Excel de Recibos Emitidos"),
    movimientos_periodo: UploadFile | None = File(
        None, description="Archivo Excel de Movimientos por Periodo (opcional)"
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Vista previa (sin generar Excel) de cuentas a revisar, en dos versiones:
    - "duplicados_combinados": solo lectura, columnas crudas de Formas de
      Pago + Recibos Emitidos (antes del remapeo a Segunda_Limpieza) — para
      que el usuario compare contra los archivos originales. Solo cuentas
      con Forma de Pago mixta (ej. VISA+Efectivo).
    - "duplicados_segunda_limpieza": editable, columnas de Segunda_Limpieza
      (Segmento, GRAVADO, INGTASA 0, etc.) más una "_clave" por fila, para
      que el usuario decida y envíe ediciones manuales junto con /generar.
      Incluye tanto las cuentas con Forma de Pago mixta como TODAS las
      cuentas de POS == AGENCIA DE VIAJES (sean o no duplicadas), a pedido
      del usuario, para revisarlas/editarlas ahí también.
    """
    archivos_requeridos = [formas_pago, recibos_emitidos]
    if movimientos_periodo is not None:
        archivos_requeridos.append(movimientos_periodo)
    for archivo in archivos_requeridos:
        if not archivo.filename.lower().endswith((".xls", ".xlsx")):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido_formas_pago = await formas_pago.read()
    contenido_recibos_emitidos = await recibos_emitidos.read()
    contenido_movimientos = await movimientos_periodo.read() if movimientos_periodo is not None else None

    try:
        df_formas_pago = await leer_excel_facturacion(contenido_formas_pago)
        df_recibos_emitidos = await leer_excel_facturacion(contenido_recibos_emitidos)

        df_combinado_completo = combinar_formas_pago_y_recibos_completo(df_formas_pago, df_recibos_emitidos)
        df_duplicados_combinados = detectar_duplicados_forma_pago_mixta(df_combinado_completo)

        df_combinados = combinar_formas_pago_y_recibos(df_formas_pago, df_recibos_emitidos)
        df_segunda_limpieza = construir_segunda_limpieza(df_combinados)

        if contenido_movimientos is not None:
            df_movimientos = await leer_excel_movimientos(contenido_movimientos)
            cuentas_por_segmento = extraer_cuentas_por_segmento(df_movimientos)
            df_segunda_limpieza = aplicar_movimientos_periodo(df_segunda_limpieza, cuentas_por_segmento)

        df_segunda_limpieza, _ = corregir_total_subtotal_pago_mixto(df_segunda_limpieza, df_combinados)
        df_segunda_limpieza, _ = corregir_cupon_ventas(df_segunda_limpieza)

        df_duplicados_segunda_limpieza = detectar_filas_revision_segunda_limpieza(df_segunda_limpieza)
        if not df_duplicados_segunda_limpieza.empty:
            df_duplicados_segunda_limpieza = df_duplicados_segunda_limpieza.copy()
            df_duplicados_segunda_limpieza["_clave"] = clave_fila_segunda_limpieza(df_duplicados_segunda_limpieza)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error generando la vista previa de duplicados")
        raise HTTPException(status_code=400, detail=f"Error al procesar los archivos: {str(e)}")

    def _a_registros(df: pd.DataFrame) -> list[dict]:
        return df.astype(object).where(pd.notna(df), None).to_dict(orient="records")

    registros_combinados = _a_registros(df_duplicados_combinados)
    registros_segunda_limpieza = _a_registros(df_duplicados_segunda_limpieza)
    return {
        "duplicados_combinados": registros_combinados,
        "total_combinados": len(registros_combinados),
        "duplicados_segunda_limpieza": registros_segunda_limpieza,
        "total_segunda_limpieza": len(registros_segunda_limpieza),
    }


@router.post("/agregar-pue-ppd")
async def agregar_pue_ppd(
    archivo: UploadFile = File(..., description="Excel de Tablas_Forma_Pago (generado por /generar, opcionalmente ya corregido)"),
    current_user: dict = Depends(get_current_user),
):
    """
    "Paso 2" del flujo de Facturación, independiente de /generar: recibe de
    vuelta un Excel con la hoja Tablas_Forma_Pago (normalmente ya revisado/
    corregido a mano por contabilidad) y le agrega los bloques resumen PUE
    (columnas P-R) y PPD (columnas T-V) — ver agregar_pue_ppd_tablas_forma_pago
    en excel_processor.py para el detalle de la regla — devolviendo el mismo
    archivo con esas columnas agregadas.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        excel_bytes = await agregar_pue_ppd_tablas_forma_pago(contenido)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error agregando PUE/PPD a Tablas_Forma_Pago")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Tablas_Forma_Pago_PUE_PPD.xlsx"},
    )


def _fila_tabla_forma_pago_a_dict(fila: FacturacionTablaFormaPagoDetalle) -> dict:
    return {
        "id": fila.id,
        "periodo": fila.periodo,
        "tabla_origen": fila.tabla_origen,
        "categoria_pue_ppd": fila.categoria_pue_ppd,
        "revision": fila.revision,
        "fecha_texto": fila.fecha_texto,
        "pos": fila.pos,
        "forma_de_pago": fila.forma_de_pago,
        "cuenta": fila.cuenta,
        "subtotal": fila.subtotal,
        "descuento": fila.descuento,
        "gravado": fila.gravado,
        "ingtasa_0": fila.ingtasa_0,
        "desc_tasa_0": fila.desc_tasa_0,
        "subtasa_0": fila.subtasa_0,
        "iva": fila.iva,
        "propina": fila.propina,
        "pago_proveedor": fila.pago_proveedor,
        "total": fila.total,
        "fila_excel": fila.fila_excel,
        "creado_en": fila.creado_en.isoformat() if fila.creado_en else None,
    }


@router.post("/tablas-forma-pago/guardar")
async def guardar_tablas_forma_pago(
    archivo: UploadFile = File(..., description="Excel de Tablas_Forma_Pago ya corregido a mano por contabilidad (el mismo del Paso 2)"),
    periodo: str = Form(..., description="Periodo capturado a mano por el usuario, ej. 'Agosto 2026' — el archivo no trae uno confiable"),
    confirmar_reemplazo: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Guarda en base de datos el detalle completo (las 15 columnas de
    Tablas_Forma_Pago) de cada cuenta de las 7 tablas, para el periodo
    indicado — pensado para el momento en que el usuario ya subió el
    archivo corregido para el "Paso 2" (/agregar-pue-ppd) y sus montos ya
    están cuadrados. Acción independiente de ese endpoint: no lo modifica
    ni depende de haberlo llamado antes.

    Si ya había filas guardadas para ese periodo y el body no trae
    `confirmar_reemplazo=true`, no borra nada — regresa
    `requiere_confirmacion` para que el frontend le pregunte al usuario
    antes de reemplazar (mismo patrón que /pagos-recepcion/pagos-del-mes).
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        filas = leer_filas_completas_tablas_forma_pago(contenido)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error leyendo Tablas_Forma_Pago para guardar")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not confirmar_reemplazo:
        res_conteo = await db.execute(
            select(func.count())
            .select_from(FacturacionTablaFormaPagoDetalle)
            .where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
        )
        filas_existentes = res_conteo.scalar_one()
        if filas_existentes > 0:
            return {"requiere_confirmacion": True, "filas_existentes": filas_existentes}

    registros = filas_a_registros_tabla_forma_pago(filas, periodo)

    await db.execute(
        delete(FacturacionTablaFormaPagoDetalle).where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
    )

    por_tabla: dict[str, int] = {}
    for registro in registros:
        db.add(FacturacionTablaFormaPagoDetalle(**registro))
        por_tabla[registro["tabla_origen"]] = por_tabla.get(registro["tabla_origen"], 0) + 1

    await db.commit()

    return {"periodo": periodo, "total": len(registros), "por_tabla": por_tabla}


@router.get("/tablas-forma-pago/periodos")
async def listar_periodos_tablas_forma_pago(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa los periodos guardados de Tablas_Forma_Pago, con el número de filas de cada uno."""
    res = await db.execute(
        select(FacturacionTablaFormaPagoDetalle.periodo, func.count())
        .group_by(FacturacionTablaFormaPagoDetalle.periodo)
        .order_by(FacturacionTablaFormaPagoDetalle.periodo)
    )
    return {"periodos": [{"periodo": periodo, "total": total} for periodo, total in res.all()]}


@router.get("/tablas-forma-pago")
async def obtener_tablas_forma_pago(
    periodo: str | None = Query(default=None, description="Filtrar por un día exacto"),
    mes: str | None = Query(default=None, description="Filtrar por mes (prefijo YYYY-MM) — para buscar a través de varios días"),
    tabla_origen: str | None = Query(default=None, description="Filtrar por tabla de origen (ej. 'EFECTIVO', 'HUÉSPED')"),
    q: str | None = Query(default=None, description="Texto libre: busca en Cuenta, POS y Forma de Pago (sin importar mayúsculas)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Regresa las filas guardadas de Tablas_Forma_Pago, opcionalmente
    filtradas por día (`periodo`), mes (`mes`), tabla de origen, y/o texto
    libre (`q`, contra Cuenta/POS/Forma de Pago) — `q` permite buscar una
    cuenta sin saber de antemano en qué día está, a través de todos los
    días guardados (opcionalmente acotado a un mes con `mes`).
    """
    consulta = select(FacturacionTablaFormaPagoDetalle)
    if periodo:
        consulta = consulta.where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
    if mes:
        # Los "periodo" son strings YYYY-MM-DD escritos únicamente por este
        # sistema (siempre vía DateInput, nunca texto libre de usuario), así
        # que un LIKE de prefijo aquí es seguro (mismo criterio que /export).
        consulta = consulta.where(FacturacionTablaFormaPagoDetalle.periodo.like(f"{mes}%"))
    if tabla_origen:
        consulta = consulta.where(FacturacionTablaFormaPagoDetalle.tabla_origen == tabla_origen)
    if q:
        patron = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(
                func.lower(FacturacionTablaFormaPagoDetalle.cuenta).like(patron),
                func.lower(FacturacionTablaFormaPagoDetalle.pos).like(patron),
                func.lower(FacturacionTablaFormaPagoDetalle.forma_de_pago).like(patron),
            )
        )
    consulta = consulta.order_by(
        FacturacionTablaFormaPagoDetalle.periodo,
        FacturacionTablaFormaPagoDetalle.tabla_origen,
        FacturacionTablaFormaPagoDetalle.cuenta,
    )

    res = await db.execute(consulta)
    filas = res.scalars().all()
    return {"total": len(filas), "filas": [_fila_tabla_forma_pago_a_dict(f) for f in filas]}


@router.get("/tablas-forma-pago/export")
async def exportar_tablas_forma_pago(
    periodo: str | None = Query(default=None, description="Exportar solo este día"),
    mes: str | None = Query(default=None, description="Exportar todo este mes (prefijo YYYY-MM)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta a Excel el detalle guardado de Tablas_Forma_Pago, filtrado por
    un día exacto (`periodo`) o por un mes completo (`mes`, prefijo
    YYYY-MM) — se necesita exactamente uno de los dos. Una sola hoja
    agrupada por día con subtotal y TOTAL GENERAL (ver
    generar_reporte_tablas_forma_pago_guardado_excel).
    """
    if not periodo and not mes:
        raise HTTPException(status_code=400, detail="Debes indicar 'periodo' o 'mes'")

    consulta = select(FacturacionTablaFormaPagoDetalle)
    if periodo:
        consulta = consulta.where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
    else:
        # Los "periodo" son strings YYYY-MM-DD escritos únicamente por este
        # sistema (siempre vía DateInput, nunca texto libre de usuario), así
        # que un LIKE de prefijo aquí es seguro.
        consulta = consulta.where(FacturacionTablaFormaPagoDetalle.periodo.like(f"{mes}%"))
    consulta = consulta.order_by(FacturacionTablaFormaPagoDetalle.periodo, FacturacionTablaFormaPagoDetalle.tabla_origen)

    res = await db.execute(consulta)
    filas = [_fila_tabla_forma_pago_a_dict(f) for f in res.scalars().all()]

    excel_bytes = generar_reporte_tablas_forma_pago_guardado_excel(filas)
    nombre_archivo = f"Tablas_Forma_Pago_{periodo or mes}.xlsx"

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )


@router.get("/tablas-forma-pago/export-categoria")
async def exportar_categoria_tablas_forma_pago(
    mes: str = Query(..., description="Mes a exportar (prefijo YYYY-MM)"),
    tabla_origen: str = Query(..., description="Categoría a exportar, ej. 'TUSOSA', 'VISA / MASTERCARD'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Exporta a Excel todas las cuentas de UNA categoría (tabla_origen) para
    un mes — desde el botón de exportar de cada fila en "Resumen por
    categoría" (pestaña Análisis). Tabla plana con Fecha (ver
    generar_reporte_categoria_tabla_forma_pago_excel), no dividida por día
    como /export. Si la categoría no tuvo movimientos ese mes, igual
    genera el archivo (título + fila TOTAL en cero) — no es un error.
    """
    consulta = (
        select(FacturacionTablaFormaPagoDetalle)
        .where(FacturacionTablaFormaPagoDetalle.periodo.like(f"{mes}%"))
        .where(FacturacionTablaFormaPagoDetalle.tabla_origen == tabla_origen)
        .order_by(FacturacionTablaFormaPagoDetalle.periodo, FacturacionTablaFormaPagoDetalle.cuenta)
    )
    res = await db.execute(consulta)
    filas = [_fila_tabla_forma_pago_a_dict(f) for f in res.scalars().all()]

    excel_bytes = generar_reporte_categoria_tabla_forma_pago_excel(tabla_origen, filas)
    nombre_archivo = f"Tablas_Forma_Pago_{tabla_origen}_{mes}.xlsx".replace(" ", "_").replace("/", "-")

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=cabecera_descarga(nombre_archivo),
    )


@router.delete("/tablas-forma-pago")
async def eliminar_periodo_tablas_forma_pago(
    periodo: str = Query(..., description="Periodo a eliminar"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Elimina todas las filas guardadas de Tablas_Forma_Pago para un periodo
    (ej. uno guardado por error o de prueba) — incluidas las facturas
    sueltas registradas ese día (FacturacionFacturaAdjunta) y sus archivos
    en disco, si tenían: los DELETE de abajo borran por SQL directo (sin
    pasar por instancias ORM), así que hay que borrar los archivos aparte,
    de lo contrario quedan huérfanos en storage/ para siempre.
    """
    res_facturas = await db.execute(
        select(FacturacionFacturaAdjunta).where(FacturacionFacturaAdjunta.periodo == periodo)
    )
    for factura in res_facturas.scalars().all():
        eliminar_adjunto_factura(factura.xml_ruta)
        eliminar_adjunto_factura(factura.pdf_ruta)
    await db.execute(delete(FacturacionFacturaAdjunta).where(FacturacionFacturaAdjunta.periodo == periodo))

    res_conteo = await db.execute(
        select(func.count())
        .select_from(FacturacionTablaFormaPagoDetalle)
        .where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
    )
    eliminados = res_conteo.scalar_one()

    await db.execute(
        delete(FacturacionTablaFormaPagoDetalle).where(FacturacionTablaFormaPagoDetalle.periodo == periodo)
    )
    await db.commit()

    return {"periodo": periodo, "eliminados": eliminados}


# ── Facturas del día (registro suelto de XML/PDF, sin amarrar a cuenta) ──

_TIPOS_ADJUNTO_FACTURA = ("xml", "pdf")
_MEDIA_TYPE_POR_TIPO_ADJUNTO = {"xml": "application/xml", "pdf": "application/pdf"}
_TAMANO_MAXIMO_ADJUNTO_BYTES = 15 * 1024 * 1024  # 15 MB — tope defensivo, un CFDI real pesa mucho menos


def _factura_dia_a_dict(factura: FacturacionFacturaAdjunta) -> dict:
    return {
        "id": factura.id,
        "periodo": factura.periodo,
        "xml_nombre_original": factura.xml_nombre_original,
        "xml_tamano_bytes": factura.xml_tamano_bytes,
        "pdf_nombre_original": factura.pdf_nombre_original,
        "pdf_tamano_bytes": factura.pdf_tamano_bytes,
        "creado_en": factura.creado_en.isoformat() if factura.creado_en else None,
    }


@router.post("/tablas-forma-pago/facturas-dia")
async def registrar_factura_dia(
    periodo: str = Form(..., description="Día al que pertenece esta factura"),
    xml: UploadFile | None = File(default=None, description="XML del CFDI"),
    pdf: UploadFile | None = File(default=None, description="PDF del CFDI"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Registra una factura suelta (XML y/o PDF) para un día — sin amarrarla a
    ninguna cuenta de las 7 tablas, solo como constancia de que ese día se
    facturó algo (un día puede tener varias, normalmente hasta 4). Los
    archivos se escriben en disco (ver guardar_adjunto_factura en
    services/facturacion.py) — la base de datos solo guarda la ruta relativa
    y metadata de exhibición (nombre original, tamaño), nunca el binario:
    así el .sqlite3 no crece ni se vuelve lento sin importar cuántas
    facturas se acumulen.
    """
    if xml is None and pdf is None:
        raise HTTPException(status_code=400, detail="Debes subir al menos un archivo (xml o pdf)")

    for tipo, archivo in (("xml", xml), ("pdf", pdf)):
        if archivo is not None and not archivo.filename.lower().endswith(f".{tipo}"):
            raise HTTPException(status_code=400, detail=f"El archivo de {tipo} debe tener extensión .{tipo}")

    factura = FacturacionFacturaAdjunta(periodo=periodo)
    db.add(factura)
    await db.flush()  # necesitamos factura.id (autoincrement) antes de escribir los archivos en disco

    for tipo, archivo in (("xml", xml), ("pdf", pdf)):
        if archivo is None:
            continue
        contenido = await archivo.read()
        if len(contenido) > _TAMANO_MAXIMO_ADJUNTO_BYTES:
            raise HTTPException(status_code=400, detail=f"El archivo {archivo.filename} excede el tamaño máximo permitido (15 MB)")

        ruta_relativa = guardar_adjunto_factura(factura.id, tipo, contenido)
        setattr(factura, f"{tipo}_ruta", ruta_relativa)
        setattr(factura, f"{tipo}_nombre_original", archivo.filename)
        setattr(factura, f"{tipo}_tamano_bytes", len(contenido))

    await db.commit()
    await db.refresh(factura)

    return _factura_dia_a_dict(factura)


@router.get("/tablas-forma-pago/facturas-dia")
async def listar_facturas_dia(
    periodo: str = Query(..., description="Día del que se listan las facturas registradas"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lista las facturas sueltas registradas para un día."""
    res = await db.execute(
        select(FacturacionFacturaAdjunta)
        .where(FacturacionFacturaAdjunta.periodo == periodo)
        .order_by(FacturacionFacturaAdjunta.creado_en)
    )
    facturas = res.scalars().all()
    return {"total": len(facturas), "facturas": [_factura_dia_a_dict(f) for f in facturas]}


async def _obtener_factura_dia_o_404(db: AsyncSession, factura_id: int) -> FacturacionFacturaAdjunta:
    factura = await db.get(FacturacionFacturaAdjunta, factura_id)
    if factura is None:
        raise HTTPException(status_code=404, detail="No se encontró esa factura registrada")
    return factura


@router.get("/tablas-forma-pago/facturas-dia/{factura_id}/{tipo}")
async def descargar_factura_dia(
    factura_id: int,
    tipo: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Descarga el XML o PDF de una factura registrada — se sirve desde disco por streaming, sin cargarlo completo a memoria."""
    if tipo not in _TIPOS_ADJUNTO_FACTURA:
        raise HTTPException(status_code=400, detail="'tipo' debe ser 'xml' o 'pdf'")

    factura = await _obtener_factura_dia_o_404(db, factura_id)
    ruta_relativa = getattr(factura, f"{tipo}_ruta")
    nombre_original = getattr(factura, f"{tipo}_nombre_original")
    if not ruta_relativa:
        raise HTTPException(status_code=404, detail=f"Esta factura no tiene un adjunto de tipo {tipo}")

    ruta_absoluta = ruta_absoluta_adjunto(ruta_relativa)
    if not ruta_absoluta.exists():
        raise HTTPException(status_code=404, detail="El archivo adjunto ya no existe en el servidor")

    return FileResponse(
        ruta_absoluta,
        media_type=_MEDIA_TYPE_POR_TIPO_ADJUNTO[tipo],
        filename=nombre_original or ruta_absoluta.name,
    )


@router.delete("/tablas-forma-pago/facturas-dia/{factura_id}")
async def eliminar_factura_dia(
    factura_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Elimina un registro de factura del día completo (XML y PDF en disco, si existían, + la fila)."""
    factura = await _obtener_factura_dia_o_404(db, factura_id)
    eliminar_adjunto_factura(factura.xml_ruta)
    eliminar_adjunto_factura(factura.pdf_ruta)

    await db.delete(factura)
    await db.commit()

    return {"id": factura_id, "eliminado": True}


@router.get("/tablas-forma-pago/analitica")
async def analitica_tablas_forma_pago(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Analítica de Tablas_Forma_Pago guardado: una fila por día (periodo) con
    su total, desglose por tabla de origen (ver CLAVE_ANALITICA_POR_TABLA,
    monto + número de cuentas por tabla) y desglose PUE/PPD — el frontend
    agrupa esta serie por mes (mismo patrón que /pagos-recepcion/analitica).
    Una sola consulta agregada por (periodo, tabla_origen, categoria_pue_ppd)
    para evitar N+1.
    """
    res = await db.execute(
        select(
            FacturacionTablaFormaPagoDetalle.periodo,
            FacturacionTablaFormaPagoDetalle.tabla_origen,
            FacturacionTablaFormaPagoDetalle.categoria_pue_ppd,
            func.sum(FacturacionTablaFormaPagoDetalle.subtotal),
            func.sum(FacturacionTablaFormaPagoDetalle.iva),
            func.sum(FacturacionTablaFormaPagoDetalle.propina),
            func.sum(FacturacionTablaFormaPagoDetalle.total),
            func.count(),
        ).group_by(
            FacturacionTablaFormaPagoDetalle.periodo,
            FacturacionTablaFormaPagoDetalle.tabla_origen,
            FacturacionTablaFormaPagoDetalle.categoria_pue_ppd,
        )
    )

    por_dia: dict[str, dict] = {}
    for periodo, tabla_origen, categoria, subtotal, iva, propina, total, conteo in res.all():
        dia = por_dia.setdefault(
            periodo,
            {
                "periodo": periodo,
                "total": 0.0,
                "subtotal": 0.0,
                "iva": 0.0,
                "propina": 0.0,
                "pue": 0.0,
                "ppd": 0.0,
                **{clave: 0.0 for clave in CLAVE_ANALITICA_POR_TABLA.values()},
                **{f"{clave}_cuentas": 0 for clave in CLAVE_ANALITICA_POR_TABLA.values()},
            },
        )
        dia["total"] += total or 0.0
        dia["subtotal"] += subtotal or 0.0
        dia["iva"] += iva or 0.0
        dia["propina"] += propina or 0.0

        clave_tabla = CLAVE_ANALITICA_POR_TABLA.get(tabla_origen)
        if clave_tabla:
            dia[clave_tabla] += total or 0.0
            dia[f"{clave_tabla}_cuentas"] += conteo or 0
        if categoria == "PUE":
            dia["pue"] += total or 0.0
        elif categoria == "PPD":
            dia["ppd"] += total or 0.0

    serie_diaria = [
        {clave: (round(valor, 2) if isinstance(valor, float) else valor) for clave, valor in dia.items()}
        for dia in sorted(por_dia.values(), key=lambda d: d["periodo"])
    ]

    dias_registrados = len(serie_diaria)
    total_historico = sum(dia["total"] for dia in serie_diaria)
    mes_actual = date.today().strftime("%Y-%m")
    total_mes_actual = sum(dia["total"] for dia in serie_diaria if dia["periodo"].startswith(mes_actual))
    iva_total_historico = sum(dia["iva"] for dia in serie_diaria)

    kpis = {
        "dias_registrados": dias_registrados,
        "total_historico": round(total_historico, 2),
        "total_mes_actual": round(total_mes_actual, 2),
        "promedio_diario": round(total_historico / dias_registrados, 2) if dias_registrados else 0.0,
        "iva_total_historico": round(iva_total_historico, 2),
    }

    return {"serie_diaria": serie_diaria, "kpis": kpis}


@router.get("/tablas-forma-pago/ventas-por-pos")
async def ventas_por_pos_tablas_forma_pago(
    mes: str = Query(..., description="Mes a consultar (prefijo YYYY-MM)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Agrega el mes indicado por los 7 puntos de venta fijos de
    PUNTOS_VENTA_ANALITICA (ver services/facturacion.py) — cualquier otro
    POS no listado queda fuera a propósito, no es un desglose completo.
    Excluye las filas de la tabla CORTESÍA: una cuenta de cortesía puede
    tener cualquier POS (ej. "LA HACIENDA"), pero al ser gratuita no
    representa una ganancia real para la empresa — no debe inflar el
    ingreso de ningún punto de venta en esta gráfica. Una sola consulta
    agregada por `pos` (no por cuenta, evita traer miles de filas); la
    clasificación en buckets ocurre en Python sobre ese resultado ya
    reducido a ~decenas de valores distintos de POS.
    """
    res = await db.execute(
        select(
            FacturacionTablaFormaPagoDetalle.pos,
            func.sum(FacturacionTablaFormaPagoDetalle.gravado),
            func.sum(FacturacionTablaFormaPagoDetalle.subtasa_0),
            func.sum(FacturacionTablaFormaPagoDetalle.total),
        )
        .where(FacturacionTablaFormaPagoDetalle.periodo.like(f"{mes}%"))
        .where(FacturacionTablaFormaPagoDetalle.tabla_origen != "CORTESÍA")
        .group_by(FacturacionTablaFormaPagoDetalle.pos)
    )

    montos_por_clave: dict[str, float] = {clave: 0.0 for clave, _e, _s, _m in PUNTOS_VENTA_ANALITICA}
    for pos, gravado, subtasa_0, total in res.all():
        clave = clasificar_pos_en_punto_venta(pos)
        if clave is None:
            continue
        metrica = next(m for c, _e, _s, m in PUNTOS_VENTA_ANALITICA if c == clave)
        if metrica == "ingreso_real":
            montos_por_clave[clave] += (gravado or 0.0) + (subtasa_0 or 0.0)
        else:
            montos_por_clave[clave] += total or 0.0

    puntos_venta = [
        {"clave": clave, "etiqueta": etiqueta, "monto": round(montos_por_clave[clave], 2), "metrica": metrica}
        for clave, etiqueta, _substrings, metrica in PUNTOS_VENTA_ANALITICA
    ]

    return {"mes": mes, "puntos_venta": puntos_venta}


def _fila_balanza_a_dict(fila: BalanzaCuenta) -> dict:
    return {
        "id": fila.id,
        "codigo_cuenta": fila.codigo_cuenta,
        "descripcion": fila.descripcion,
        "saldo_anterior": fila.saldo_anterior,
        "debitos_mes": fila.debitos_mes,
        "creditos_mes": fila.creditos_mes,
        "saldo_mes": fila.saldo_mes,
        "saldo_actual": fila.saldo_actual,
        "actualizado_en": fila.actualizado_en.isoformat() if fila.actualizado_en else None,
    }


@router.post("/balanza/guardar")
async def guardar_balanza(
    archivo: UploadFile = File(..., description="Excel de la balanza contable (Código Cuenta, Descripción, Saldo Ant, Débitos Mes, Créditos Mes, Saldo Mes, Saldo Actual)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Reemplaza por completo la balanza vigente con el contenido del Excel
    subido — a diferencia de /tablas-forma-pago/guardar, aquí no se guarda
    historial por periodo: solo importa la balanza más reciente, así que
    siempre se borra todo antes de insertar, sin necesidad de
    `confirmar_reemplazo`.
    """
    if not archivo.filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contenido = await archivo.read()

    try:
        registros = leer_excel_balanza(contenido)
    except Exception as e:
        logger.exception("Error leyendo la balanza")
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

    if not registros:
        raise HTTPException(status_code=400, detail="No se encontraron cuentas en el archivo")

    await db.execute(delete(BalanzaCuenta))
    for registro in registros:
        db.add(BalanzaCuenta(**registro))
    await db.commit()

    return {"total": len(registros)}


@router.get("/balanza")
async def obtener_balanza(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Regresa la balanza vigente completa, ordenada por Código Cuenta."""
    res = await db.execute(select(BalanzaCuenta).order_by(BalanzaCuenta.codigo_cuenta))
    filas = res.scalars().all()
    actualizado_en = max((f.actualizado_en for f in filas), default=None)
    return {
        "total": len(filas),
        "actualizado_en": actualizado_en.isoformat() if actualizado_en else None,
        "cuentas": [_fila_balanza_a_dict(f) for f in filas],
    }


@router.get("/balanza/detalle-punto-venta")
async def detalle_balanza_punto_venta(
    punto_venta: str = Query(..., description="Clave del punto de venta, ej. 'hacienda' (ver PUNTOS_VENTA_ANALITICA)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Desglose "Balanza vs Ventas por punto de venta": para el punto de venta
    indicado, suma las cuentas fijas de MAPEO_BALANZA_POR_PUNTO_VENTA
    (services/facturacion.py) tal como están en la balanza vigente. Regresa
    `{"disponible": false}` si ese punto de venta todavía no tiene mapeo
    definido, en vez de un error — se van agregando uno por uno.
    """
    codigos = {codigo for _grupo, codigo, _etiqueta in MAPEO_BALANZA_POR_PUNTO_VENTA.get(punto_venta, [])}
    if not codigos:
        return {"disponible": False}

    res = await db.execute(select(BalanzaCuenta).where(BalanzaCuenta.codigo_cuenta.in_(codigos)))
    cuentas_balanza = [{"codigo_cuenta": c.codigo_cuenta, "saldo_mes": c.saldo_mes} for c in res.scalars().all()]

    return calcular_detalle_balanza_punto_venta(punto_venta, cuentas_balanza)
