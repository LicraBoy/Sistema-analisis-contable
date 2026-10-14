"""
Pruebas de seguridad: contraseñas, login con bloqueo, refresh rotativo, permisos por módulo, administración,
autorización de supervisor y bitácora. Usan su propia BD en memoria y encienden la autenticación por prueba.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.security import errores_politica, hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.usuario import Auditoria, Rol, Usuario
from app.services.seguridad import sembrar_roles

pytestmark = pytest.mark.anyio

PASS = "Clave-Segura-2026"
H = {"X-Requested-With": "XMLHttpRequest"}


@pytest.fixture
async def ctx(monkeypatch):
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

    monkeypatch.setattr(settings, "auth_enabled", True)
    security._intentos_ip.clear()
    app.dependency_overrides[get_db] = _get_db
    async with fabrica() as s:
        await sembrar_roles(s)
        roles = {r.clave: r.id for r in (await s.execute(select(Rol))).scalars()}
        for clave, rid in roles.items():
            s.add(Usuario(email=f"{clave}@t.com", nombre=clave, rol_id=rid, hashed_password=hash_password(PASS)))
        await s.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, fabrica, roles
    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


async def _login(c, clave="administrador", password=PASS):
    return await c.post("/auth/login", json={"email": f"{clave}@t.com", "password": password})


async def _entrar(c, clave="administrador"):
    r = await _login(c, clave)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_hash_y_politica():
    h = hash_password("x" * 200)  # más largo que el límite de 72 bytes de bcrypt
    assert verify_password("x" * 200, h) and not verify_password("x" * 199, h)
    assert errores_politica("corta1A")
    assert errores_politica("soloMinusculas")  # 1 sola clase
    assert errores_politica("Juan.Perez-2026", email="juan.perez@t.com")
    assert not errores_politica("Clave-Segura-2026", email="a@t.com", nombre="Maria")
    assert not errores_politica(security.generar_password_temporal())


async def test_login_generico_y_sin_token(ctx):
    c, *_ = ctx
    assert (await c.get("/fiesta-fin-anio/mesas")).status_code == 401
    mal = await _login(c, password="otra")
    inexistente = await c.post("/auth/login", json={"email": "no@existe.com", "password": "x"})
    assert mal.status_code == inexistente.status_code == 401
    assert mal.json()["detail"] == inexistente.json()["detail"]
    ok = await _login(c)
    assert ok.status_code == 200 and "refresh_token" in ok.cookies
    assert ok.json()["usuario"]["es_admin"] is True


async def test_bloqueo_por_intentos(ctx):
    c, fabrica, _ = ctx
    for _ in range(settings.login_max_intentos):
        assert (await _login(c, "cajera_fiesta", "mala")).status_code == 401
    bloqueado = await _login(c, "cajera_fiesta")  # ni con la contraseña buena
    assert bloqueado.status_code == 423 and bloqueado.json()["bloqueada_minutos"] >= 1
    async with fabrica() as s:
        u = (await s.execute(select(Usuario).where(Usuario.email == "cajera_fiesta@t.com"))).scalar_one()
        u.locked_until = None
        await s.commit()
    assert (await _login(c, "cajera_fiesta")).status_code == 200


async def test_permisos_por_modulo_y_metodo(ctx):
    c, *_ = ctx
    cajera = await _entrar(c, "cajera_fiesta")
    assert (await c.get("/fiesta-fin-anio/mesas", headers=cajera)).status_code not in (401, 403)
    assert (await c.get("/facturacion/tablas-forma-pago/periodos", headers=cajera)).status_code == 403  # sin acceso
    assert (await c.get("/administracion/usuarios", headers=cajera)).status_code == 403

    contralor = await _entrar(c, "contralor")
    assert (await c.get("/fiesta-fin-anio/mesas", headers=contralor)).status_code not in (401, 403)  # ver
    assert (await c.post("/fiesta-fin-anio/reservaciones", headers=contralor, json={})).status_code == 403  # no editar
    assert (await c.get("/administracion/usuarios", headers=contralor)).status_code == 403


async def test_refresh_rota_y_detecta_reuso(ctx, monkeypatch):
    c, *_ = ctx
    await _login(c)
    viejo = c.cookies.get("refresh_token")
    assert (await c.post("/auth/refresh")).status_code == 400  # exige X-Requested-With
    r = await c.post("/auth/refresh", headers=H)
    assert r.status_code == 200 and c.cookies.get("refresh_token") != viejo
    nuevo = c.cookies.get("refresh_token")

    # Reusar el token ya rotado (fuera de la gracia) revoca toda la cadena, también el nuevo.
    import app.api.auth as auth_api

    monkeypatch.setattr(auth_api, "_GRACIA_REUSO_SEG", -1)
    c.cookies.set("refresh_token", viejo)
    assert (await c.post("/auth/refresh", headers=H)).status_code == 401
    c.cookies.set("refresh_token", nuevo)
    assert (await c.post("/auth/refresh", headers=H)).status_code == 401


async def test_logout_revoca_la_sesion(ctx):
    c, *_ = ctx
    await _login(c)
    assert (await c.post("/auth/logout")).status_code == 200
    assert (await c.post("/auth/refresh", headers=H)).status_code == 401


async def test_cambio_de_password_invalida_tokens_y_aplica_politica(ctx):
    c, *_ = ctx
    h = await _entrar(c, "contralor")
    assert (await c.post("/auth/cambiar-password", headers=h, json={"actual": "mal", "nueva": "Otra-Clave-2027"})).status_code == 400
    debil = await c.post("/auth/cambiar-password", headers=h, json={"actual": PASS, "nueva": "123"})
    assert debil.status_code == 422 and debil.json()["errores"]
    ok = await c.post("/auth/cambiar-password", headers=h, json={"actual": PASS, "nueva": "Otra-Clave-2027"})
    assert ok.status_code == 200
    assert (await c.get("/auth/yo", headers=h)).status_code == 401  # el token viejo ya no sirve
    assert (await c.get("/auth/yo", headers={"Authorization": f"Bearer {ok.json()['access_token']}"})).status_code == 200


async def test_usuario_nuevo_debe_cambiar_password(ctx):
    c, _, roles = ctx
    admin = await _entrar(c)
    r = await c.post("/administracion/usuarios", headers=admin, json={"email": "Nueva@T.com", "nombre": "Nueva", "rol_id": roles["cajera_fiesta"]})
    assert r.status_code == 201
    temporal = r.json()["password_temporal"]
    assert not errores_politica(temporal)
    login = await c.post("/auth/login", json={"email": "nueva@t.com", "password": temporal})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert login.json()["usuario"]["must_change_password"] is True
    assert (await c.get("/fiesta-fin-anio/mesas", headers=h)).status_code == 403  # bloqueado hasta cambiarla
    assert (await c.get("/auth/yo", headers=h)).status_code == 200


async def test_ultimo_administrador_protegido(ctx):
    c, fabrica, roles = ctx
    admin = await _entrar(c)
    async with fabrica() as s:
        yo = (await s.execute(select(Usuario).where(Usuario.email == "administrador@t.com"))).scalar_one().id
    assert (await c.patch(f"/administracion/usuarios/{yo}", headers=admin, json={"is_active": False})).status_code == 400
    assert (await c.patch(f"/administracion/usuarios/{yo}", headers=admin, json={"rol_id": roles["cajera_fiesta"]})).status_code == 400


async def test_matriz_editable_aplica_de_inmediato(ctx):
    c, _, roles = ctx
    admin = await _entrar(c)
    cajera = await _entrar(c, "cajera_fiesta")
    assert (await c.get("/facturacion/tablas-forma-pago/periodos", headers=cajera)).status_code == 403
    r = await c.put(f"/administracion/roles/{roles['cajera_fiesta']}/permisos", headers=admin, json={"permisos": {"facturacion": 1}})
    assert r.status_code == 200
    # Los tokens de ese rol se invalidan: hay que entrar de nuevo, y ya trae el permiso nuevo.
    assert (await c.get("/auth/yo", headers=cajera)).status_code == 401
    cajera = await _entrar(c, "cajera_fiesta")
    assert (await c.get("/auth/yo", headers=cajera)).json()["permisos"]["facturacion"] == 1
    # El rol Administrador no se edita.
    assert (await c.put(f"/administracion/roles/{roles['administrador']}/permisos", headers=admin, json={"permisos": {"cfdi": 0}})).status_code == 409


async def test_autorizacion_de_supervisor_un_solo_uso(ctx):
    c, *_ = ctx
    cajera = await _entrar(c, "cajera_fiesta")
    # Una cajera no puede autorizarse a sí misma…
    assert (await c.post("/auth/autorizar", headers=cajera, json={"password": PASS})).status_code == 403
    # …pero sí con la contraseña de un supervisor.
    r = await c.post("/auth/autorizar", headers=cajera, json={"email": "supervisor_fiesta@t.com", "password": PASS})
    assert r.status_code == 200
    token = r.json()["autorizacion"]
    assert security.consumir_autorizacion(token) is not None
    assert security.consumir_autorizacion(token) is None  # segundo uso
    mala = await c.post("/auth/autorizar", headers=cajera, json={"email": "supervisor_fiesta@t.com", "password": "mala"})
    assert mala.status_code == 401


async def test_bitacora_registra_eventos(ctx):
    c, fabrica, _ = ctx
    await _login(c, password="mala")
    admin = await _entrar(c)
    cajera = await _entrar(c, "cajera_fiesta")
    await c.get("/administracion/usuarios", headers=cajera)  # denegado
    async with fabrica() as s:
        eventos = {a.evento for a in (await s.execute(select(Auditoria))).scalars()}
    assert {"login_fallido", "login", "acceso_denegado"} <= eventos
    r = await c.get("/administracion/auditoria?solo_fallos=true", headers=admin)
    assert r.status_code == 200 and r.json()["total"] >= 2


async def test_auth_apagada_conserva_el_acceso_abierto(monkeypatch):
    monkeypatch.setattr(settings, "auth_enabled", False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/auth/yo")
        assert r.status_code == 200 and r.json()["es_admin"] is True and r.json()["auth_activa"] is False


async def test_exigir_supervisor_de_la_fiesta(ctx):
    from fastapi import HTTPException

    from app.api.fiesta_fin_anio import _exigir_supervisor
    from app.core.security import autorizo_por, usuario_actual

    c, *_ = ctx
    cajera = await _entrar(c, "cajera_fiesta")
    yo = (await c.get("/auth/yo", headers=cajera)).json()
    usuario_actual.set(yo)  # lo que get_current_user deja en el contexto de la petición

    with pytest.raises(HTTPException) as sin:
        _exigir_supervisor(None, None)  # sin autorización
    assert sin.value.status_code == 403

    aut = (await c.post("/auth/autorizar", headers=cajera, json={"email": "supervisor_fiesta@t.com", "password": PASS})).json()["autorizacion"]
    assert _exigir_supervisor(None, aut) is True
    assert autorizo_por.get() == "supervisor_fiesta@t.com"
    with pytest.raises(HTTPException):
        _exigir_supervisor(None, aut)  # ya se usó

    # Una autorización pedida por otro usuario no sirve para esta cajera.
    otra = await _entrar(c, "contralor")
    aut2 = (await c.post("/auth/autorizar", headers=otra, json={"email": "supervisor_fiesta@t.com", "password": PASS})).json()["autorizacion"]
    usuario_actual.set(yo)
    with pytest.raises(HTTPException):
        _exigir_supervisor(None, aut2)


async def test_auditoria_de_fiesta_no_la_ven_las_cajeras(ctx):
    c, *_ = ctx
    cajera = await _entrar(c, "cajera_fiesta")
    for ruta in ("/fiesta-fin-anio/auditoria", "/fiesta-fin-anio/auditoria/export", "/fiesta-fin-anio/bitacora"):
        assert (await c.get(ruta, headers=cajera)).status_code == 403, ruta
    assert (await c.get("/auth/yo", headers=cajera)).json()["permisos"].get("fiesta_auditoria", 0) == 0
    for rol in ("supervisor_fiesta", "contralor", "administrador"):
        h = await _entrar(c, rol)
        # sin evento sembrado responde 404 (no 403): el permiso sí pasó
        assert (await c.get("/fiesta-fin-anio/auditoria", headers=h)).status_code != 403, rol


def test_produccion_exige_una_clave_secreta_fuerte(monkeypatch):
    import pytest as _pytest

    from app.core.security import CLAVE_SECRETA_EJEMPLO, verificar_configuracion

    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "entorno", "produccion")
    monkeypatch.setattr(settings, "secret_key", CLAVE_SECRETA_EJEMPLO)
    with _pytest.raises(RuntimeError):
        verificar_configuracion()
    monkeypatch.setattr(settings, "secret_key", "corta")
    with _pytest.raises(RuntimeError):
        verificar_configuracion()
    monkeypatch.setattr(settings, "secret_key", "x" * 48)
    verificar_configuracion()  # no lanza
    monkeypatch.setattr(settings, "entorno", "desarrollo")
    monkeypatch.setattr(settings, "secret_key", CLAVE_SECRETA_EJEMPLO)
    verificar_configuracion()  # en desarrollo se tolera
