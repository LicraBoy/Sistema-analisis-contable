@echo off
title Respaldo de la base de datos
echo Creando respaldo de la base de datos (carpeta backups\)...
"%~dp0backend\.venv\Scripts\python.exe" "%~dp0scripts\respaldar_bd.py"
echo.
echo Para restaurar uno:  detener_servidores.bat  y despues
echo   backend\.venv\Scripts\python.exe scripts\respaldar_bd.py --restaurar backups\NOMBRE.sqlite3
timeout /t 8 > nul
