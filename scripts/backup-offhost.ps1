param(
    [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\_backup\offhost'),
    [string]$SourceHost = 'pcmidi',
    [string]$InputArchive = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$backupRoot = [System.IO.Path]::GetFullPath($BackupDirectory)
[System.IO.Directory]::CreateDirectory($backupRoot) | Out-Null
$keyPath = Join-Path $backupRoot 'backup-key.dpapi'
$entropy = [System.Text.Encoding]::UTF8.GetBytes('GeoModi off-host backup v1')
if (Test-Path -LiteralPath $keyPath) {
    $protectedKey = [System.IO.File]::ReadAllBytes($keyPath)
    $key = [System.Security.Cryptography.ProtectedData]::Unprotect($protectedKey, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
    if (Get-ChildItem -LiteralPath $backupRoot -Filter '*.gmbak' -File -ErrorAction SilentlyContinue | Select-Object -First 1) { throw 'Falta la clave de respaldos existentes; no se creará una clave nueva' }
    $key = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $protectedKey = [System.Security.Cryptography.ProtectedData]::Protect($key, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $keyFile = [System.IO.File]::Open($keyPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $keyFile.Write($protectedKey, 0, $protectedKey.Length); $keyFile.Flush($true) } finally { $keyFile.Dispose() }
}
try {
    if ($key.Length -ne 32) { throw 'Clave local de respaldo inválida' }
    if ($InputArchive) {
        $plaintext = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($InputArchive))
    } else {
        $start = [System.Diagnostics.ProcessStartInfo]::new()
        $start.FileName = 'ssh'
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        foreach ($arg in @('-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',$SourceHost,'f=$(find /home/administrador/services/geomodi-libsql/backups -maxdepth 1 -name "geomodi-*.tar.gz" | sort | tail -1); test -n "$f" && cat -- "$f"')) { $start.ArgumentList.Add($arg) }
        $process = [System.Diagnostics.Process]::Start($start)
        $stream = [System.IO.MemoryStream]::new()
        try {
            $process.StandardOutput.BaseStream.CopyTo($stream)
            $errorText = $process.StandardError.ReadToEnd()
            $process.WaitForExit()
            if ($process.ExitCode -ne 0) { throw "No se pudo leer el respaldo remoto: $errorText" }
            $plaintext = $stream.ToArray()
        } finally { $stream.Dispose(); $process.Dispose() }
    }
    if ($plaintext.Length -lt 20 -or $plaintext[0] -ne 31 -or $plaintext[1] -ne 139) { throw 'El respaldo no es un archivo gzip válido' }
    $nonce = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
    $ciphertext = [byte[]]::new($plaintext.Length)
    $tag = [byte[]]::new(16)
    $header = [System.Text.Encoding]::ASCII.GetBytes('GEOMODI-BACKUP-1')
    $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
    try { $aes.Encrypt($nonce, $plaintext, $ciphertext, $tag, $header) } finally { $aes.Dispose() }
    $filename = 'geomodi-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.gmbak'
    $finalPath = Join-Path $backupRoot $filename
    $tempPath = $finalPath + '.tmp'
    $output = [System.IO.File]::Open($tempPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        foreach ($part in @($header,$nonce,$tag,$ciphertext)) { $output.Write($part, 0, $part.Length) }
        $output.Flush($true)
    } finally { $output.Dispose() }
    [System.IO.File]::Move($tempPath, $finalPath)
    & (Join-Path $PSScriptRoot 'verify-offhost.ps1') -BackupFile $finalPath -KeyFile $keyPath
    Write-Output "Respaldo cifrado creado: $finalPath"
} finally {
    if ($key) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key) }
    if ($plaintext) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plaintext) }
}
