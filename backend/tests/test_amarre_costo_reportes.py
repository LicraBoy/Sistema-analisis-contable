"""
Tests de `amarre_costo_reportes.py` — construyen un `AmarreCostoPeriodo` sin
persistirlo (mismo patrón "construir sin persistir" que
`test_conciliacion_ventas_diarias.py`) y verifican que los 3 reportes
calculan igual que los valores reales confirmados en
`INVETARIOS/CIERRE DE INVENTARIOS CORRECTO GENERAL AGOSTO 2026.xlsx`
(agosto 2026) — es un caso de regresión contra un archivo real, no solo
datos sintéticos.
"""

import pytest

from app.models import AmarreCostoPeriodo
from app.services.amarre_costo_reportes import (
    CONCEPTOS_RESUMEN_INV,
    construir_amarre_costo,
    construir_comparacion_balanza_2,
    construir_datos_entrysal,
    construir_resumen_inv,
)


def _periodo_agosto_2026() -> AmarreCostoPeriodo:
    """
    Valores reales confirmados de agosto 2026 (los ya validados por el
    parser en `test_amarre_costo_parsing.py`), armados directamente sobre
    el modelo para aislar el cálculo de reportes del parsing.

    `entrysal_despacho_gasto`/`entrysal_despacho_centro_costo` son los
    valores CRUDOS de sus etiquetas ("Total General DESPACHOS..." y "Total
    de DESPACHOS a CENTRO DE COSTO:") — el "Despacho a Gasto" que muestra
    2DATOS ENTRYSAL es su resta (946,324.67), no `entrysal_despacho_gasto`
    solo (ver `construir_datos_entrysal`).
    """
    return AmarreCostoPeriodo(
        periodo="2026-08",
        inv_inicial_alm_gral=2689006.89, inv_inicial_tienda=476288.54,
        inv_inicial_restaurant=108316.84, inv_inicial_bar=73140.92, inv_inicial_cafeteria=29997.74,
        inv_final_alm_gral=2490217.59, inv_final_restaurant=110525.50, inv_final_bar=75131.34,
        inv_final_cafeteria=25818.47, inv_final_tienda=434554.94, inv_final_mantenimiento=None,
        entrysal_despacho_gasto=1708188.40, entrysal_despacho_centro_costo=761863.73, entrysal_despacho_mtto=725226.35,
        entrysal_cafeteria_alimentos=93245.75, entrysal_cafeteria_bebidas=None,
        entrysal_souvenirs_cafe=1111.76, entrysal_carreta_alimentos=34012.83,
        entrysal_carreta_bebidas=33460.41, entrysal_restaurant=324344.77,
        entrysal_palapa_bar=152618.71, entrysal_tienda=123069.50,
        ent_alm_gral_subtotal=1509472.41, ent_alm_gral_descuento=0.0, ent_alm_gral_iva=133460.21, ent_alm_gral_total=1642932.62,
        ent_tienda_subtotal=220301.39, ent_tienda_descuento=0.0, ent_tienda_iva=7044.45, ent_tienda_total=227345.84,
        ent_mtto_subtotal=725226.14, ent_mtto_descuento=0.0, ent_mtto_iva=112867.20, ent_mtto_total=838093.34,
        ent_cafeteria_subtotal=6716.96, ent_cafeteria_descuento=0.0, ent_cafeteria_iva=0.0, ent_cafeteria_total=6716.96,
        ent_rest_subtotal=155437.76, ent_rest_descuento=0.0, ent_rest_iva=0.0, ent_rest_total=155437.76,
        saldo_contable_alm_gral=2689006.89, saldo_contable_tienda=476288.54,
        saldo_contable_restaurant=108316.84, saldo_contable_bar=73140.92, saldo_contable_cafeteria=29997.74,
        resumen_lavanderia=None,
        archivos_cargados="",
    )


def test_construir_amarre_costo_almacen_general():
    """
    Alm. Gral: inventario en libros = inicial + entradas - salidas; la
    diferencia contra el inventario final es el producto del reporte, no
    ruido a descartar. `salidas_traspasos` reproduce la fórmula real
    confirmada (E19 del libro maestro): despacho_gasto + despacho_mtto −
    entradas_mtto = 1,708,188.61 (no 1,744,825.78, que era el resultado de
    una fórmula incorrecta descartada durante el desarrollo).
    """
    reporte = construir_amarre_costo(_periodo_agosto_2026(), consignacion=[])
    linea_alm_gral = next(l for l in reporte["lineas"] if l["almacen"] == "Almacén General")
    assert linea_alm_gral["inventario_inicial"] == pytest.approx(2689006.89)
    assert linea_alm_gral["entradas"] == pytest.approx(1509472.41)
    assert linea_alm_gral["inventario_final"] == pytest.approx(2490217.59)
    assert linea_alm_gral["salidas_traspasos"] == pytest.approx(1708188.61, abs=0.01)
    assert linea_alm_gral["inventario_en_libros"] == linea_alm_gral["inventario_inicial"] + linea_alm_gral["entradas"] - linea_alm_gral["salidas_traspasos"]
    assert linea_alm_gral["diferencia_costo_ventas"] == pytest.approx(
        linea_alm_gral["inventario_en_libros"] - linea_alm_gral["inventario_final"]
    )
    # Caso de regresión: contra el libro maestro real, la diferencia es de
    # apenas $73.10 (redondeo/ajustes menores) — un resultado de cientos de
    # miles de pesos de diferencia indica que la fórmula de salidas volvió
    # a romperse.
    assert abs(linea_alm_gral["diferencia_costo_ventas"]) < 100


