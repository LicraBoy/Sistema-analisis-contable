# Pruebas E2E de navegador (QA)

Entorno **aislado** (nunca toca la base real): una copia de la BD, backend en `:8011` con login activo y Vite en `:5180`.

```bash
bash scripts/qa/levantar_prueba.sh      # copia la BD (de backups/ o local_db), crea usuarios qa_* y levanta ambos servidores
node scripts/qa/e2e_qa.mjs              # login, permisos por rol, menú, Auditoría, móvil
node scripts/qa/e2e_pago_ui.mjs         # cobro con 2 formas = un Pago 1; silla pagada visible en el mapa
```

Usuarios QA (contraseña `Prueba-QA-2026`): `qa_administrador`, `qa_contralor`, `qa_supervisor_fiesta`, `qa_cajera_fiesta`.
Requiere Edge en `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` y Node ≥ 22 (WebSocket global).
Al terminar, cierra los procesos que escuchan en 8011 y 5180 (no uses `taskkill` sobre todos los python/node).
