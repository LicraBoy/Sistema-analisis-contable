"""
Regresión para services/api de conciliacion_ventas_diarias.py — protege el
comportamiento ya verificado a mano contra datos reales (ver CLAUDE.md /
historial de la sesión que construyó este módulo):

- El join Comandas↔Recibos por cuenta tolera el formato distinto de cada
  archivo ("450913" vs "450913/9A*506D").
- "Por Producto" reparte una fila por turno, y el reparto de
  Subtotal/Impuesto/Descuento/Cortesía entre esas filas SIEMPRE debe sumar
  de vuelta el total real del día — si alguien rompe el prorrateo, un
  análisis futuro que sume esas columnas duplicaría montos sin que nadie lo
  note hasta revisarlo a mano (justo el problema que motivó este archivo).
- Costo/Precio/Total salen siempre del Catálogo × cantidad de Comandas,
  nunca de Productos Vendidos (decisión explícita: Productos Vendidos
  demostró no ser confiable para atribuir cantidad/nombre de producto,
  ej. "HF CERVEZA BUD LIGHT LATA" reportado como "HF CERVEZA LATA
  PACIFICO"). Si alguien revierte esto sin querer, este test debe fallar.
- Cuando el lote de Productos Vendidos cubre varios días, "Por Producto"
  debe compararse contra Comandas de todo ese rango, no solo el día
  pedido — si no, casi todo sale marcado con discrepancia falsa (caso real:
  487 de 494 productos el 5 de septiembre, comparando 1 día contra un lote
  de 16).
"""

from datetime import date, time

import pytest

from app.api.conciliacion_ventas_diarias import conciliar_ventas_diarias
from app.models import CatalogoProducto, ComandaEmitidaDetalle, ProductoVendidoDetalle, ReciboEmitidoDetalle
from app.services.conciliacion_ventas_diarias import (
    construir_cuentas_consolidadas,
    construir_productos_consolidados,
)


def _comanda(fecha, hora, turno, producto, cantidad, cuenta="450913", grupo="BEBIDAS", mesa=None, estatus="Vendido"):
    return ComandaEmitidaDetalle(
        fecha=fecha, hora=hora, turno=turno, producto=producto, cantidad=cantidad, cuenta=cuenta,
        mesa=mesa, estatus=estatus, grupo=grupo, categoria_tipo="Bebidas", seccion_menu="Bar",
        producto_catalogo_encontrado=True,
    )


def _recibo(fecha, hora, turno, cuenta, total=100.0, subtotal=80.0, tax=20.0, propina=0.0):
    return ReciboEmitidoDetalle(
        fecha=fecha, hora=hora, turno=turno, cuenta=cuenta, pos="RESTAURANT LA PALAPA", tipo="HOTEL",
        pagada="ALGUIEN, X", subtotal=subtotal, descuento=0.0, tax=tax, room_serv=0.0, servicio=0.0,
        propina=propina, total=total, subtotal_tipo_producto=0.0,
    )


def _pv(fecha_desde, fecha_hasta, nombre, cantidad, costo, precio_venta, subtotal, impuesto, descuento=0.0):
    return ProductoVendidoDetalle(
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, punto_venta="Restaurante", grupo="BEBIDAS",
        nombre_producto=nombre, costo=costo, precio_venta=precio_venta, cantidad=cantidad, total_costo=0.0,
        descuento=descuento, subtotal=subtotal, impuesto=impuesto, total=subtotal + impuesto,
        categoria_tipo="Bebidas", seccion_menu="Bar", producto_catalogo_encontrado=True,
        costo_catalogo=costo, precio_venta_catalogo=precio_venta,
    )


def _catalogo(nombre, costo, precio_venta, grupo="BEBIDAS"):
    return CatalogoProducto(
        punto_venta="RESTAURANT", grupo=grupo, nombre_producto=nombre, tipo="BEBIDAS",
        categoria_tipo="Bebidas", seccion_menu="Bar", costo=costo, precio_venta=precio_venta,
    )


