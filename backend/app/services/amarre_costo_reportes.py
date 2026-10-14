"""
Amarre de Costo de Ventas — cálculo puro de los 3 reportes finales (Amarre
COSTO, 2DATOS ENTRYSAL, 4Resumen INV) a partir de un `AmarreCostoPeriodo` ya
parseado y persistido. Sin DB ni Excel aquí — mismo principio de "servicios
puros" que el resto del sistema (ver CLAUDE.md, Análisis y Profundidad).

Las fórmulas de "Amarre COSTO" están tomadas literalmente del libro maestro
real (`INVETARIOS/CIERRE DE INVENTARIOS CORRECTO GENERAL AGOSTO 2026.xlsx`,
hoja "Amarre COSTO", filas 18-24), no reinventadas: para Almacén General, la
columna "Salidas/Traspasos" es lo que SALIÓ de ese almacén (se resta); para
Restaurant/Bar/Cafetería/Tienda, esa misma columna es lo que RECIBIERON como
traspaso desde Almacén General (se suma) — confirmado con los valores reales
de agosto 2026 (ej. Restaurant: inventario en libros = inicial + entradas +
traspasos recibidos, no menos).

La exportación a Excel de este módulo ya no vive aquí: `generar_workbook_
amarre_costo` (en `services/amarre_costo_workbook.py`) reconstruye el libro
completo con fórmulas vivas de Excel — ver ese archivo.
"""

from app.models import AmarreCostoConsignacionRenglon, AmarreCostoPeriodo
from app.services.amarre_costo_parsing import buscar_en_balanza

# ── Conceptos de "4Resumen INV" (código de cuenta, nombre, campo del
# modelo|None) — fuente de verdad única para el detalle por concepto de la
# columna G "SALDO REAL". `amarre_costo_workbook.py::_RESUMEN_*` trae la
# misma lista con datos extra de layout de Excel (fila, e_cero); si se agrega
# o renombra un concepto aquí, hay que reflejarlo también allá (y viceversa).
CONCEPTOS_RESUMEN_INV: list[tuple[str, str, str | None]] = [
    # Almacén General
    ("1007101.001", "ALIMENTOS", "alm_gral_alimentos"),
    ("1007101.002", "BEBIDAS", "alm_gral_bebidas"),
    ("1007101.003", "TABAQUERIA", "alm_gral_tabaqueria"),
    ("1007101.004", "PAPELERIA", "alm_gral_papeleria"),
    ("1007101.005", "HIGIENICOS Y SUMINISTROS Y ART", "alm_gral_higienicos"),
    ("1007101.006", "MEDICINAS Y MEDICAMENTOS", "alm_gral_medicinas"),
    ("1007101.007", "MATERIAL PARA MANTTO", "alm_gral_material_mantto"),
    ("1007101.008", "STOCK MANTENIMIENTO", "alm_gral_stock_mantenimiento"),
    ("1007101.009", "SERVICIOS", "alm_gral_servicios"),
    ("1007101.010", "ROPA Y UNIFORMES", "alm_gral_ropa_uniformes"),
    # Tienda
    ("1007102.001", "ALIMENTOS", "tienda_alimentos"),
    ("1007102.002", "BEBIDAS", "tienda_bebidas"),
    ("1007102.003", "TABAQUERIA", "tienda_tabaqueria"),
    ("1007102.004", "PERIODICOS Y OTROS", "tienda_periodicos"),
    ("1007102.005", "HIGIENICOS Y SUM", "tienda_higienicos"),
    ("1007102.006", "MED Y MEDIC", "tienda_medicinas"),
    ("1007102.007", "ROPA", "tienda_ropa"),
    ("1007102.008", "ARTESANIAS", "tienda_artesanias"),
    # Cafetería
    ("1007108.003", "SOUVENIRS CAFETERIA", "cafeteria_souvenirs"),
    ("1007108.002", "BEBIDAS", None),  # sin sección en el reporte: saldo real siempre 0
    ("1007108.001", "ALIMENTOS", "cafeteria_alimentos"),
    # Rest-Bar
    ("1007103.001", "ALIMENTOS REST", "restaurant_alimentos"),
    ("1007103.002", "BEBIDAS BAR", "bar_bebidas"),
]


