<#
  vigilante.ps1 — mantiene vivo un servidor (backend o frontend).

  - Arranca el proceso y espera a que responda su URL de salud (si se cuelga al arrancar, mata SOLO ese
    proceso y reintenta; en esta PC python/node se cuelgan a ratos al iniciar).
  - Una vez arriba lo vigila cada 15 s; si muere o deja de responder 3 veces seguidas, lo reinicia.
  - Escribe todo en logs\<nombre>.log (y la salida del servidor en logs\<nombre>.out.log / .err.log).

  Uso (lo llama iniciar_servidores.bat):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\vigilante.ps1 `
      -Nombre backend -Directorio backend -Archivo ".venv\Scripts\python.exe" `
      -Argumentos "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -Url http://127.0.0.1:8000/health
#>
param(
    [Parameter(Mandatory = $true)][string]$Nombre,
    [Parameter(Mandatory = $true)][string]$Directorio,   # relativo a la raíz del proyecto
    [Parameter(Mandatory = $true)][string]$Archivo,      # ejecutable (relativo al Directorio o en el PATH)
    [string]$Argumentos = "",
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$EsperaArranqueSeg = 45,
    [int]$MaxReintentosArranque = 6,
    [int]$RespaldoCadaMin = 0   # >0: ejecuta scripts\respaldar_bd.py cada tantos minutos mientras el servidor está vivo
)

$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $raiz $Directorio
$logs = Join-Path $raiz "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs "$Nombre.log"
$out = Join-Path $logs "$Nombre.out.log"
$err = Join-Path $logs "$Nombre.err.log"
$host.UI.RawUI.WindowTitle = "Vigilante - $Nombre"

function Escribir([string]$mensaje) {
    $linea = "{0}  [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Nombre, $mensaje
    Write-Host $linea
    try {
        if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) { Move-Item $log "$log.old" -Force }
        Add-Content -Path $log -Value $linea -Encoding UTF8
    } catch { }
}

function Responde() {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
        return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
    } catch { return $false }
}

function Matar($proc) {
    if ($null -eq $proc) { return }
    # /T mata también a los hijos (npm -> node); solo el árbol de ESTE proceso, nunca todos los python/node.
    & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null
}

function Arrancar() {
    # Devuelve el proceso ya respondiendo, o $null si agotó los reintentos.
    for ($intento = 1; $intento -le $MaxReintentosArranque; $intento++) {
        Escribir "Arrancando (intento $intento/$MaxReintentosArranque)..."
        $exe = $Archivo
        if (Test-Path (Join-Path $dir $Archivo)) { $exe = Join-Path $dir $Archivo }
        $proc = Start-Process -FilePath $exe -ArgumentList $Argumentos -WorkingDirectory $dir `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
        $limite = (Get-Date).AddSeconds($EsperaArranqueSeg)
        while ((Get-Date) -lt $limite) {
            Start-Sleep -Seconds 2
            if ($proc.HasExited) { Escribir "El proceso terminó al arrancar (código $($proc.ExitCode))."; break }
            if (Responde) { Escribir "Arriba (PID $($proc.Id))."; return $proc }
        }
        if (-not $proc.HasExited) { Escribir "No respondió en $EsperaArranqueSeg s (arranque colgado): se reinicia." }
        Matar $proc
        Start-Sleep -Seconds ([Math]::Min(2 * $intento, 10))
    }
    return $null
}

$ultimoRespaldo = Get-Date
$procRespaldo = $null
function RespaldoPeriodico() {
    if ($RespaldoCadaMin -le 0) { return }
    # Un respaldo colgado (python a veces se cuelga al iniciar) se mata a los 3 min para no acumular procesos.
    if ($null -ne $script:procRespaldo -and -not $script:procRespaldo.HasExited) {
        if (((Get-Date) - $script:ultimoRespaldo).TotalMinutes -gt 3) { Escribir "Respaldo colgado: se cancela."; Matar $script:procRespaldo; $script:procRespaldo = $null }
        return
    }
    if (((Get-Date) - $script:ultimoRespaldo).TotalMinutes -lt $RespaldoCadaMin) { return }
    $script:ultimoRespaldo = Get-Date
    $py = Join-Path $raiz "backend\.venv\Scripts\python.exe"
    $script:procRespaldo = Start-Process -FilePath $py -ArgumentList "`"$(Join-Path $raiz 'scripts\respaldar_bd.py')`"" -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "respaldo.log") -RedirectStandardError (Join-Path $logs "respaldo.err.log")
    Escribir "Respaldo automático iniciado."
}

Escribir "Vigilante iniciado. Salud: $Url"
while ($true) {
    $proc = Arrancar
    if ($null -eq $proc) {
        Escribir "No se pudo levantar tras $MaxReintentosArranque intentos. Se vuelve a intentar en 60 s (revisa logs\$Nombre.err.log)."
        Start-Sleep -Seconds 60
        continue
    }
    $fallos = 0
    while ($true) {
        Start-Sleep -Seconds 15
        RespaldoPeriodico
        if ($proc.HasExited) { Escribir "El proceso se cayó (código $($proc.ExitCode)). Reiniciando..."; break }
        if (Responde) { $fallos = 0; continue }
        $fallos++
        Escribir "No responde ($fallos/3)."
        if ($fallos -ge 3) { Escribir "Sin respuesta: se reinicia."; Matar $proc; break }
    }
}