# ── construir_cuentas_consolidadas ──────────────────────────────────────

def test_cuentas_consolidadas_join_por_cuenta_base():
    """Comandas.cuenta="450913" debe unir con Recibos.cuenta="450913/9A*506D"."""
    comandas = [_comanda(date(2026, 9, 17), time(8, 0), "Desayuno", "CAFE", 1.0, cuenta="450913")]
    recibos = [_recibo(date(2026, 9, 17), time(8, 30), "Desayuno", cuenta="450913/9A*506D", total=50.0)]

    resultado = construir_cuentas_consolidadas(comandas, recibos)

    assert len(resultado) == 1
    assert resultado[0]["cuenta"] == "450913"
    assert resultado[0]["recibo_encontrado"] is True
    assert resultado[0]["total"] == 50.0
    assert resultado[0]["productos"][0]["producto"] == "CAFE"


def test_cuentas_consolidadas_sin_recibo_no_se_descarta():
    """Una cuenta de Comandas sin recibo correspondiente se queda, marcada."""
    comandas = [_comanda(date(2026, 9, 17), time(8, 0), "Desayuno", "CAFE", 1.0, cuenta="999999")]

    resultado = construir_cuentas_consolidadas(comandas, recibos=[])

    assert len(resultado) == 1
    assert resultado[0]["recibo_encontrado"] is False
    assert resultado[0]["total"] is None


# ── construir_productos_consolidados ────────────────────────────────────

def test_productos_turno_split_suma_cantidad_dia():
    """Un producto pedido en 2 turnos sale en 2 filas cuya cantidad suma el día completo."""
    comandas = [
        _comanda(date(2026, 9, 17), time(13, 0), "Comida", "CERVEZA CORONA 1/2", 3.0),
        _comanda(date(2026, 9, 17), time(20, 0), "Cena", "CERVEZA CORONA 1/2", 8.0),
    ]
    catalogo = [_catalogo("CERVEZA CORONA 1/2", 12.83, 65.0)]

    resultado = construir_productos_consolidados(comandas, productos_vendidos=[], catalogo=catalogo)

    assert len(resultado) == 2
    assert {f["turno"] for f in resultado} == {"Comida", "Cena"}
    assert sum(f["cantidad_comandas"] for f in resultado) == 11.0
    assert all(f["cantidad_comandas_dia"] == 11.0 for f in resultado)


def test_productos_sin_match_usa_catalogo_y_marca_discrepancia():
    """Sin fila en Productos Vendidos: precio del catálogo, sin_match y discrepancia en True."""
    comandas = [_comanda(date(2026, 9, 17), time(19, 0), "Cena", "SUNDAE DE CHOCOLATE", 1.0)]
    catalogo = [_catalogo("SUNDAE DE CHOCOLATE", 30.26, 144.0)]

    resultado = construir_productos_consolidados(comandas, productos_vendidos=[], catalogo=catalogo)

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["sin_match_productos_vendidos"] is True
    assert fila["discrepancia"] is True
    assert fila["costo"] == 30.26
    assert fila["precio_venta"] == 144.0
    assert fila["total"] == 144.0  # 1 unidad × precio del catálogo
    assert fila["subtotal"] is None  # no se inventa: no hay Productos Vendidos de donde sacarlo


def test_productos_sin_match_confirmado_en_historial():
    """Si el nombre aparece en nombres_con_historial, se marca aunque falte ese día."""
    comandas = [_comanda(date(2026, 9, 17), time(19, 0), "Cena", "SUNDAE DE CHOCOLATE", 1.0)]
    catalogo = [_catalogo("SUNDAE DE CHOCOLATE", 30.26, 144.0)]

    con_historial = construir_productos_consolidados(
        comandas, [], catalogo, nombres_con_historial={"SUNDAE DE CHOCOLATE"}
    )
    sin_historial = construir_productos_consolidados(comandas, [], catalogo, nombres_con_historial=set())

    assert con_historial[0]["confirmado_en_historial"] is True
    assert sin_historial[0]["confirmado_en_historial"] is False


