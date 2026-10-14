# QA previo al lanzamiento — Sistema de Análisis Contable

Fecha: 2026-10-14. Alcance: backend (API), frontend, seguridad, Fiesta de Fin de Año, operación (respaldo, arranque).
Todo se probó con bases en memoria, una **copia** de la base real o un entorno aislado (`scripts/qa/`); la base real no se tocó.

## Resultado

| Área | Qué se probó | Resultado |
|---|---|---|
| Suite automática | `pytest` completo (375 pruebas) | ✅ todo en verde (se corrigieron 2 pruebas viejas desactualizadas en `test_pagos_egresos.py`) |
| Compilación | `npx tsc -b`, `npm run build` | ✅ sin errores (aviso informativo: el bundle pesa 1.9 MB; no bloquea) |
| Lint | `npm run lint` | ⚠️ el proyecto **no tiene** configuración de ESLint (ya constaba en `CLAUDE.md`); no se inventó una |
| Autorización de rutas | `tests/test_autorizacion_rutas.py`: las 6 verificaciones recorren **todas** las rutas (sin token → 401; rol sin módulo → 403; "solo ver" no escribe; administración solo admin; auditoría de Fiesta no para cajeras) | ✅ pasa. Falla sola si alguien agrega un router sin `requiere(...)` |
| Humo de la API | `tests/test_humo_api.py`: los 97 GET con base vacía | ✅ (había 3 fallos reales, corregidos: ver D1) |
| Flujo de la Fiesta | `tests/test_fiesta_flujo_api.py`: reservar → doble venta (409) → cobro con 2 formas = un Pago 1 → corregir/cancelar pago → cancelar reservación → auditoría de cada paso; validaciones (importes ≤ 0, ids inexistentes, tipos/correos inválidos); sobrepago; cortesía; preventa→normal; 6 cajas a la vez sobre la misma silla | ✅ |
| Migraciones | `f8b3…`, `f9c4…`, `fa1b…` sobre una copia de la BD real: bajar y subir | ✅ los datos del negocio quedan igual; solo se recrean (vacías) las tablas de seguridad al bajar — **no se usa `downgrade` en producción** |
| Navegador (E2E) | `scripts/qa/e2e_qa.mjs` (login, errores, menú por rol, acceso denegado, Auditoría, móvil) y `e2e_pago_ui.mjs` (cobro de 2 formas, silla pagada en el mapa) | ✅ sin respuestas 5xx ni excepciones de consola |
| Seguridad (caja negra) | cabeceras, cookie `HttpOnly; SameSite=Strict`, CORS ajeno, JWT alterado/forjado, `X-Requested-With` en refresh, tope de carga (413), inyección SQL en login y filtros, `target=_blank`/`innerHTML` | ✅ |
| Rendimiento | mesas, reservaciones, cobros, resumen, auditoría, usuarios con los datos reales | ✅ todos < 110 ms (mediana de 3) |
| Respaldo | `scripts/respaldar_bd.py` (API de respaldo de SQLite + chequeo de integridad) | ✅ 45.8 MB, íntegro. La **restauración** se revisó por código pero no se ejecutó contra la base real |

## Defectos encontrados y corregidos

| # | Gravedad | Defecto | Corrección |
|---|---|---|---|
| D1 | Alta | `GET /costeo*/productos` daba **500** (`KeyError: 'iva_factor'`) en una base sin configuración de costeo guardada (instalación nueva o restaurada) | Valores por omisión en `configuracion_con_defaults` (3 routers de costeo) |
| D2 | Alta | Silla pagada no se veía pagada en el **mapa** (pintaba por el estado de la reservación) | El mapa y sus filtros usan el estado de pago de cada silla |
| D3 | Alta | Cobro con 2 formas de pago contaba como Pago 1 **y** Pago 2 | `cobro_id`: un cobro = un Pago N (por silla y en Cobros día a día) |
| D4 | Media | Varias cajas escribiendo a la vez podían chocar con "database is locked" (SQLite en modo por omisión) | `WAL` + `busy_timeout` (15 s) en `db/session.py`; probado con 6 reservaciones simultáneas de la misma silla: 1 gana, 5 reciben 409, ninguna 500 |
| D5 | Media | Extensiones `.xls/.xlsx` validadas distinguiendo mayúsculas (rechazaba `ARCHIVO.XLSX`) en ~25 endpoints | `.lower()` |
| D6 | Media | `Content-Disposition` armado con texto del usuario (inyección de cabeceras / 500 con caracteres fuera de latin-1, p. ej. un grupo con "–") | `app/core/descargas.py::cabecera_descarga` (ASCII limpio + `filename*=UTF-8`) |
| D7 | Media | La auditoría/bitácora de la Fiesta era legible por cualquier cajera | Capacidad `fiesta_auditoria` + pestaña Auditoría con antes/después |
| D8 | Baja | 2 pruebas viejas fallaban (`_construir_filas_amarre` devuelve 8 valores) | Actualizadas |

## Riesgos aceptados / pendientes (decisión de negocio o de TI)

1. **HTTP sin cifrar** dentro de la red: las contraseñas viajan en claro. Recomendado HTTPS con proxy local; mientras tanto no exponer fuera de la red interna. Con HTTPS activar `COOKIE_SECURE=true`.
2. **Python de la Microsoft Store** + antivirus: arranques que se cuelgan (medido). Mitigado con `scripts/vigilante.ps1`. Solución de fondo: instalar Python de python.org (solo para el usuario) y recrear `backend\.venv`, y pedir a TI exclusiones del antivirus.
3. `ENTORNO` sigue en `desarrollo` (`/docs` abierto). Para lanzar: `ENTORNO=produccion` en `backend/.env` (el arranque exige una `SECRET_KEY` fuerte, ya generada).
4. Sin lint configurado y bundle grande (1.9 MB): no bloquean, conviene dividir el bundle más adelante.
5. Los respaldos viven en la misma PC (`backups/`): copiar la carpeta a otra ubicación (red/nube) periódicamente.
6. Firewall de Windows / IP fija para acceso desde otras PCs (requiere TI).

## Lista de verificación de salida (go / no-go)

- [x] `pytest` en verde y `tsc`/`build` sin errores
- [x] Todas las rutas protegidas (prueba automática)
- [x] Flujo de la Fiesta y auditoría verificados por API y por navegador
- [x] Respaldo creado y verificado; se hace solo al iniciar el sistema
- [ ] Reiniciar los servidores con `iniciar_servidores.bat` (para cargar las correcciones de esta ronda)
- [ ] Crear los usuarios reales (Administración → Usuarios) y entregar contraseñas temporales
- [ ] `ENTORNO=produccion` en `backend/.env`
- [ ] Copiar `backups/` a otro lugar y probar una restauración en una copia
- [ ] Solicitar a TI: exclusiones del antivirus, IP fija y regla de firewall para el puerto 5173

## Cómo repetir esta QA

```bash
cd backend && set PYTHONPATH=. && .venv\Scripts\python -m pytest -q          # suite completa
cd frontend && npx tsc -b && npm run build
bash scripts/qa/levantar_prueba.sh && node scripts/qa/e2e_qa.mjs && node scripts/qa/e2e_pago_ui.mjs   # navegador
backend\.venv\Scripts\python scripts\respaldar_bd.py                          # respaldo
```
