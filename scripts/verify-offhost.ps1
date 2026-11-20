param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$KeyFile = (Join-Path $PSScriptRoot '..\_backup\offhost\backup-key.dpapi'),
  [switch]$SimulateCarrierMigration
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$entropy = [System.Text.Encoding]::UTF8.GetBytes('GeoModi off-host backup v1')
$key = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($KeyFile)), $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
  $file = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($BackupFile))
  $header = [System.Text.Encoding]::ASCII.GetBytes('GEOMODI-BACKUP-1')
  if ($file.Length -lt ($header.Length + 28)) { throw 'Respaldo cifrado incompleto' }
  for ($i=0; $i -lt $header.Length; $i++) { if ($file[$i] -ne $header[$i]) { throw 'Formato de respaldo desconocido' } }
  $nonce = [byte[]]::new(12); $tag = [byte[]]::new(16); $ciphertext = [byte[]]::new($file.Length - $header.Length - 28)
  [Buffer]::BlockCopy($file, $header.Length, $nonce, 0, 12)
  [Buffer]::BlockCopy($file, $header.Length + 12, $tag, 0, 16)
  [Buffer]::BlockCopy($file, $header.Length + 28, $ciphertext, 0, $ciphertext.Length)
  $plaintext = [byte[]]::new($ciphertext.Length)
  $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
  try { $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, $header) } finally { $aes.Dispose() }
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = 'python'; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'verify-offhost-sqlite.py'))
  if ($SimulateCarrierMigration) { $start.ArgumentList.Add('--simulate-carriers') }
  $process = [System.Diagnostics.Process]::Start($start)
  try {
    $process.StandardInput.BaseStream.Write($plaintext, 0, $plaintext.Length)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd(); $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Falló la restauración aislada: $stderr" }
    Write-Output $stdout.Trim()
  } finally { $process.Dispose() }
} finally {
  if ($key) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key) }
  if ($plaintext) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext) }
}
