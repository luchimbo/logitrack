<#
Custodia independiente de la clave de la copia cifrada.
  -Export  : pide una frase de paso y genera un archivo protegido por esa frase (no depende de la cuenta Windows).
             Guardarlo en un medio distinto de esta PC (por ejemplo un USB guardado aparte); la frase, en otro lugar.
  -Import  : con ese archivo y la frase, recrea backup-key.dpapi para la cuenta Windows actual (PC nueva).
No imprime la clave. No usa servicios en la nube.
#>
param(
  [switch]$Export, [switch]$Import,
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\_backup\offhost'),
  [Parameter(Mandatory)][string]$CustodyFile
)
$ErrorActionPreference = 'Stop'
if ($Export -eq $Import) { throw 'Indicá exactamente uno: -Export o -Import' }
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$keyPath = Join-Path ([System.IO.Path]::GetFullPath($BackupDirectory)) 'backup-key.dpapi'
$entropy = [System.Text.Encoding]::UTF8.GetBytes('GeoModi off-host backup v1')
$passphrase = Read-Host 'Frase de paso (mínimo 16 caracteres)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passphrase)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($plain.Length -lt 16) { throw 'La frase de paso es demasiado corta' }
function New-WrapKey([byte[]]$salt) { [System.Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2($plain, $salt, 600000, [System.Security.Cryptography.HashAlgorithmName]::SHA256, 32) }
$header = [System.Text.Encoding]::ASCII.GetBytes('GEOMODI-KEY-1')
if ($Export) {
  $key = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($keyPath), $entropy, 'CurrentUser')
  $salt = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16); $nonce = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
  $cipher = [byte[]]::new(32); $tag = [byte[]]::new(16)
  $aes = [System.Security.Cryptography.AesGcm]::new((New-WrapKey $salt), 16)
  try { $aes.Encrypt($nonce, $key, $cipher, $tag, $header) } finally { $aes.Dispose(); [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key) }
  $out = [System.IO.File]::Open([System.IO.Path]::GetFullPath($CustodyFile), 'CreateNew', 'Write', 'None')
  try { foreach ($part in @($header,$salt,$nonce,$tag,$cipher)) { $out.Write($part, 0, $part.Length) } } finally { $out.Dispose() }
  Write-Output "Archivo de custodia creado: $CustodyFile. Guardarlo fuera de esta PC y separado de la frase."
} else {
  if (Test-Path -LiteralPath $keyPath) { throw 'Ya existe backup-key.dpapi; no se sobrescribe' }
  $bytes = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($CustodyFile))
  $o = $header.Length; $salt = $bytes[$o..($o+15)]; $nonce = $bytes[($o+16)..($o+27)]; $tag = $bytes[($o+28)..($o+43)]; $cipher = $bytes[($o+44)..($o+75)]
  $key = [byte[]]::new(32)
  $aes = [System.Security.Cryptography.AesGcm]::new((New-WrapKey ([byte[]]$salt)), 16)
  try { $aes.Decrypt([byte[]]$nonce, [byte[]]$cipher, [byte[]]$tag, $key, $header) } finally { $aes.Dispose() }
  [System.IO.Directory]::CreateDirectory((Split-Path $keyPath)) | Out-Null
  [System.IO.File]::WriteAllBytes($keyPath, [System.Security.Cryptography.ProtectedData]::Protect($key, $entropy, 'CurrentUser'))
  [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
  Write-Output 'Clave restaurada para la cuenta actual.'
}
