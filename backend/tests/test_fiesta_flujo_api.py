"""
Flujo completo de la Fiesta contra la API real (BD en memoria): reservar, doble venta, cobro con 2 formas de pago,
corregir/cancelar pagos, cancelar reservación, totales de Cobros y auditoría de cada paso. QA previo al lanzamiento.
"""

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app

pytestmark = pytest.mark.anyio

PREFIJO = "/fiesta-fin-anio"
HOY = date.today().isoformat()


@pytest.fixture
async def api(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with fabrica() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    monkeypatch.setattr(settings, "auth_enabled", False)
    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        assert (await c.post(f"{PREFIJO}/sembrar")).status_code in (200, 201)
        precios = [
            {"tipo": "adulto", "precio_preventa": 2000, "precio_normal": 2450},
            {"tipo": "nino", "precio_preventa": 1000, "precio_normal": 1200},
            {"tipo": "cortesia", "precio_preventa": 0, "precio_normal": 0},
        ]
        assert (await c.put(f"{PREFIJO}/precios", json=precios)).status_code == 200
        # corte de preventa en el futuro para que el precio sea el de preventa
        evento = (await c.get(f"{PREFIJO}/evento")).json()
        await c.put(f"{PREFIJO}/evento", json={"corte_preventa": date(date.today().year + 1, 1, 1).isoformat()})
        yield c, evento
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _sillas_libres(c, n):
    mesas = (await c.get(f"{PREFIJO}/mesas")).json()["mesas"]
    libres = [s["id"] for m in mesas for s in m["sillas"] if s["estado"] == "libre" and not s.get("extra")]
    return libres[:n]


async def _reservar(c, cliente, tipos, **extra):
    ids = await _sillas_libres(c, len(tipos))
    r = await c.post(
        f"{PREFIJO}/reservaciones",
        json={"cliente": cliente, "sillas": [{"silla_id": i, "tipo": t} for i, t in zip(ids, tipos)], "fecha_venta": HOY, **extra},
    )
    return r, ids


async def test_flujo_completo_con_auditoria(api):
    c, _ = api

    # 1) reservar 2 adultos + 1 niño: precio de preventa congelado por silla
    r, ids = await _reservar(c, "Luis Jose", ["adulto", "adulto", "nino"])
    assert r.status_code == 201, r.text
    res = r.json()
    rid = res["id"]
    assert res["importe"] == pytest.approx(2000 + 2000 + 1000)

    # 2) doble venta de la misma silla → 409 con mensaje claro
    r2 = await c.post(f"{PREFIJO}/reservaciones", json={"cliente": "Otra", "sillas": [{"silla_id": ids[0], "tipo": "adulto"}], "fecha_venta": HOY})
    assert r2.status_code == 409 and "silla" in r2.json()["detail"].lower()

    # 3) cobro con 2 formas de pago aplicado a las 3 sillas → UN solo "Pago 1" por silla
    r3 = await c.post(
        f"{PREFIJO}/reservaciones/{rid}/pagos/multiple",
        json={"pagos": [{"importe": 837.5, "forma_pago": "Efectivo", "fecha": HOY}, {"importe": 1000, "forma_pago": "Tarjeta", "fecha": HOY}]},
    )
    assert r3.status_code == 201, r3.text
    det = r3.json()
    assert det["pagado"] == pytest.approx(1837.5)
    for silla in det["sillas"]:
        assert len(silla["pagos"]) == 1, "las dos formas de un cobro deben ser UN solo Pago N"
        assert {p["forma_pago"] for p in silla["pagos"][0]["partes"]} == {"Efectivo", "Tarjeta"}
    assert sum(s["pagado"] for s in det["sillas"]) == pytest.approx(1837.5)

    # 4) Cobros: el total cuadra, por forma de pago separa efectivo y tarjeta, y el día muestra el cobro completo en Pago 1
    cobros = (await c.get(f"{PREFIJO}/cobros")).json()
    assert cobros["total"] == pytest.approx(1837.5)
    por_forma = {f["forma_pago"]: f["importe"] for f in cobros["por_forma_pago"]}
    assert por_forma.get("Efectivo") == pytest.approx(837.5) and por_forma.get("Tarjeta") == pytest.approx(1000)
    dia = next(d for d in cobros["dias"] if d["fecha"] == HOY)
    assert dia["pago1"] == pytest.approx(1837.5) and dia["pago2"] == 0
    assert dia["vendidas"] == {"adulto": 2, "nino": 1, "cortesia": 0}

    # 5) corregir un pago y cancelarlo
    pago_ef = next(p for p in det["pagos"] if p["forma_pago"] == "Efectivo")
    r5 = await c.patch(f"{PREFIJO}/pagos/{pago_ef['id']}", json={"importe": 800})
    assert r5.status_code == 200 and r5.json()["pagado"] == pytest.approx(1800)
    r6 = await c.delete(f"{PREFIJO}/pagos/{pago_ef['id']}")
    assert r6.status_code == 200 and r6.json()["pagado"] == pytest.approx(1000)

    # 6) cancelar la reservación libera las sillas
    r7 = await c.delete(f"{PREFIJO}/reservaciones/{rid}", params={"motivo": "prueba QA"})
    assert r7.status_code == 200
    mesas = (await c.get(f"{PREFIJO}/mesas")).json()["mesas"]
    estado = {s["id"]: s["estado"] for m in mesas for s in m["sillas"]}
    assert all(estado[i] == "libre" for i in ids)
    assert (await c.delete(f"{PREFIJO}/reservaciones/{rid}")).status_code == 409  # ya cancelada

    # 7) la auditoría registró cada paso con su reservación y cliente
    aud = (await c.get(f"{PREFIJO}/auditoria", params={"por_pagina": 200})).json()
    acciones = [f["accion"] for f in aud["filas"] if f["reservacion_id"] == rid]
    for esperado in ("crear", "pago", "editar_pago", "cancelar_pago", "cancelar"):
        assert esperado in acciones, f"falta {esperado} en {acciones}"
    assert all(f["cliente"] == "Luis Jose" for f in aud["filas"] if f["reservacion_id"] == rid)
    assert aud["resumen"]["por_grupo"].get("cobros", 0) >= 3
    ed = next(f for f in aud["filas"] if f["accion"] == "editar_pago")
    assert ed["antes"]["importe"] == pytest.approx(837.5) and ed["despues"]["importe"] == pytest.approx(800)
    # filtros
    solo_cancel = (await c.get(f"{PREFIJO}/auditoria", params={"grupo": "cancelaciones"})).json()
    assert solo_cancel["total"] >= 2 and all(f["grupo"] == "cancelaciones" for f in solo_cancel["filas"])
    por_res = (await c.get(f"{PREFIJO}/auditoria", params={"reservacion_id": rid})).json()
    assert por_res["total"] == len(acciones) or por_res["total"] >= 5


async def test_validaciones_no_dan_500(api):
    c, _ = api
    r, ids = await _reservar(c, "Validar", ["adulto"])
    rid = r.json()["id"]
    # importes inválidos
    assert (await c.post(f"{PREFIJO}/reservaciones/{rid}/pagos", json={"importe": 0})).status_code == 422
    assert (await c.post(f"{PREFIJO}/reservaciones/{rid}/pagos", json={"importe": -5})).status_code == 422
    # reservación, pago y silla inexistentes
    assert (await c.post(f"{PREFIJO}/reservaciones/99999/pagos", json={"importe": 10})).status_code == 404
    assert (await c.patch(f"{PREFIJO}/pagos/99999", json={"importe": 10})).status_code == 404
    assert (await c.delete(f"{PREFIJO}/pagos/99999")).status_code == 404
    bad = await c.post(f"{PREFIJO}/reservaciones", json={"cliente": "X", "sillas": [{"silla_id": 999999, "tipo": "adulto"}], "fecha_venta": HOY})
    assert bad.status_code in (400, 404, 409, 422)
    # reservación sin sillas / tipo inválido / correo inválido
    assert (await c.post(f"{PREFIJO}/reservaciones", json={"cliente": "X", "sillas": []})).status_code == 422
    assert (await c.post(f"{PREFIJO}/reservaciones", json={"cliente": "X", "sillas": [{"silla_id": ids[0], "tipo": "vip"}]})).status_code == 422
    assert (await c.post(f"{PREFIJO}/reservaciones", json={"cliente": "X", "correo": "no-es-correo", "sillas": [{"silla_id": 1, "tipo": "adulto"}]})).status_code == 422
    # abonar a una reservación cancelada
    await c.delete(f"{PREFIJO}/reservaciones/{rid}")
    assert (await c.post(f"{PREFIJO}/reservaciones/{rid}/pagos", json={"importe": 10})).status_code == 409
    # filtros de auditoría inválidos
    assert (await c.get(f"{PREFIJO}/auditoria", params={"grupo": "inventado"})).status_code == 400
    assert (await c.get(f"{PREFIJO}/auditoria", params={"pagina": 0})).status_code == 422


async def test_humo_de_todas_las_lecturas_de_la_fiesta(api):
    c, _ = api
    r, _ = await _reservar(c, "Humo", ["adulto", "cortesia"])
    rid = r.json()["id"]
    await c.post(f"{PREFIJO}/reservaciones/{rid}/pagos", json={"importe": 500, "forma_pago": "Efectivo"})
    rutas = [
        "/evento", "/mesas", "/reservaciones", f"/reservaciones/{rid}", "/reservaciones?incluir_canceladas=true",
        "/resumen", "/cobros", "/historico", "/bitacora", "/auditoria", "/auditoria/export",
    ]
    fallos = []
    for ruta in rutas:
        resp = await c.get(PREFIJO + ruta)
        if resp.status_code >= 500 or resp.status_code in (401, 403):
            fallos.append(f"{ruta} → {resp.status_code}")
    assert not fallos, fallos


async def test_sobrepago_no_rompe_los_totales(api):
    c, _ = api
    r, ids = await _reservar(c, "Sobrepago", ["adulto"])  # 2000
    rid = r.json()["id"]
    p = await c.post(f"{PREFIJO}/reservaciones/{rid}/pagos", json={"importe": 2500, "forma_pago": "Efectivo", "fecha": HOY})
    assert p.status_code == 201
    det = p.json()
    assert det["pagado"] == pytest.approx(2500)
    assert det["sillas"][0]["saldo"] == 0 and det["sillas"][0]["estado_pago"] == "pagada"
    assert det["saldo"] >= 0  # el saldo nunca sale negativo
    cobros = (await c.get(f"{PREFIJO}/cobros")).json()
    assert cobros["total"] == pytest.approx(2500)  # el dinero cobrado es real aunque sobre


async def test_varias_cajas_reservando_la_misma_silla_solo_una_gana(tmp_path, monkeypatch):
    """Con una BD en archivo y conexiones separadas (como en producción): una caja gana, las demás reciben 409, sin 500."""
    import asyncio

    from app.db.session import configurar_sqlite

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'concurrencia.sqlite3'}")
    configurar_sqlite(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with fabrica() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    monkeypatch.setattr(settings, "auth_enabled", False)
    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            assert (await c.post(f"{PREFIJO}/sembrar")).status_code in (200, 201)
            await c.put(f"{PREFIJO}/precios", json=[
                {"tipo": "adulto", "precio_preventa": 2000, "precio_normal": 2450},
                {"tipo": "nino", "precio_preventa": 1000, "precio_normal": 1200},
                {"tipo": "cortesia", "precio_preventa": 0, "precio_normal": 0},
            ])
            ids = await _sillas_libres(c, 1)
            cuerpo = lambda n: {"cliente": n, "sillas": [{"silla_id": ids[0], "tipo": "adulto"}], "fecha_venta": HOY}
            respuestas = await asyncio.gather(*[c.post(f"{PREFIJO}/reservaciones", json=cuerpo(f"Caja {i}")) for i in range(6)])
            codigos = sorted(r.status_code for r in respuestas)
            assert codigos == [201, 409, 409, 409, 409, 409], codigos
            activas = [x for x in (await c.get(f"{PREFIJO}/reservaciones")).json()["reservaciones"] if x["estatus"] == "activa"]
            assert len(activas) == 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def test_precio_cambia_de_preventa_a_normal_solo_en_ventas_futuras(api):
    c, _ = api
    r1, _ = await _reservar(c, "Preventa", ["adulto"])  # corte en el futuro → preventa 2000
    assert r1.json()["importe"] == pytest.approx(2000)
    # el corte pasa: las ventas nuevas cuestan el precio normal; la ya vendida conserva el suyo
    await c.put(f"{PREFIJO}/evento", json={"corte_preventa": "2020-01-01"})
    r2, _ = await _reservar(c, "Normal", ["adulto"])
    assert r2.json()["importe"] == pytest.approx(2450)
    det1 = (await c.get(f"{PREFIJO}/reservaciones/{r1.json()['id']}")).json()
    assert det1["importe"] == pytest.approx(2000)


async def test_cortesia_cuesta_cero_y_no_pide_pago(api):
    c, _ = api
    r, _ = await _reservar(c, "Cortesia", ["cortesia", "cortesia"])
    assert r.status_code == 201
    assert r.json()["importe"] == 0
    assert r.json()["estado"] == "cortesia"
