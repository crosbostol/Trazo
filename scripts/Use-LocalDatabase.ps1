[CmdletBinding()]
param([switch]$Demo)
$ErrorActionPreference = 'Stop'
if (-not $env:TRAZO_SQL_PASSWORD) {
    $secure = Read-Host 'Contrasena SA de SQL Server local (al menos 12 caracteres, mayusculas, minusculas, numeros y simbolos)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:TRAZO_SQL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$database = if ($Demo) { 'progress_demo' } else { 'progress' }
$escaped = $env:TRAZO_SQL_PASSWORD.Replace('"','""')
$env:ConnectionStrings__Progress = "Server=tcp:127.0.0.1,1433;Database=$database;User ID=sa;Password=`"$escaped`";Encrypt=True;TrustServerCertificate=True;Pooling=False"
$env:Database__SeedDemo = if ($Demo) { 'true' } else { 'false' }
Write-Host "SQL Server local: $database; SeedDemo=$env:Database__SeedDemo. Solo configura esta terminal; no modifica datos."
