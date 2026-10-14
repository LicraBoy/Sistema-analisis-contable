@echo off
title Actualizar servidor - Sistema de Analisis Contable
cd /d "%~dp0"
echo =====================================================================
echo   ACTUALIZAR EL SISTEMA (codigo desde GitHub; los DATOS no se tocan)
echo =====================================================================

echo [1/6] Respaldo de la base de datos...
"backend\.venv\Scripts\python.exe" scripts\respaldar_bd.py
if errorlevel 1 (
  echo FALLO el respaldo. No se actualiza.
  pause
  exit /b 1
)

for /f %%h in ('git rev-parse --short HEAD') do set "ANTES=%%h"
echo Version actual: %ANTES%  ^(para volver atras: git checkout %ANTES%^)

echo [2/6] Descargando cambios...
git pull --ff-only
if errorlevel 1 (
  echo FALLO git pull.
  pause
  exit /b 1
)

echo [3/6] Dependencias del backend...
"backend\.venv\Scripts\python.exe" -m pip install -q -r backend\requirements.txt
if errorlevel 1 (
  echo FALLO pip.
  pause
  exit /b 1
)

echo [4/6] Migraciones de base de datos...
pushd backend
set "PYTHONPATH=."
".venv\Scripts\alembic.exe" upgrade head
if errorlevel 1 (
  popd
  echo FALLO alembic. Restaura el respaldo ^(ver docs\DESPLIEGUE.md^).
  pause
  exit /b 1
)
popd

echo [5/6] Compilando el frontend...
pushd frontend
call npm ci
if errorlevel 1 (
  popd
  echo FALLO npm ci.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  popd
  echo FALLO el build.
  pause
  exit /b 1
)
popd

echo [6/6] Reiniciando backend...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1
echo El vigilante lo vuelve a levantar solo ^(~15 s^).
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 30 -and -not $ok;$i++){ Start-Sleep -Seconds 2; try{ if((Invoke-WebRequest http://127.0.0.1:8000/health -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200){$ok=$true} }catch{} }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo AVISO: el backend no responde; revisa logs\backend.log
) else (
  echo ACTUALIZADO Y FUNCIONANDO.
)
pause
