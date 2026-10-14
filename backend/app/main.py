"""
Sistema de Análisis Contable — FastAPI Application
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, administracion, health, ingresos, pagos, conciliacion, facturacion, conciliacion_retenciones, pagos_recepcion, catalogo_productos, catalogo_productos_cafeteria, catalogo_productos_carreta_mariscos, costeo_recetas, costeo_recetas_cafeteria, costeo_recetas_carreta_mariscos, productos_vendidos, productos_vendidos_cafeteria, productos_vendidos_carreta_mariscos, comandas_emitidas, recibos_emitidos, conciliacion_ventas_diarias, resumen_ejecutivo, heatmap_ventas, ranking_productos, panel_turnos, cortesias_dashboard, oportunidades_comerciales, menu_engineering, mix_ventas, dependencia_productos, alertas_riesgo, desempeno_comercial, amarre_costo, saldo_cuenta_huesped, reporte_produccion, fiesta_fin_anio
from app.core.config import settings
from app.core.permisos import MODULO_ADMIN, requiere
from app.core.security import verificar_configuracion

logger = logging.getLogger("seguridad")


@asynccontextmanager
async def lifespan(_: FastAPI):
    verificar_configuracion()
    # Roles y matriz inicial (idempotente). Si la migración de seguridad aún no se aplicó, no se bloquea el arranque.
    try:
        from app.db.session import async_session_factory
        from app.services.seguridad import sembrar_roles

        async with async_session_factory() as db:
            await sembrar_roles(db)
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("No se pudieron sembrar los roles (¿falta `alembic upgrade head`?)", exc_info=True)
    if not settings.auth_enabled:
        logger.warning("AUTH_ENABLED=false: el sistema está ABIERTO (solo para desarrollo).")
    yield


_es_produccion = settings.entorno.lower() == "produccion"

app = FastAPI(
    title="Sistema de Análisis Contable",
    description="API para el análisis automatizado de CFDI, pagos e ingresos recibidos",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if _es_produccion else "/docs",
    redoc_url=None,
    openapi_url=None if _es_produccion else "/openapi.json",
)

# ── Cabeceras de seguridad y tope de carga ──────────────────
_RUTAS_DOCS = ("/docs", "/openapi.json")


@app.middleware("http")
async def endurecer(request: Request, call_next):
    declarado = request.headers.get("content-length")
    limite = settings.max_upload_mb * 1024 * 1024
    if declarado and declarado.isdigit() and int(declarado) > limite:
        return JSONResponse(status_code=413, content={"detail": f"El archivo supera el máximo de {settings.max_upload_mb} MB."})
    respuesta = await call_next(request)
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    respuesta.headers["X-Frame-Options"] = "DENY"
    respuesta.headers["Referrer-Policy"] = "no-referrer"
    respuesta.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    respuesta.headers["Cache-Control"] = respuesta.headers.get("Cache-Control", "no-store")
    if not request.url.path.startswith(_RUTAS_DOCS):
        respuesta.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.cookie_secure:
        respuesta.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return respuesta


# ── CORS ────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Autorizacion"],
    expose_headers=["Content-Disposition"],
)


def _p(modulo: str):
    """Permiso por router: GET/HEAD = ver, resto = editar."""
    return [Depends(requiere(modulo))]


# ── Routers ─────────────────────────────────────────────
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(administracion.router, prefix="/administracion", tags=["Administracion"], dependencies=_p(MODULO_ADMIN))

# CFDI
app.include_router(ingresos.router, prefix="/ingresos", tags=["Ingresos"], dependencies=_p("cfdi"))
app.include_router(pagos.router, prefix="/pagos", tags=["Pagos"], dependencies=_p("cfdi"))
app.include_router(conciliacion.router, prefix="/conciliacion", tags=["Conciliacion"], dependencies=_p("cfdi"))
app.include_router(conciliacion_retenciones.router, prefix="/pagos/retenciones", tags=["Retenciones"], dependencies=_p("cfdi"))
app.include_router(facturacion.router, prefix="/facturacion", tags=["Facturacion"], dependencies=_p("facturacion"))
app.include_router(pagos_recepcion.router, prefix="/pagos-recepcion", tags=["PagosRecepcion"], dependencies=_p("pagos_recepcion"))
app.include_router(saldo_cuenta_huesped.router, prefix="/saldo-cuenta-huesped", tags=["SaldoCuentaHuesped"], dependencies=_p("pagos_recepcion"))

# Catálogo de productos (catálogo, costeo, productos vendidos)
for _router, _prefijo, _tag in (
    (catalogo_productos.router, "/catalogo-productos", "CatalogoProductos"),
    (catalogo_productos_cafeteria.router, "/catalogo-productos-cafeteria", "CatalogoProductosCafeteria"),
    (catalogo_productos_carreta_mariscos.router, "/catalogo-productos-carreta-mariscos", "CatalogoProductosCarretaMariscos"),
    (costeo_recetas.router, "/costeo", "CosteoRecetas"),
    (costeo_recetas_cafeteria.router, "/costeo-cafeteria", "CosteoRecetasCafeteria"),
    (costeo_recetas_carreta_mariscos.router, "/costeo-carreta-mariscos", "CosteoRecetasCarretaMariscos"),
    (productos_vendidos.router, "/productos-vendidos", "ProductosVendidos"),
    (productos_vendidos_cafeteria.router, "/productos-vendidos-cafeteria", "ProductosVendidosCafeteria"),
    (productos_vendidos_carreta_mariscos.router, "/productos-vendidos-carreta-mariscos", "ProductosVendidosCarretaMariscos"),
):
    app.include_router(_router, prefix=_prefijo, tags=[_tag], dependencies=_p("catalogo_productos"))

# Inteligencia de negocio (ventas diarias y análisis)
for _router, _prefijo, _tag in (
    (comandas_emitidas.router, "/comandas-emitidas", "ComandasEmitidas"),
    (recibos_emitidos.router, "/recibos-emitidos", "RecibosEmitidos"),
    (conciliacion_ventas_diarias.router, "/conciliacion-ventas-diarias", "ConciliacionVentasDiarias"),
    (resumen_ejecutivo.router, "/resumen-ejecutivo", "ResumenEjecutivo"),
    (heatmap_ventas.router, "/heatmap-ventas", "HeatmapVentas"),
    (ranking_productos.router, "/ranking-productos", "RankingProductos"),
    (panel_turnos.router, "/panel-turnos", "PanelTurnos"),
    (cortesias_dashboard.router, "/cortesias-dashboard", "CortesiasDashboard"),
    (oportunidades_comerciales.router, "/oportunidades-comerciales", "OportunidadesComerciales"),
    (menu_engineering.router, "/menu-engineering", "MenuEngineering"),
    (mix_ventas.router, "/mix-ventas", "MixVentas"),
    (dependencia_productos.router, "/dependencia-productos", "DependenciaProductos"),
    (alertas_riesgo.router, "/alertas-riesgo", "AlertasRiesgo"),
    (desempeno_comercial.router, "/desempeno-comercial", "DesempenoComercial"),
):
    app.include_router(_router, prefix=_prefijo, tags=[_tag], dependencies=_p("inteligencia_negocio"))

app.include_router(amarre_costo.router, prefix="/amarre-costo", tags=["AmarreCosto"], dependencies=_p("amarre_costo"))
app.include_router(reporte_produccion.router, prefix="/reporte-produccion", tags=["ReporteProduccion"], dependencies=_p("reporte_produccion"))
app.include_router(fiesta_fin_anio.router, prefix="/fiesta-fin-anio", tags=["FiestaFinAnio"], dependencies=_p("fiesta"))