def _linea_alm_gral(p: AmarreCostoPeriodo) -> dict:
    inicial = p.inv_inicial_alm_gral
    entradas = p.ent_alm_gral_subtotal
    # "Salidas del propio Almacén General" — fórmula real confirmada contra
    # el libro maestro (agosto 2026): E19 = E9 − E18 + (E20+E21+E22+E23),
    # donde E9 = D8+D9 (despacho a gasto real + despacho mtto), D8 =
    # despacho_gasto crudo − despacho_centro_costo, E18 = entradas de
    # Mantenimiento, y (E20+E21+E22+E23) = suma de los 4 traspasos a
    # almacenes satélite — que es numéricamente IGUAL a despacho_centro_costo
    # (es la misma cifra desglosada por departamento vs. agregada), así que
    # ese término se cancela algebraicamente contra el que resta en D8:
    #   salidas = (despacho_gasto − despacho_centro_costo) + despacho_mtto
    #             − ent_mtto_subtotal + despacho_centro_costo
    #           = despacho_gasto + despacho_mtto − ent_mtto_subtotal
    # (validado: reproduce exactamente H19=73.10, la diferencia real conocida).
    salidas = p.entrysal_despacho_gasto + p.entrysal_despacho_mtto - p.ent_mtto_subtotal
    en_libros = inicial + entradas - salidas
    final = p.inv_final_alm_gral
    diferencia = en_libros - final
    return {
        "almacen": "Almacén General",
        "inventario_inicial": inicial,
        "entradas": entradas,
        "salidas_traspasos": salidas,
        "inventario_en_libros": en_libros,
        "inventario_final": final,
        "diferencia_costo_ventas": diferencia,
        "costo_contabilizado": None,
        "diferencia_a_contabilizar": None,
    }


def _linea_satelite(inicial: float, entradas: float, traspasos_recibidos: float, final: float, almacen: str) -> dict:
    en_libros = inicial + entradas + traspasos_recibidos
    diferencia = en_libros - final
    costo_contabilizado = traspasos_recibidos
    diferencia_a_contabilizar = diferencia - costo_contabilizado
    return {
        "almacen": almacen,
        "inventario_inicial": inicial,
        "entradas": entradas,
        "salidas_traspasos": traspasos_recibidos,
        "inventario_en_libros": en_libros,
        "inventario_final": final,
        "diferencia_costo_ventas": diferencia,
        "costo_contabilizado": costo_contabilizado,
        "diferencia_a_contabilizar": diferencia_a_contabilizar,
    }


