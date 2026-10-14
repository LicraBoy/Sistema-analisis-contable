@echo off
title Detener Servidores
echo Cerrando vigilantes y servidores...

REM Primero los vigilantes (si no, reiniciarian los servidores que se cierren)
for /f "tokens=2 delims=," %%p in ('wmic process where "name='powershell.exe' and commandline like '%%vigilante.ps1%%'" get processid /format:csv 2^>nul ^| findstr /r "[0-9]"') do taskkill /F /T /PID %%p >nul 2>&1

REM Despues lo que escucha en los puertos
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /F /T /PID %%a >nul 2>&1

echo Listo.
timeout /t 3 > nul