def test_productos_total_siempre_de_catalogo_no_de_productos_vendidos():
    """
    Aunque Productos Vendidos traiga un Total distinto, `total` en la fila
    debe salir de cantidad_comandas × precio del catálogo — nunca del
    número que trae Productos Vendidos (protege la decisión tomada tras
    encontrar productos mal atribuidos entre los dos archivos).
    """
    comandas = [_comanda(date(2026, 9, 17), time(13, 0), "Comida", "CERVEZA CORONA 1/2", 2.0)]
    # Productos Vendidos dice otra cantidad/otro total — no debe usarse para el monto.
    pv = [_pv(date(2026, 9, 17), date(2026, 9, 17), "CERVEZA CORONA 1/2", cantidad=99.0,
              costo=999.0, precio_venta=999.0, subtotal=8000.0, impuesto=1280.0)]
    catalogo = [_catalogo("CERVEZA CORONA 1/2", 12.83, 65.0)]

    resultado = construir_productos_consolidados(comandas, pv, catalogo)

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["costo"] == 12.83  # del catálogo, no el 999.0 de Productos Vendidos
    assert fila["precio_venta"] == 65.0
    assert fila["total"] == 2.0 * 65.0  # cantidad de Comandas × precio del catálogo
    assert fila["cantidad_vendida"] == 99.0  # sí se conserva como referencia de comparación
    assert fila["discrepancia"] is True  # 2 (Comandas) != 99 (Productos Vendidos)


def test_productos_prorratea_subtotal_impuesto_descuento_por_turno():
    """
    El Subtotal/Impuesto/Descuento del día (de Productos Vendidos) se
    reparte entre las filas de turno proporcional a su cantidad de
    Comandas — sumando las filas se reconstruye el valor original del día,
    exacto (protege contra que un análisis futuro duplique montos al sumar
    por fila en vez de por producto).
    """
    comandas = [
        _comanda(date(2026, 9, 17), time(13, 0), "Comida", "CERVEZA CORONA 1/2", 3.0),
        _comanda(date(2026, 9, 17), time(20, 0), "Cena", "CERVEZA CORONA 1/2", 8.0),
    ]
    pv = [_pv(date(2026, 9, 17), date(2026, 9, 17), "CERVEZA CORONA 1/2", cantidad=11.0,
              costo=12.83, precio_venta=65.0, subtotal=591.16, impuesto=94.59, descuento=29.15)]
    catalogo = [_catalogo("CERVEZA CORONA 1/2", 12.83, 65.0)]

    resultado = construir_productos_consolidados(comandas, pv, catalogo)

    assert len(resultado) == 2
    comida = next(f for f in resultado if f["turno"] == "Comida")
    cena = next(f for f in resultado if f["turno"] == "Cena")

    # Reparto proporcional: Comida = 3/11, Cena = 8/11.
    assert comida["subtotal"] == pytest.approx(591.16 * 3 / 11, abs=0.01)
    assert cena["subtotal"] == pytest.approx(591.16 * 8 / 11, abs=0.01)

    # La suma de las filas reconstruye el total real del día (sin duplicar).
    assert sum(f["subtotal"] for f in resultado) == pytest.approx(591.16, abs=0.02)
    assert sum(f["impuesto"] for f in resultado) == pytest.approx(94.59, abs=0.02)
    assert sum(f["descuento"] for f in resultado) == pytest.approx(29.15, abs=0.02)
    assert comida["discrepancia"] is False  # 3+8 = 11, cuadra exacto con Productos Vendidos


