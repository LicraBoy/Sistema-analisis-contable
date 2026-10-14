@echo off
title Iniciar SERVIDOR DE PRODUCCION - Sistema de Analisis Contable
cd /d "%~dp0"

REM ===== EDITAR: nombre que TI asigno a esta PC =====
set "SISTEMA_HOST=sistema.empresa.local"
REM ==================================================

if not exist "frontend\dist\index.html" (
  echo FALTA frontend\dist. Ejecuta actualizar_servidor.bat primero ^(compila el frontend^).
  pause
  exit /b 1
)
if not exist "caddy\caddy.exe" (
  echo FALTA caddy\caddy.exe ^(descargar de https://caddyserver.com/download, Windows amd64^). Ver docs\DESPLIEGUE.md
  pause
  exit /b 1
)

echo [0/2] Limpiando procesos anteriores...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1
taskkill /F /IM caddy.exe >nul 2>&1

if not exist logs mkdir logs
start "" /min cmd /c ""%~dp0backend\.venv\Scripts\python.exe" "%~dp0scripts\respaldar_bd.py" >> "%~dp0logs\respaldo.log" 2>&1"

echo [1/2] Backend (FastAPI) bajo vigilante...
start "Vigilante - Backend" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\vigilante.ps1" -Nombre backend -Directorio backend -Archivo ".venv\Scripts\python.exe" -Argumentos "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1" -Url http://127.0.0.1:8000/health

echo [2/2] HTTPS (Caddy) en https://%SISTEMA_HOST%
start "Caddy" /min "%~dp0caddy\caddy.exe" run --config "%~dp0Caddyfile" --adapter caddyfile

echo.
echo Listo. Deja abiertas las ventanas. Para apagar: detener_servidores.bat
timeout /t 8 > nul
