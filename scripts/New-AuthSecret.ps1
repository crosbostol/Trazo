[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$project = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend'
$secret = Read-Host 'Contraseña de Trazo (mínimo 12 caracteres)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $hash = $plain | & dotnet run --no-build --no-launch-profile --project $project -- --hash-password
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el hash. Compila backend primero.' }
    $env:Auth__PasswordHash = ($hash -join '').Trim()
    Write-Host 'Hash configurado en Auth__PasswordHash para esta terminal. No se guardó la contraseña.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $plain = $null
}