def test_productos_solo_en_productos_vendidos_sale_con_turno_none():
    """Un producto que nunca se pidió por Comandas pero sí aparece en Productos Vendidos sale como 1 fila, turno=None."""
    pv = [_pv(date(2026, 9, 17), date(2026, 9, 17), "CAFETERIA GALLETA DE CHOCOLATE", cantidad=19.0,
              costo=16.62, precio_venta=0.0, subtotal=315.78, impuesto=0.0)]
    catalogo = [_catalogo("CAFETERIA GALLETA DE CHOCOLATE", 16.62, 0.0, grupo="PAN CAFETERIA")]

    resultado = construir_productos_consolidados(comandas=[], productos_vendidos=pv, catalogo=catalogo)

    assert len(resultado) == 1
    fila = resultado[0]
    assert fila["turno"] is None
    assert fila["cantidad_comandas"] == 0.0
    assert fila["cantidad_vendida"] == 19.0
    assert fila["total"] == 0.0  # cantidad_comandas=0 × precio, no se le atribuye el total de Productos Vendidos
    assert fila["subtotal"] == 315.78  # sí se conserva el Subtotal real (única fila, fracción=1.0)


# ── conciliar_ventas_diarias (router) — detección de rango multi-día ────

@pytest.mark.anyio
async def test_conciliar_detecta_lote_multi_dia_y_amplia_comandas(db_session):
    """
    Si el lote de Productos Vendidos cubre varios días, `productos_rango`
    se llena y "Por Producto" compara contra Comandas de TODO ese rango,
    no solo `fecha` (caso real que motivó este cambio: comparar 1 día
    contra un lote de 16 producía discrepancia en casi todo).
    """
    db_session.add_all([
        _comanda(date(2026, 9, 1), time(13, 0), "Comida", "CAFE", 5.0),
        _comanda(date(2026, 9, 2), time(13, 0), "Comida", "CAFE", 5.0),
        _pv(date(2026, 9, 1), date(2026, 9, 2), "CAFE", cantidad=10.0, costo=12.74, precio_venta=49.75,
            subtotal=428.02, impuesto=68.48),
        _catalogo("CAFE", 12.74, 49.75),
    ])
    await db_session.commit()

    resultado = await conciliar_ventas_diarias(fecha=date(2026, 9, 2), db=db_session, current_user={})

    assert resultado["productos_rango"] == {"fecha_desde": "2026-09-01", "fecha_hasta": "2026-09-02"}
    fila_cafe = next(f for f in resultado["productos"] if f["producto"] == "CAFE")
    assert fila_cafe["cantidad_comandas_dia"] == 10.0  # ambos días, no solo el 2
    assert fila_cafe["discrepancia"] is False  # 10 (Comandas, rango) == 10 (Productos Vendidos)

    # "Por Cuenta" no se ve afectado por el ensanchamiento de Comandas para
    # "Por Producto": solo debe traer la cuenta del 2 de septiembre (la del
    # 1 no debe colarse aquí, aunque sí se usó para el cálculo de arriba).
    assert len(resultado["cuentas"]) == 1
    assert resultado["cuentas"][0]["productos"][0]["cantidad"] == 5.0


@pytest.mark.anyio
async def test_conciliar_lote_un_solo_dia_no_marca_rango(db_session):
    """Un lote de un solo día (el caso normal) no debe activar productos_rango."""
    db_session.add_all([
        _comanda(date(2026, 9, 17), time(13, 0), "Comida", "CAFE", 2.0),
        _pv(date(2026, 9, 17), date(2026, 9, 17), "CAFE", cantidad=2.0, costo=12.74, precio_venta=49.75,
            subtotal=85.6, impuesto=13.7),
        _catalogo("CAFE", 12.74, 49.75),
    ])
    await db_session.commit()

    resultado = await conciliar_ventas_diarias(fecha=date(2026, 9, 17), db=db_session, current_user={})

    assert resultado["productos_rango"] is None
