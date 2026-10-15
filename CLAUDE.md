# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Sistema de Análisis Contable" — a system for reconciling Mexican CFDI invoices ("Ingresos Recibidos") against a company's payment records ("Pagos"), matching by UUID/folio so a user can see which invoices were paid, unpaid, or duplicated. It has grown into several largely independent modules (see Architecture) beyond that core flow: Facturación, Pagos de Recepción, a Catálogo de costeo de recetas y ventas, and Amarre de Costo de Ventas (hotel inventory reconciliation).

Backend: FastAPI + SQLAlchemy (async) + Celery. Frontend: React + TypeScript + Mantine + React Query. Es un repositorio git (rama `main`, remoto en GitHub privado); datos reales (BD, storage, backups, .env) nunca se versionan. Despliegue y actualización: `docs/DESPLIEGUE.md`.

For stack table and first-time setup see `README.md`; `docs/EXPLICACION_LIBRERIAS_Y_GRAFICAS.md` explains the charting/library choices.

## Commands

### Backend (from `backend/`)

```powershell
# Install deps into the existing venv
.venv\Scripts\pip install -r requirements.txt

# Run the API with reload
.venv\Scripts\uvicorn app.main:app --reload

# Run tests
.venv\Scripts\pytest
.venv\Scripts\pytest tests/test_health.py::test_health_check   # single test

# Alembic migrations (uses app.core.config.settings.database_url, not alembic.ini's URL)
.venv\Scripts\alembic revision --autogenerate -m "message"
.venv\Scripts\alembic upgrade head
```

Cobertura de pruebas: la suite completa son **375 pruebas, todas en verde** (QA 2026-10-14, ver abajo). Cada servicio de "Análisis y Profundidad" tiene su `tests/test_*.py` (patrón: construir modelos sin persistir, servicios puros); también hay pruebas de `cfdi_analysis` (egresos), `facturacion` (`Tablas_Forma_Pago`), `conciliacion_ventas_diarias`, `venta_neta`, Amarre de Costo (incluye integración contra `INVETARIOS/`, se omite si falta), `reporte_produccion`, `saldo_cuenta_huesped`, `fiesta_fin_anio` y `auth`. **Sin pruebas:** `conciliacion_retenciones.py`, `pagos_recepcion.py` y la capa de BD/analítica de Facturación (se verifican a mano). `tests/conftest.py` da las fixtures async (BD SQLite en memoria; `AUTH_ENABLED=false`).

**QA previo al lanzamiento (2026-10-14, ver `docs/QA_PRELANZAMIENTO.md`):** suite de 375 pruebas, todas en verde (los 2 fallos viejos de `test_pagos_egresos.py` eran pruebas desactualizadas y ya se corrigieron). Pruebas nuevas: `test_autorizacion_rutas.py` (recorre `app.routes`; **falla si un router se monta sin `requiere(...)`** — `requiere`/`requiere_capacidad` marcan su función con `.modulo`/`.capacidad` para eso), `test_humo_api.py` (todos los GET con base vacía, ninguno debe dar 500), `test_fiesta_flujo_api.py` (flujo completo de la Fiesta por API, incluye concurrencia real con BD en archivo), `test_descargas.py`, `test_fiesta_auditoria.py`. E2E de navegador (Edge headless/CDP) en `scripts/qa/` contra un entorno aislado (`levantar_prueba.sh`: copia de la BD, backend `:8011`, Vite `:5180` vía `VITE_PORT`/`VITE_PROXY_TARGET`). SQLite corre con WAL + `busy_timeout` (`db/session.py::configurar_sqlite`); `app/core/descargas.py::cabecera_descarga` debe usarse para todo `Content-Disposition` con datos del usuario; las validaciones de extensión usan `.lower()`. Respaldo: `respaldar_bd.bat` / `scripts/respaldar_bd.py` (se ejecuta solo al iniciar los servidores; conserva 14 en `backups/`).

There is no lint/format config (no ruff/black/pyproject.toml) in `backend/`, and no ESLint config in `frontend/` (`npm run lint` fails with "couldn't find eslint.config") — don't invent one unless asked.

### Frontend (from `frontend/`)

```powershell
npm run dev       # Vite dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview
```

### Full stack

```powershell
docker-compose up --build
```

Spins up Postgres, Redis, `backend` (FastAPI, port 8000), `celery-worker`, and `frontend` (Vite, port 5173). Requires a `.env` file (see `.env.example`).

