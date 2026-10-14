"""
Regresión de la definición de "venta neta" (services/venta_neta.py) y de su
uso en Resumen Ejecutivo / Panel de Turnos / Desempeño Comercial, más el
desempate determinista de nombres duplicados en el catálogo
(services/matching_productos.py).

Contraloría: venta neta = subtotal − descuento, solo cuentas comerciales
(tipo HOTEL, segmento no de consumo interno), sin IVA ni propina.
"""

from datetime import date, time

from app.models import CatalogoProducto, ComandaEmitidaDetalle, ReciboEmitidoDetalle
from app.services.desempeno_comercial import construir_kpis_comparativos
from app.services.matching_productos import (
    clasificar_producto_contra_catalogo,
    clasificar_producto_contra_catalogo_detallado,
)
from app.services.panel_turnos import construir_comparativo_turnos
from app.services.ranking_productos import construir_ranking_productos
from app.services.resumen_ejecutivo import (
    calcular_kpis,
    construir_conciliacion_ventas,
    construir_serie_diaria,
)
from app.services.venta_neta import (
    AL_COSTO,
    COMERCIAL,
    CONSUMO_INTERNO,
    CORTESIA,
    OTRO,
    clasificar_recibo,
    resumir_ventas,
    venta_neta_de,
)


def _recibo(cuenta, subtotal, tipo="HOTEL", segmento=None, descuento=0.0, tax=0.0, propina=0.0, turno="Comida"):
    return ReciboEmitidoDetalle(
        fecha=date(2026, 9, 1), hora=time(13, 0), turno=turno, cuenta=cuenta, tipo=tipo, segmento=segmento,
        subtotal=subtotal, descuento=descuento, tax=tax, propina=propina, room_serv=0.0, servicio=0.0,
        total=subtotal - descuento + tax + propina, subtotal_tipo_producto=0.0,
    )


