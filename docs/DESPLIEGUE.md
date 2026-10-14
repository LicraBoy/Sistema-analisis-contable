# Despliegue en el servidor y cómo actualizar

**Regla de oro: el código viaja por Git (GitHub privado); los datos (BD, `backend/storage/`, `.env`, `backups/`) nunca.**

## Roles
- **PC de desarrollo** (la de siempre): se programa, se prueba (`pytest`, `npm run build`) y se hace `git push`.
- **PC servidor** (IP fija + nombre de TI): solo corre `iniciar_produccion.bat` y `actualizar_servidor.bat`. No se programa ahí.

## Instalación inicial en el servidor (una vez)
1. Pedir a TI: IP fija, nombre DNS (ej. `sistema.empresa.local`), regla de firewall al **puerto 443** (y 80 para la redirección), exclusiones de antivirus para la carpeta del proyecto y, ideal, un certificado de la CA de la empresa.
2. Instalar Git, Node LTS y **Python de python.org ("solo para mí")** (no el de la Microsoft Store: se cuelga).
3. `git clone <repo privado>` en la carpeta del servidor.
4. `cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt`
5. Crear `backend\.env` (no viene en Git):
   ```
   ENTORNO=produccion
   SECRET_KEY=<cadena aleatoria larga; se genera con: scripts\crear_admin.py clave-secreta>
   COOKIE_SECURE=true
   CORS_ORIGINS=https://sistema.empresa.local
   DATABASE_URL=sqlite+aiosqlite:///./local_db.sqlite3
   ```
6. Copiar desde la PC de desarrollo (USB/red): un respaldo reciente (`backups\*.sqlite3`) como `backend\local_db.sqlite3` y la carpeta `backend\storage\`.
7. Descargar `caddy.exe` (Windows amd64, https://caddyserver.com/download) a `caddy\caddy.exe`.
8. Editar `SISTEMA_HOST` en `iniciar_produccion.bat` y ejecutar `actualizar_servidor.bat` (instala, migra y compila).
9. Ejecutar `iniciar_produccion.bat`. Abrir `https://<nombre>`.
10. Certificado: con `tls internal` Caddy crea su propia CA; TI debe instalar su raíz (`%APPDATA%\Caddy\pki\authorities\local\root.crt`) como "entidad raíz de confianza" en las PCs (GPO). Con certificado de TI: cambiar la línea `tls` del `Caddyfile`.
11. Arranque automático: Programador de tareas → "Al iniciar sesión" → `iniciar_produccion.bat`. Programar también `respaldar_bd.bat` **diario** y copiar `backups\` y `backend\storage\` a otra ubicación.

## Actualizar (cada vez)
1. En desarrollo: `pytest` verde, `npm run build` sin errores, fusionar a `main`, `git push`.
2. En el servidor: ejecutar **`actualizar_servidor.bat`** (respaldo → `git pull` → `pip` → `alembic upgrade head` → build → reinicio del backend). Corte de ~15–20 s: avisar o hacerlo fuera de horario.
3. Las migraciones nuevas deben ser **aditivas** (no borrar datos). Probarlas antes sobre una copia de la BD del servidor (`scripts/qa/levantar_prueba.sh`).

## Si algo sale mal
- Código: `git checkout <versión anterior>` (el script imprime el hash) y volver a compilar.
- Datos: `detener_servidores.bat` y `backend\.venv\Scripts\python.exe scripts\respaldar_bd.py --restaurar backups\NOMBRE.sqlite3`.