On Windows without Docker: double-click/run `iniciar_servidores.bat` from the repo root — frees ports 8000/5173, then opens two "Vigilante" windows that run `scripts/vigilante.ps1` for the backend (`.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`, **no `--reload`**) and the frontend (`npm run dev`), waits for both to answer and opens `http://localhost:5173`. The watchdog waits for `/health` (backend) / `/` (Vite); if a start hangs it kills **only that PID tree** and retries (up to 6×), and once up it checks every 15 s and restarts on exit or 3 failed checks. Logs go to `logs/backend.log`, `logs/frontend.log` (+ `.out.log`/`.err.log`). `detener_servidores.bat` stops everything. Requires the backend `.venv` and frontend `node_modules` to already exist. **Known environment problem (2026-10-13):** `backend\.venv` is based on the **Microsoft Store Python** (`pyvenv.cfg` home = `WindowsApps\PythonSoftwareFoundation.Python.3.13_…`), and `python.exe` / `python3.13.exe` launches hang intermittently — measured 8/8 hangs of even `python -c "print(1)"` when launched with `Start-Process` from the tool shell, plus frequent hangs when tools/scripts run it — most likely the Store alias/MSIX launch plus antivirus scanning. Recommended fix: install a per-user python.org Python (no admin: "Install just for me"), recreate `backend\.venv` with it and `pip install -r requirements.txt`; also ask IT for antivirus exclusions (project folder, `backend\.venv`, `frontend\node_modules`, `python.exe`, `node.exe`). Don't start servers from a tool shell with hidden `Start-Process` or kill every `python`/`node` to restart — ask the user to run the `.bat` or kill by PID/port; backend code changes need a restart (no reload).

## Architecture

### Cross-cutting things to know before editing

- **Auth is real now (since 2026-10-13) — see module 9 "Seguridad".** Every router except `/health` and `/auth/*` is mounted in `main.py` with `dependencies=[Depends(requiere(<modulo>))]`; `get_current_user()` validates a JWT and returns `{id, email (= the login *usuario*, e.g. "admin"), nombre, rol, permisos, es_admin, ...}`. `AUTH_ENABLED=false` (env or `settings.auth_enabled`) restores the old open admin bypass — `tests/conftest.py` sets it so the pre-existing tests keep working; `tests/test_auth.py` turns it on per test with its own in-memory DB. Never assume a request is anonymous-admin.
- **Celery runs eagerly.** `tasks/celery_app.py` sets `task_always_eager=True`, so tasks execute synchronously in-process. `tasks/processing.py` is a stub not actually wired into the upload flow — real Pagos processing happens synchronously inside `POST /pagos/upload`, not via Celery.
- **Most Excel parsing is by fixed column position, not header name.** `services/cfdi_analysis.py` (Pagos/Ingresos), `services/pagos_recepcion.py`, `services/catalogo_productos*.py` all read source spreadsheets with `header=None` and hardcoded column indices, because real-world files have inconsistent/unreliable headers. Any change to an expected spreadsheet layout means updating column indices in the relevant service module. `services/facturacion.py` mixes both strategies depending on the source file's reliability — check the specific function before assuming either convention.
- **DB dialect assumption**: `api/ingresos.py`'s upsert uses `sqlalchemy.dialects.sqlite.insert` (`ON CONFLICT DO NOTHING`), which assumes SQLite even though Docker Compose runs Postgres. Check this if switching databases.
- **Route order matters in `api/pagos.py`**: `/export`, `/export/usd-preview`, `/cancelados/parse`, `/egresos/parse`, `/auditoria/export` must stay defined before `GET /pagos/{archivo_id}/status` and the `/{id}` PATCH/DELETE routes, or FastAPI matches the literal segment as a path param.
- **Loose `.db`/`.sqlite3` files in `backend/`** (`sistema_contable.db`, `pagos.db`, `contabilidad.db`, `local_db.sqlite3`) are local dev databases, not fixtures. The repo root also has loose ad-hoc scripts (`query*.py`, `date_test.py`) and scratch `.xlsx`/`.log` files that are the user's own debugging artifacts — not app entry points or test fixtures; don't delete without asking.
- Models live in `models/`, all re-exported through `models/__init__.py` (which `alembic/env.py` imports so autogenerate can see them).

### Modules

Los módulos comparten infraestructura (FastAPI, DB, auth) pero casi no comparten datos ni lógica. **El detalle de las reglas de negocio de cada módulo vive en `docs/modulos/NN-*.md`; léelo antes de tocar ese módulo** y mantén ahí (no aquí) las notas de cambios.

