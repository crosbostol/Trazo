[CmdletBinding()]
param([ValidateSet('Trazo','PostgresAdmin','PostgresApp','SqlAdmin','SqlApp')][string]$Name = 'Trazo')
$ErrorActionPreference = 'Stop'
$path = Join-Path $env:LOCALAPPDATA 'Trazo/azure-credentials.clixml'
if (-not (Test-Path -LiteralPath $path)) { throw 'No existe el respaldo local cifrado de las credenciales iniciales.' }
$secrets = Import-Clixml -LiteralPath $path
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secrets[$Name])
try {
    Set-Clipboard -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))
    Write-Host "Contraseña inicial de $Name copiada al portapapeles. Pégala en el destino correspondiente o en tu gestor. Después limpia el portapapeles con Set-Clipboard -Value ''."
    Write-Host 'Este respaldo contiene la contraseña inicial; no cambia cuando rotas una contraseña en Azure.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $secrets = $null
}
