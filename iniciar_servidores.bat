@echo off
title Iniciar Servidores - Sistema de Analisis Contable
echo =====================================================================
echo    INICIANDO SERVIDORES - SISTEMA DE ANALISIS CONTABLE
echo =====================================================================
echo.
echo Cada servidor corre bajo un "vigilante": si se cuelga al arrancar o se
echo cae, se reinicia solo. El registro queda en la carpeta logs\.
echo.

REM Liberar los puertos si quedo algo de una sesion anterior (solo lo que escucha ahi)
echo [0/3] Limpiando procesos anteriores...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1

REM Respaldo diario de la base de datos en segundo plano (si Python se cuelga, no detiene el arranque)
start "" /min cmd /c ""%~dp0backend\.venv\Scripts\python.exe" "%~dp0scripts\respaldar_bd.py" >> "%~dp0logs\respaldo.log" 2>&1"

set "VIG=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\vigilante.ps1""

echo [1/3] Levantando el Backend (FastAPI)...
start "Vigilante - Backend" %VIG% -Nombre backend -Directorio backend -Archivo ".venv\Scripts\python.exe" -Argumentos "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -Url http://127.0.0.1:8000/health

echo [2/3] Levantando el Frontend (React/Vite)...
start "Vigilante - Frontend" %VIG% -Nombre frontend -Directorio frontend -Archivo "cmd.exe" -Argumentos "/c npm run dev" -Url http://localhost:5173/

echo [3/3] Esperando a que respondan (puede tardar hasta 1 minuto)...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 60 -and -not $ok;$i++){ Start-Sleep -Seconds 2; try{ $a=(Invoke-WebRequest -Uri http://127.0.0.1:8000/health -UseBasicParsing -TimeoutSec 3).StatusCode; $b=(Invoke-WebRequest -Uri http://localhost:5173/ -UseBasicParsing -TimeoutSec 3).StatusCode; if($a -eq 200 -and $b -eq 200){$ok=$true} }catch{} }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo.
  echo AVISO: los servidores aun no responden. Los vigilantes siguen reintentando;
  echo revisa las ventanas "Vigilante" y los archivos de la carpeta logs\.
) else (
  echo.
  echo =====================================================================
  echo    SERVIDORES LISTOS
  echo    - Aplicacion: http://localhost:5173
  echo    - Registro:   carpeta logs\  (backend.log, frontend.log)
  echo =====================================================================
  start http://localhost:5173
)

echo.
echo Deja abiertas las dos ventanas "Vigilante" (puedes minimizarlas).
echo Para apagar todo usa detener_servidores.bat
echo.
timeout /t 8 > nul