1. **CFDI reconciliation core** (`api/ingresos.py`, `api/pagos.py`, `api/conciliacion.py`, `api/conciliacion_retenciones.py`, `services/cfdi_analysis.py`, `services/excel_processor.py`) — the original Ingresos/Pagos/Conciliación flow plus retention-column reconciliation against an external accounting-auxiliary file. Models: `CfdiIngreso`, `Pago`, `HistorialCambioPago`, `HistorialEliminacionPago`.
2. **Facturación** (`api/facturacion.py`, `services/facturacion.py`) — combines "Formas de Pago" and "Recibos Emitidos" uploads into a reconciliation report (`Tablas_Forma_Pago`), plus a later-added DB-persistence layer ("Base de Datos" viewer, day/month analytics, a trial-balance "Balanza" comparison). Independent of module 1.
3. **Pagos de Recepción** (`api/pagos_recepcion.py`, `services/pagos_recepcion.py`, `models/pago_recepcion_dia.py`) — front-desk guest-folio reconciliation. Independent of modules 1 and 2.

4. **Catálogo de Productos** — detalle en [`docs/modulos/04-catalogo-productos.md`](docs/modulos/04-catalogo-productos.md). Costeo de recetas y análisis de ventas, **triplicado por punto de venta** (`restaurante`, `cafeteria`, `carreta_mariscos`): cada tabla, servicio y router es un archivo separado por POS, nunca una tabla parametrizada (convención del proyecto). Archivos: `api/catalogo_productos*.py`, `api/costeo_recetas*.py`, `api/productos_vendidos*.py`, `services/catalogo_productos*.py`, `services/costeo_recetas.py` (único módulo compartido por los 3 POS), `services/productos_vendidos*.py`. Subfunciones de **Restaurante**: *Ventas Diarias* (Comandas Emitidas, Recibos Emitidos, Productos Vendidos, Conciliación) y *Análisis y Profundidad* (Resumen Ejecutivo, Desempeño Comercial, Heatmap, Turnos, Mix, Ranking, Ingeniería de Menú, Dependencia, Cortesías, Oportunidades, Alertas). Invariantes clave: dinero agregado del negocio sale de **Recibos** (venta neta canónica en `services/venta_neta.py`, nunca sumar `total`); dinero por producto sale de **Catálogo × Comandas**, nunca de Productos Vendidos; los servicios de Análisis son puros (el router consulta y los llama); `punto_venta` del Catálogo es texto literal de origen (no filtrar con "Restaurante"); Productos Vendidos de Restaurante se identifica por `fecha_desde`/`fecha_hasta`, Cafetería/Carreta aún por `periodo`.
5. **Amarre de Costo de Ventas** — [`docs/modulos/05-amarre-costo.md`](docs/modulos/05-amarre-costo.md). Conciliación de inventario del hotel con 12 reportes Novohit; se parsea por **texto de etiqueta**, no por posición; el export Excel es un clon con fórmulas vivas. Archivos: `api/amarre_costo.py`, `services/amarre_costo_*.py`, `models/amarre_costo_periodo.py`. Muestras reales en `INVETARIOS/`.
6. **Saldo Cuenta Huésped** — [`docs/modulos/06-saldo-cuenta-huesped.md`](docs/modulos/06-saldo-cuenta-huesped.md). Tarjeta dentro de Pagos de Recepción; sube el RCP170 mensual, captura manual de SUBTOTAL/IVA/PROPINA/IEPS/ISH por línea. Mount `/saldo-cuenta-huesped`.
7. **Reporte de producción (Carnes y Mariscos)** — [`docs/modulos/07-reporte-produccion.md`](docs/modulos/07-reporte-produccion.md). Inventario diario de porciones por captura; la existencia final **se calcula en cadena**, no se guarda; guardado automático con borrador local. Mount `/reporte-produccion`, frontend `components/ReporteProduccionPanel.tsx`.
8. **Fiesta de Fin de Año** — [`docs/modulos/08-fiesta-fin-anio.md`](docs/modulos/08-fiesta-fin-anio.md). Croquis SVG de 72 mesas y reservaciones agrupadas con pagos. Invariantes: índice único `uq_fiesta_silla_activa` (anti doble venta); precio y preventa se congelan por silla al vender; pagos por silla son **derivados al leer**; toda mutación nueva debe llamar a `_bitacora(..., reservacion=, antes=, despues=)`; no cambiar `CENTRO_ESPEJO`; no volver a un nodo SVG por silla ni guardar la vista del croquis en `useState`. **Autorización: el PIN de supervisor fue sustituido por `/auth/autorizar` (JWT de un solo uso en `X-Autorizacion`, módulo 9)**; las secciones del detalle que aún hablan del PIN son históricas. Verificar `alembic upgrade head` y `pytest tests/test_fiesta_fin_anio.py` antes de dar el módulo por bueno.
9. **Seguridad (login, roles, permisos)** — [`docs/modulos/09-seguridad.md`](docs/modulos/09-seguridad.md). Login por *usuario* (columna `usuarios.email`), bcrypt, access JWT 15 min **en memoria** + refresh en cookie `httpOnly` con rotación, matriz `permisos_rol` por módulo, bitácora `auditoria`. **Un router nuevo debe montarse con `requiere(<modulo>)`** (`tests/test_autorizacion_rutas.py` falla si no). `get_db` hace rollback en excepción: lo que deba persistir en una respuesta de error requiere `commit` previo o `JSONResponse`. Recuperación de acceso: `scripts/crear_admin.py`.