def test_construir_amarre_costo_restaurant_suma_traspasos_como_entrada():
    """
    Para un almacén satélite (Restaurant), el traspaso recibido desde
    Almacén General se SUMA (no se resta) al calcular el inventario en
    libros — confirmado con el libro maestro real.
    """
    reporte = construir_amarre_costo(_periodo_agosto_2026(), consignacion=[])
    linea_restaurant = next(l for l in reporte["lineas"] if l["almacen"] == "Restaurant")
    assert linea_restaurant["inventario_en_libros"] == pytest.approx(622112.20)
    assert linea_restaurant["diferencia_costo_ventas"] == pytest.approx(511586.70, abs=0.01)


def test_construir_amarre_costo_mantenimiento_sin_inventario_final_queda_none():
    """El hueco manual (inv_final_mantenimiento) nunca se calcula en 0 por defecto: queda None si no se ha capturado."""
    reporte = construir_amarre_costo(_periodo_agosto_2026(), consignacion=[])
    linea_mtto = next(l for l in reporte["lineas"] if l["almacen"] == "Mantenimiento")
    assert linea_mtto["inventario_final"] is None


def test_construir_datos_entrysal_totales():
    """
    "Almacén General a Gasto" mostrado en el reporte es el NETO (Total
    General − Total Centro de Costo = 946,324.67), no el valor crudo de
    `entrysal_despacho_gasto` (1,708,188.40) — confirmado contra el libro
    maestro real (2DATOS ENTRYSAL!D8).
    """
    reporte = construir_datos_entrysal(_periodo_agosto_2026())
    assert reporte["despachos"]["almacen_general_a_gasto"] == pytest.approx(946324.67, abs=0.01)
    assert reporte["despachos_a_centros_de_costo"]["total"] == pytest.approx(761863.73)
    # Cafetería Bebidas es un hueco real (sin sección en el reporte de salidas) -> None, nunca 0 inventado en silencio.
    assert reporte["despachos_a_centros_de_costo"]["cafeteria_bebidas"] is None


def test_construir_resumen_inv_diferencias_por_almacen():
    reporte = construir_resumen_inv(_periodo_agosto_2026(), consignacion=[])
    alm_gral = next(a for a in reporte["almacenes"] if a["almacen"] == "Almacén General")
    assert alm_gral["diferencia"] == pytest.approx(alm_gral["saldo_real"] - alm_gral["saldo_contable"])
    assert reporte["huecos"]["fichas_lavanderia"] is None
    assert reporte["huecos"]["mercancia_consignacion"] == 0


def test_construir_comparacion_balanza_2_cruza_por_codigo_y_marca_diferencias():
    periodo = _periodo_agosto_2026()
    # `_periodo_agosto_2026()` no fija los campos por concepto (alm_gral_*,
    # tienda_*, etc.), que solo llevan default a nivel de columna de DB, no
    # en memoria — se fijan en 0.0 aquí para poder comparar contra una
    # balanza 2 sintética sin que `getattr` regrese None.
    for _, _, campo in CONCEPTOS_RESUMEN_INV:
        if campo:
            setattr(periodo, campo, 0.0)
    periodo.alm_gral_alimentos = 1437336.39
    periodo.alm_gral_tabaqueria = 12345.0
    periodo.alm_gral_papeleria = 6789.0
    # alm_gral_alimentos coincide con lo que el "Saldo Real" ya guarda; el
    # código de tabaquería trae una diferencia real de $50; el resto de
    # códigos de la lista no aparece en esta balanza 2 sintética.
    balanza_2 = {
        "1007101.001": {"descripcion": "ALIMENTOS", "saldo_anterior": 0.0, "saldo_actual": periodo.alm_gral_alimentos},
        "1007101.003": {"descripcion": "TABAQUERIA", "saldo_anterior": 0.0, "saldo_actual": periodo.alm_gral_tabaqueria + 50},
    }
    renglones = construir_comparacion_balanza_2(periodo, balanza_2)

    assert len(renglones) == 23  # los mismos 23 conceptos de "4Resumen INV"

    alimentos = next(r for r in renglones if r["codigo"] == "1007101.001")
    assert alimentos["diferencia"] == pytest.approx(0.0)
    assert alimentos["cuadra"] is True

    tabaqueria = next(r for r in renglones if r["codigo"] == "1007101.003")
    assert tabaqueria["diferencia"] == pytest.approx(50.0)
    assert tabaqueria["cuadra"] is False

    # Código ausente en la balanza 2 sintética: cae a 0.0 sin romper (mismo
    # contrato que `buscar_en_balanza`), nunca lanza.
    papeleria = next(r for r in renglones if r["codigo"] == "1007101.004")
    assert papeleria["balanza_2"] == 0.0
    assert papeleria["saldo_real"] == pytest.approx(periodo.alm_gral_papeleria)

    # Cafetería Bebidas: campo=None en la lista de conceptos, saldo_real
    # siempre 0 (sin fuente en el reporte, ver CONCEPTOS_RESUMEN_INV).
    cafeteria_bebidas = next(r for r in renglones if r["codigo"] == "1007108.002")
    assert cafeteria_bebidas["saldo_real"] == 0.0