def construir_amarre_costo(p: AmarreCostoPeriodo, consignacion: list[AmarreCostoConsignacionRenglon]) -> dict:
    """
    Reproduce el bloque "Determinación del Costo de Ventas" de Amarre COSTO:
    una línea por almacén + Mantenimiento, más el total de Mercancía en
    Consignación (editable a mano, ver `AmarreCostoConsignacionRenglon`).
    """
    lineas = [
        _linea_alm_gral(p),
        _linea_satelite(
            p.inv_inicial_restaurant, p.ent_rest_subtotal, p.entrysal_restaurant + p.entrysal_carreta_alimentos,
            p.inv_final_restaurant, "Restaurant",
        ),
        _linea_satelite(
            p.inv_inicial_bar, 0.0, p.entrysal_palapa_bar + p.entrysal_carreta_bebidas,
            p.inv_final_bar, "Bar",
        ),
        _linea_satelite(
            p.inv_inicial_cafeteria, p.ent_cafeteria_subtotal,
            p.entrysal_cafeteria_alimentos + (p.entrysal_cafeteria_bebidas or 0.0) + p.entrysal_souvenirs_cafe,
            p.inv_final_cafeteria, "Cafetería",
        ),
        {
            "almacen": "Tienda",
            "inventario_inicial": p.inv_inicial_tienda,
            "entradas": p.ent_tienda_subtotal,
            "salidas_traspasos": p.entrysal_tienda,
            "inventario_en_libros": p.inv_inicial_tienda + p.ent_tienda_subtotal - p.entrysal_tienda,
            "inventario_final": p.inv_final_tienda,
            "diferencia_costo_ventas": (p.inv_inicial_tienda + p.ent_tienda_subtotal - p.entrysal_tienda) - p.inv_final_tienda,
            "costo_contabilizado": p.entrysal_tienda,
            "diferencia_a_contabilizar": ((p.inv_inicial_tienda + p.ent_tienda_subtotal - p.entrysal_tienda) - p.inv_final_tienda) - p.entrysal_tienda,
        },
        {
            "almacen": "Mantenimiento",
            "inventario_inicial": 0.0,
            "entradas": p.ent_mtto_subtotal,
            "salidas_traspasos": p.ent_mtto_subtotal,  # E18 = D18 en el libro real (traspaso = mismas entradas)
            "inventario_en_libros": 0.0,
            "inventario_final": p.inv_final_mantenimiento if p.inv_final_mantenimiento is not None else None,
            "diferencia_costo_ventas": None,
            "costo_contabilizado": None,
            "diferencia_a_contabilizar": None,
        },
    ]

    total_consignacion = sum(r.monto for r in consignacion)

    totales = {
        "inventario_inicial": sum(l["inventario_inicial"] for l in lineas),
        "entradas": sum(l["entradas"] for l in lineas),
        "inventario_final": sum(l["inventario_final"] or 0.0 for l in lineas),
    }

    return {
        "lineas": lineas,
        "totales": totales,
        "consignacion": {
            "renglones": [{"id": r.id, "concepto": r.concepto, "monto": r.monto} for r in consignacion],
            "total": total_consignacion,
        },
    }


def construir_datos_entrysal(p: AmarreCostoPeriodo) -> dict:
    """Reproduce 2DATOS ENTRYSAL: despachos/salidas + entradas por almacén."""
    despacho_gasto_real = p.entrysal_despacho_gasto - p.entrysal_despacho_centro_costo
    return {
        "despachos": {
            "almacen_general_a_gasto": despacho_gasto_real,
            "mantenimiento": p.entrysal_despacho_mtto,
            "total": despacho_gasto_real + p.entrysal_despacho_mtto,
        },
        "despachos_a_centros_de_costo": {
            "cafeteria_alimentos": p.entrysal_cafeteria_alimentos,
            "cafeteria_bebidas": p.entrysal_cafeteria_bebidas,  # hueco manual, puede ser None
            "souvenir_y_cafe": p.entrysal_souvenirs_cafe,
            "carreta_alimentos": p.entrysal_carreta_alimentos,
            "carreta_bebidas": p.entrysal_carreta_bebidas,
            "restaurant": p.entrysal_restaurant,
            "palapa_bar": p.entrysal_palapa_bar,
            "tienda": p.entrysal_tienda,
            "total": (
                p.entrysal_cafeteria_alimentos
                + (p.entrysal_cafeteria_bebidas or 0.0)
                + p.entrysal_souvenirs_cafe
                + p.entrysal_carreta_alimentos
                + p.entrysal_carreta_bebidas
                + p.entrysal_restaurant
                + p.entrysal_palapa_bar
                + p.entrysal_tienda
            ),
        },
        "entradas": {
            "cafeteria": {
                "subtotal": p.ent_cafeteria_subtotal, "descuento": p.ent_cafeteria_descuento,
                "iva": p.ent_cafeteria_iva, "total": p.ent_cafeteria_total,
            },
            "alm_gral": {
                "subtotal": p.ent_alm_gral_subtotal, "descuento": p.ent_alm_gral_descuento,
                "iva": p.ent_alm_gral_iva, "total": p.ent_alm_gral_total,
            },
            "mantenimiento": {
                "subtotal": p.ent_mtto_subtotal, "descuento": p.ent_mtto_descuento,
                "iva": p.ent_mtto_iva, "total": p.ent_mtto_total,
            },
            "restaurant_bar": {
                "subtotal": p.ent_rest_subtotal, "descuento": p.ent_rest_descuento,
                "iva": p.ent_rest_iva, "total": p.ent_rest_total,
            },
            "tienda": {
                "subtotal": p.ent_tienda_subtotal, "descuento": p.ent_tienda_descuento,
                "iva": p.ent_tienda_iva, "total": p.ent_tienda_total,
            },
        },
    }


