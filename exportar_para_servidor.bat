@echo off
title Preparar paquete de DATOS para el servidor
cd /d "%~dp0"
echo =====================================================================
echo   PAQUETE DE DATOS PARA LLEVAR AL SERVIDOR (USB o red)
echo   El CODIGO va por GitHub; esto lleva SOLO los datos.
echo =====================================================================
echo.
echo IMPORTANTE: cierra el sistema en esta PC ^(detener_servidores.bat^) para que nadie escriba.
pause

"backend\.venv\Scripts\python.exe" scripts\respaldar_bd.py
if errorlevel 1 (
  echo FALLO el respaldo.
  pause
  exit /b 1
)

set "DEST=%~dp0paquete_servidor"
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"

for /f "delims=" %%f in ('dir /b /o-d "backups\local_db_*.sqlite3"') do (
  copy /y "backups\%%f" "%DEST%\local_db.sqlite3" >nul
  echo Base de datos: %%f
  goto :copiada
)
:copiada
robocopy "backend\storage" "%DEST%\storage" /E /NFL /NDL /NJH /NJS >nul
echo.
echo LISTO: copia la carpeta  paquete_servidor\  a la USB.
echo En el servidor:  local_db.sqlite3 -^> backend\local_db.sqlite3   y   storage\ -^> backend\storage\
echo Cuando termines, borra la USB y esa carpeta ^(contiene datos reales^).
pause
