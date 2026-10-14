"""
Tests de Pagos de Recepción: el archivo de Movimiento llega con celdas
vacías reales (pandas las da como NaN, no None); confirmamos que
`agrupar_movimiento_por_forma_pago` las reconoce bien y que los pagos sin
cuenta se guardan en "Pagos del Mes" en lugar de perderse. El módulo no
tenía tests (ver CLAUDE.md).
"""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.db.session import get_db
from app.main import app
from app.models import PagoRecepcionDia
from app.services.pagos_recepcion import (
    agrupar_bloques_pagos_recepcion,
    agrupar_movimiento_por_forma_pago,
    conciliar_forma_pago_pagos_recepcion,
    construir_tabla2_pagos_recepcion,
    extraer_columnas_movimiento_pagos_recepcion,
    extraer_columnas_pagos_recepcion,
    leer_excel_movimiento_pagos_recepcion,
    leer_excel_pagos_recepcion,
)

FACTURAS_REALES = Path(__file__).resolve().parents[2] / "docs" / "facturas emitidas dia 06.xlsx"
MOVIMIENTO_REAL = Path(__file__).resolve().parents[2] / "docs" / "movimientos de cajaa dia 06..xlsx"


def _df_movimiento_sintetico() -> pd.DataFrame:
    """
    Mismo layout que el archivo real (encabezado fila 5, título de forma de
    pago en C, datos en H/M/Y) con celdas vacías de verdad (NaN, como las da
    pandas), no strings vacíos.
    """
    filas = [[np.nan] * 45 for _ in range(10)]
    filas[5][2] = None  # encabezado "# Hab. Huésped Monto" no trae título en C
    filas[5][7], filas[5][12], filas[5][24] = "# Hab.", "Huésped", "Monto"
    filas[7][2] = "MN. EFECTIVO"  # fila título
    filas[8][7], filas[8][12], filas[8][24] = "D303", "FEEMSTER, ", "418.80"
    filas[9][7], filas[9][12], filas[9][24] = "D303", "FEEMSTER, ", "3,476.00"
    return pd.DataFrame(filas)


def test_extraer_columnas_movimiento_normaliza_nan_a_none():
    ext = extraer_columnas_movimiento_pagos_recepcion(_df_movimiento_sintetico())
    fila_vacia = ext.iloc[0].to_dict()
    assert fila_vacia["C"] is None and fila_vacia["H"] is None  # no "nan" como texto


def test_agrupar_movimiento_reconoce_titulo_y_datos_con_celdas_vacias_reales():
    ext = extraer_columnas_movimiento_pagos_recepcion(_df_movimiento_sintetico())
    agrupado = agrupar_movimiento_por_forma_pago(ext.to_dict("records"))
    assert len(agrupado["efectivo"]) == 2
    assert agrupado["efectivo"][0] == {"habitacion": "D303", "huesped": "FEEMSTER,", "monto": 418.80}
    assert sum(f["monto"] for f in agrupado["visa"] + agrupado["amex"] + agrupado["mcard"] + agrupado["credito"]) == 0


@pytest.mark.skipif(not MOVIMIENTO_REAL.exists(), reason="archivo real 'docs/movimientos de cajaa dia 06..xlsx' no presente")
@pytest.mark.anyio
async def test_movimiento_real_se_agrupa():
    df = await leer_excel_movimiento_pagos_recepcion(MOVIMIENTO_REAL.read_bytes())
    ext = extraer_columnas_movimiento_pagos_recepcion(df)
    agrupado = agrupar_movimiento_por_forma_pago(ext.to_dict("records"))
    assert len(agrupado["efectivo"]) == 2
    assert {(f["habitacion"], f["monto"]) for f in agrupado["efectivo"]} == {("D303", 418.80), ("D303", 3476.00)}