def construir_resumen_inv(p: AmarreCostoPeriodo, consignacion: list[AmarreCostoConsignacionRenglon]) -> dict:
    """
    Reproduce 4Resumen INV: Saldo Contable (misma fuente que Inventario
    Inicial de Amarre COSTO) vs Saldo Real (conteo físico) por almacén, más
    los renglones sin fuente en ningún reporte (huecos manuales).
    """
    almacenes = [
        {"almacen": "Almacén General", "saldo_contable": p.inv_inicial_alm_gral, "saldo_real": p.inv_final_alm_gral},
        {"almacen": "Tienda", "saldo_contable": p.inv_inicial_tienda, "saldo_real": p.inv_final_tienda},
        {"almacen": "Cafetería", "saldo_contable": p.inv_inicial_cafeteria, "saldo_real": p.inv_final_cafeteria},
        {"almacen": "Restaurant", "saldo_contable": p.inv_inicial_restaurant, "saldo_real": p.inv_final_restaurant},
        {"almacen": "Bar", "saldo_contable": p.inv_inicial_bar, "saldo_real": p.inv_final_bar},
    ]
    for a in almacenes:
        a["diferencia"] = a["saldo_real"] - a["saldo_contable"]

    total_consignacion = sum(r.monto for r in consignacion)

    huecos = {
        "fichas_lavanderia": p.resumen_lavanderia,
        "mercancia_consignacion": total_consignacion,
    }

    total_saldo_contable = sum(a["saldo_contable"] for a in almacenes)
    total_saldo_real = sum(a["saldo_real"] for a in almacenes)

    return {
        "almacenes": almacenes,
        "huecos": huecos,
        "totales": {
            "saldo_contable": total_saldo_contable,
            "saldo_real": total_saldo_real,
            "diferencia": total_saldo_real - total_saldo_contable,
        },
    }


def construir_comparacion_balanza_2(p: AmarreCostoPeriodo, balanza_2: dict[str, dict]) -> list[dict]:
    """
    Compara, código de cuenta por código de cuenta (`CONCEPTOS_RESUMEN_INV`,
    los mismos 23 conceptos de "4Resumen INV"), el "Saldo Real" que ya se
    tiene (Gran Total del conteo físico, guardado en `AmarreCostoPeriodo`)
    contra el "Saldo Actual" de un segundo archivo de balanza subido aparte
    — solo para detectar diferencias, no alimenta ningún otro reporte.
    Un código ausente en `balanza_2` cae a 0.0 (mismo contrato que
    `buscar_en_balanza`, nunca lanza).
    """
    renglones = []
    for codigo, nombre, campo in CONCEPTOS_RESUMEN_INV:
        saldo_real = getattr(p, campo) if campo else 0.0
        balanza_2_monto = buscar_en_balanza(codigo, balanza_2, "saldo_actual")
        diferencia = balanza_2_monto - saldo_real
        renglones.append({
            "codigo": codigo,
            "nombre": nombre,
            "saldo_real": saldo_real,
            "balanza_2": balanza_2_monto,
            "diferencia": diferencia,
            "cuadra": abs(diferencia) < 1,
        })
    return renglones
