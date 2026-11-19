param(
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\_backup\offhost'),
  [int]$MaximumBackupAgeHours = 36,
  [string]$AppUrl = 'https://www.geomodi.ai/'
)
$ErrorActionPreference = 'Stop'
$problems = [System.Collections.Generic.List[string]]::new()
try {
  $response = Invoke-WebRequest -Uri $AppUrl -TimeoutSec 15 -UseBasicParsing
  if ($response.StatusCode -ne 200) { $problems.Add("Web respondió HTTP $($response.StatusCode)") }
} catch { $problems.Add('No se pudo consultar la web pública') }
try {
  $remote = "systemctl --user is-active geomodi-libsql.service && find /home/administrador/services/geomodi-libsql/backups -maxdepth 1 -name 'geomodi-*.tar.gz' -printf '%T@
' | sort -n | tail -n 1 #"
  # La orden viaja por stdin para evitar diferencias de comillas entre Windows PowerShell y PowerShell 7.
  $result = @($remote | & ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 pcmidi 'bash -s')
  if ($LASTEXITCODE -ne 0 -or $result.Count -lt 2 -or $result[0] -ne 'active') { throw 'Servidor o respaldo inaccesible' }
  $timestamp = [double]::Parse($result[-1], [System.Globalization.CultureInfo]::InvariantCulture)
  $age = [DateTimeOffset]::UtcNow - [DateTimeOffset]::FromUnixTimeSeconds([long][math]::Floor($timestamp))
  if ($age.TotalHours -gt $MaximumBackupAgeHours) { $problems.Add('El respaldo nocturno del servidor está vencido') }
} catch { $problems.Add('No se pudo verificar el servicio y el respaldo del servidor') }
try {
  $task = Get-ScheduledTask -TaskName 'GeoModi-Respaldo-Externo'
  $info = Get-ScheduledTaskInfo -TaskName 'GeoModi-Respaldo-Externo'
  if ($task.State -eq 'Disabled') { $problems.Add('La tarea de respaldo externo está deshabilitada') }
  if ($task.State -ne 'Running' -and $info.LastTaskResult -ne 0) { $problems.Add("La última tarea de respaldo externo falló: $($info.LastTaskResult)") }
  $latest = Get-ChildItem -LiteralPath $BackupDirectory -Filter '*.gmbak' -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $latest -or ([DateTime]::UtcNow - $latest.LastWriteTimeUtc).TotalHours -gt $MaximumBackupAgeHours) { $problems.Add('No hay una copia externa reciente') }
} catch { $problems.Add('No se pudo verificar la copia externa o su tarea') }
if ($problems.Count) {
  $problems | ForEach-Object { Write-Output "ERROR: $_" }
  exit 1
}
Write-Output 'Web, servicio, respaldo nocturno y copia externa: controles aprobados'