@pytest.mark.skipif(not FACTURAS_REALES.exists(), reason="archivo real 'docs/facturas emitidas dia 06.xlsx' no presente")
@pytest.mark.anyio
async def test_facturas_reales_tabla2():
    df = await leer_excel_pagos_recepcion(FACTURAS_REALES.read_bytes())
    ext = extraer_columnas_pagos_recepcion(df)
    bloques = agrupar_bloques_pagos_recepcion(ext)
    tabla2 = construir_tabla2_pagos_recepcion(bloques)
    assert len(tabla2) == 14
    cuenta_39089 = next(f for f in tabla2 if f["cuenta"] == 39089)
    assert cuenta_39089["total"] == pytest.approx(6742.35)
    assert "D303" not in {f["habitacion"] for f in tabla2}  # confirma el caso real de "sin cuenta"


@pytest.mark.skipif(
    not (FACTURAS_REALES.exists() and MOVIMIENTO_REAL.exists()),
    reason="archivos reales de pagos de recepción no presentes",
)
@pytest.mark.anyio
async def test_conciliacion_real_deja_pagos_sin_cuenta_en_no_conciliados():
    df1 = await leer_excel_pagos_recepcion(FACTURAS_REALES.read_bytes())
    tabla2 = construir_tabla2_pagos_recepcion(agrupar_bloques_pagos_recepcion(extraer_columnas_pagos_recepcion(df1)))
    df2 = await leer_excel_movimiento_pagos_recepcion(MOVIMIENTO_REAL.read_bytes())
    filas_movimiento = extraer_columnas_movimiento_pagos_recepcion(df2).to_dict("records")

    resultado = conciliar_forma_pago_pagos_recepcion(tabla2, filas_movimiento)
    # D303/FEEMSTER no tiene cuenta en Facturas Emitidas ese día: debe listarse, no perderse.
    assert len(resultado["no_conciliados"]) == 2
    assert {f["monto"] for f in resultado["no_conciliados"]} == {418.80, 3476.00}
    assert all(f["forma_pago"] == "efectivo" and f["habitacion"] == "D303" for f in resultado["no_conciliados"])


@pytest.mark.anyio
async def test_guardar_pagos_del_mes_crea_filas_sin_cuenta_desde_no_conciliados(client, db_session):
    async def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    try:
        body = {
            "fecha": "2026-10-06",
            "tabla2": [],
            "no_conciliados": [
                {"forma_pago": "efectivo", "habitacion": "D303", "huesped": "FEEMSTER,", "monto": 418.80},
                {"forma_pago": "efectivo", "habitacion": "D303", "huesped": "FEEMSTER,", "monto": 3476.00},
            ],
        }
        r = await client.post("/pagos-recepcion/pagos-del-mes", json=body)
        assert r.status_code == 200, r.text
        cuerpo = r.json()
        assert cuerpo["total"] == 2
        assert all(f["es_sin_cuenta"] and f["es_manual"] and f["efectivo"] > 0 for f in cuerpo["filas"])

        # Una fila manual REAL (tecleada por el usuario) no se borra al re-guardar el día.
        db_session.add(
            PagoRecepcionDia(
                fecha=__import__("datetime").date(2026, 10, 6),
                cuenta=0, habitacion="Z999", huesped="AJUSTE A MANO",
                es_manual=True, es_sin_cuenta=False, efectivo=100.0, totales=100.0,
            )
        )
        await db_session.flush()

        r2 = await client.post("/pagos-recepcion/pagos-del-mes", json={**body, "confirmar_reemplazo": True})
        assert r2.json()["total"] == 2  # la respuesta solo lista lo tocado en esta llamada

        # la fila manual real sobrevive en BD aunque no la haya tocado esta llamada
        todas = (await client.get("/pagos-recepcion/pagos-del-mes")).json()["filas"]
        assert sum(1 for f in todas if f["habitacion"] == "Z999" and not f["es_sin_cuenta"]) == 1
        assert sum(1 for f in todas if f["es_sin_cuenta"]) == 2
    finally:
        app.dependency_overrides.pop(get_db, None)
