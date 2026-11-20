$ErrorActionPreference = 'Stop'
$runtime = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1
if (-not $runtime) { throw 'No se encuentra el runtime de PowerShell de Codex' }
$executable = Join-Path $runtime.InstallLocation 'dependencies\native\powershell\pwsh.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'No se encuentra PowerShell 7' }
& $executable -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'backup-offhost.ps1')
exit $LASTEXITCODE
