param(
  [string]$AppUrl = 'https://www.geomodi.ai/',
  [string]$StateDirectory = (Join-Path $PSScriptRoot '..\_backup\offhost'),
  [switch]$DryRunNotification
)
$ErrorActionPreference = 'Stop'
$runtime = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1
if (-not $runtime) { throw 'No se encuentra el runtime de PowerShell de Codex' }
$executable = Join-Path $runtime.InstallLocation 'dependencies\native\powershell\pwsh.exe'
$stateDirectory = [System.IO.Path]::GetFullPath($StateDirectory)
[System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
$stateFile = Join-Path $stateDirectory 'health-state.txt'
$previous = if (Test-Path -LiteralPath $stateFile) { [System.IO.File]::ReadAllText($stateFile).Trim() } else { '' }
$details = & $executable -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'check-operational-health.ps1') -AppUrl $AppUrl 2>&1
$failed = $LASTEXITCODE -ne 0
$current = if ($failed) { 'error' } else { 'ok' }
if ($failed -and $previous -ne 'error') {
  if ($DryRunNotification) { Write-Output 'Alerta local: simulación' } else { try {
    Add-Type -AssemblyName System.Windows.Forms
    $notification = New-Object System.Windows.Forms.NotifyIcon
    $notification.Icon = [System.Drawing.SystemIcons]::Warning
    $notification.Visible = $true
    $notification.ShowBalloonTip(10000, 'GeoModi necesita revisión', 'Falló un control de disponibilidad o respaldo. Ejecutá check-operational-health.ps1 para ver el detalle.', [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 10
    $notification.Dispose()
  } catch { Write-Error "No se pudo mostrar la alerta de GeoModi: $_" } }
}
[System.IO.File]::WriteAllText($stateFile, $current)
if ($failed) { $details | ForEach-Object { Write-Output $_ }; exit 1 }
Write-Output 'GeoModi: controles operativos aprobados'