### Backend layout (`backend/app/`)

- `main.py` — registers routers with prefixes (`/auth`, `/ingresos`, `/pagos`, `/conciliacion`, `/facturacion`, `/pagos/retenciones`, `/pagos-recepcion`, `/catalogo-productos(-cafeteria|-carreta-mariscos)`, `/costeo(-cafeteria|-carreta-mariscos)`, `/productos-vendidos(-cafeteria|-carreta-mariscos)`, `/comandas-emitidas`, `/recibos-emitidos`, `/conciliacion-ventas-diarias`, `/resumen-ejecutivo`, `/heatmap-ventas`, `/ranking-productos`, `/panel-turnos`, `/cortesias-dashboard`, `/oportunidades-comerciales`, `/menu-engineering`, `/mix-ventas`, `/dependencia-productos`, `/alertas-riesgo`, `/desempeno-comercial`, `/amarre-costo`, `/administracion`, `/saldo-cuenta-huesped`, `/reporte-produccion`, `/fiesta-fin-anio`) and CORS from `settings.cors_origins_list`.
- `core/config.py` — `Settings` (pydantic-settings); default `database_url` falls back to local SQLite when no `.env` is set; `storage_dir` (default `./storage`) is where uploaded invoice attachments live on disk (never as DB blobs).
- `db/session.py` — async engine/session; `get_db()` commits on success, rolls back on exception.
- `schemas/` — Pydantic v2 models, only partially adopted; many newer endpoints (Facturación, Pagos de Recepción, Catálogo) return plain dicts rather than a schema.


### Frontend layout (`frontend/src/`)

- `api/client.ts` — instancia Axios con `baseURL` `/api` (proxy de Vite → `127.0.0.1`); adjunta el access token **guardado en memoria** (ver `auth/*`, módulo 9; no usa `localStorage`) y, ante 401, intenta `/auth/refresh` antes de mandar a `/login`.
- `api/hooks.ts` — all backend calls go through React Query hooks here; add new endpoints here rather than calling axios directly from components.
- `types/index.ts` — TypeScript interfaces hand-mirrored from backend Pydantic schemas; keep in sync manually.
- `theme/` — Mantine v7 theme; `estadoPago.ts`'s `ESTADO_PAGO_CONFIG` centralizes the `Pago.estado` → color/label mapping.
- `pages/CatalogoProductosPage.tsx` (~8000+ líneas, todo el módulo 4 en un archivo) — navegación por tarjetas anidadas con botón "volver", sin `Tabs` planos; los `Tabs` deben usar `keepMounted={false}`. Detalle en `docs/modulos/04-catalogo-productos.md`. Toda mutación de subida/borrado en `api/hooks.ts` debe invalidar las demás vistas cuyo dato pueda quedar viejo (fuente recurrente de bugs de "dato obsoleto").
- `pages/FacturacionPage.tsx`, `pages/PagosRecepcionPage.tsx`, `pages/AmarreCostoPage.tsx` — standalone pages (own sidebar items/routes) for modules 2, 3, and 5, not `WorkspacePage` tabs.
- `pages/ConciliacionPage.tsx` and `pages/UploadPage.tsx` have preexisting TS issues unrelated to any single feature (Mantine prop-type drift, unused imports) — don't assume errors there are from your changes.