def _comanda(cuenta, producto="CAFE", cantidad=1.0, grupo="BEBIDAS"):
    return ComandaEmitidaDetalle(
        fecha=date(2026, 9, 1), hora=time(13, 0), turno="Comida", producto=producto, cantidad=cantidad,
        cuenta=cuenta, estatus="Vendido", grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _catalogo(nombre, precio, costo=10.0, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio,
    )


# ── clasificación ────────────────────────────────────────────────────────

def test_clasifica_por_tipo_y_segmento():
    assert clasificar_recibo(_recibo("1/A", 100)) == COMERCIAL
    assert clasificar_recibo(_recibo("1/A", 100, segmento="TUSOSA")) == COMERCIAL  # sin suponer parte relacionada
    assert clasificar_recibo(_recibo("1/A", 100, tipo="CORTESIA")) == CORTESIA
    assert clasificar_recibo(_recibo("1/A", 100, tipo="AL COSTO")) == AL_COSTO
    assert clasificar_recibo(_recibo("1/A", 100, segmento="CONS DPTO GERENCIA")) == CONSUMO_INTERNO
    assert clasificar_recibo(_recibo("1/A", 100, tipo="RARO")) == OTRO


def test_venta_neta_excluye_no_comerciales_iva_y_propina():
    recibos = [
        _recibo("1/A", 1000, descuento=100, tax=144, propina=90),  # 900 neto
        _recibo("2/A", 500, tipo="CORTESIA"),
        _recibo("3/A", 200, tipo="AL COSTO"),
        _recibo("4/A", 50, segmento="CONS DPTO REST"),
    ]
    assert venta_neta_de(recibos) == 900.0


def test_resumen_ventas_desglosa_todo():
    recibos = [
        _recibo("1/A", 1000, descuento=100, tax=144, propina=90),
        _recibo("2/A", 500, tipo="CORTESIA"),
        _recibo("3/A", 200, tipo="AL COSTO"),
    ]
    r = resumir_ventas(recibos)
    assert r["venta_neta"] == 900.0
    assert r["iva"] == 144.0
    assert r["propina"] == 90.0
    assert r["propina_pct_venta_neta"] == 10.0
    assert r["descuento"] == 100.0
    assert r["cuentas_con_descuento"] == 1
    assert r["no_comercial"]["cortesia"] == {"monto": 500.0, "cuentas": 1}
    assert r["no_comercial"]["al_costo"] == {"monto": 200.0, "cuentas": 1}


def test_resumen_ventas_sin_datos_no_truena():
    r = resumir_ventas([])
    assert r["venta_neta"] == 0.0
    assert r["propina_pct_venta_neta"] is None
    assert r["descuento_pct_venta_bruta"] is None


# ── uso en los paneles ───────────────────────────────────────────────────

def test_serie_kpis_y_turnos_usan_venta_neta_y_cuentas_comerciales():
    comandas = [_comanda("1")]
    recibos = [
        _recibo("1/A", 1000, tax=160, propina=100),
        _recibo("2/A", 400, tipo="CORTESIA"),
    ]
    serie = construir_serie_diaria(comandas, recibos)
    assert serie[0]["total_vendido"] == 1000.0
    assert serie[0]["cantidad_cuentas"] == 1  # la cortesía no cuenta como cuenta comercial

    kpis = calcular_kpis(serie, recibos, None)
    assert kpis["ticket_promedio"] == 1000.0
    assert kpis["propina_total"] == 100.0

    turnos = construir_comparativo_turnos(comandas, recibos, [])
    assert turnos[0]["total_vendido"] == 1000.0
    assert turnos[0]["cantidad_cuentas"] == 1

    comparativo = construir_kpis_comparativos(comandas, recibos, [], [])
    assert comparativo["ventas"]["actual"] == 1000.0
    assert comparativo["cuentas"]["actual"] == 1


def test_conciliacion_detecta_cuentas_huerfanas_y_calidad_de_catalogo():
    catalogo = [_catalogo("CAFE", 50.0), _catalogo("SIN PRECIO", 0.0)]
    comandas = [_comanda("1", "CAFE", 2), _comanda("2", "CAFE", 1), _comanda("3", "SIN PRECIO", 4)]
    recibos = [_recibo("1/AB", 100), _recibo("9/ZZ", 80)]
    productos = construir_ranking_productos(comandas, catalogo)

    c = construir_conciliacion_ventas(recibos, comandas, productos)

    assert c["ingreso_catalogo_comandas"] == 150.0
    assert c["cuentas_comanda_sin_recibo"] == 2  # cuentas 2 y 3
    assert c["cuentas_recibo_sin_comanda"] == 1  # cuenta 9
    assert c["productos_sin_precio"] == ["SIN PRECIO"]
    assert c["cantidad_sin_precio"] == 4.0
    assert c["vs_subtotal_recibos"]["base"] == 180.0
    assert c["vs_subtotal_recibos"]["diferencia"] == -30.0


# ── matching: duplicados deterministas ───────────────────────────────────

def test_duplicado_prefiere_el_grupo_de_la_comanda():
    catalogo = [_catalogo("BAHAMA MAMA", 104.0, grupo="BEBIDAS TROPICAL"), _catalogo("BAHAMA MAMA", 110.0, grupo="COCTELES")]
    res, ambiguo = clasificar_producto_contra_catalogo_detallado("BAHAMA MAMA", catalogo, "BEBIDAS TROPICAL")
    assert res["precio_venta_catalogo"] == 104.0
    assert ambiguo is True


def test_duplicado_sin_grupo_conocido_elige_precio_mayor_sin_depender_del_orden():
    a = _catalogo("PALOMA", 90.0, grupo="X")
    b = _catalogo("PALOMA", 104.0, grupo="Y")
    assert clasificar_producto_contra_catalogo("PALOMA", [a, b])["precio_venta_catalogo"] == 104.0
    assert clasificar_producto_contra_catalogo("PALOMA", [b, a])["precio_venta_catalogo"] == 104.0


def test_duplicado_con_mismo_precio_no_es_ambiguo():
    catalogo = [_catalogo("PALOMA", 104.0, grupo="COCTELES"), _catalogo("PALOMA", 104.0, grupo="TEQUILA")]
    assert clasificar_producto_contra_catalogo_detallado("PALOMA", catalogo)[1] is False


def test_indice_se_reconstruye_si_cambia_la_lista():
    lista = [_catalogo("CAFE", 50.0)]
    assert clasificar_producto_contra_catalogo("CAFE", lista)["precio_venta_catalogo"] == 50.0
    lista.append(_catalogo("TE VERDE", 30.0))
    assert clasificar_producto_contra_catalogo("TE VERDE", lista)["producto_catalogo_encontrado"] is True
    otra = [_catalogo("CAFE", 75.0)]
    assert clasificar_producto_contra_catalogo("CAFE", otra)["precio_venta_catalogo"] == 75.0
