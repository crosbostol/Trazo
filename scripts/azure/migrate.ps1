[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1", [switch]$Execute, [switch]$InitialEmptyCheck, [string]$ClientIp)
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
if (-not $Execute) { Write-Host 'Plan: abrir temporalmente tu IP, dotnet ef database update, verificar esquema y cerrar la regla. Usa -Execute tras aprobar Paso B.'; return }
Assert-TrazoGroup
if (-not $ClientIp) { throw 'Indica -ClientIp con tu IPv4 pública actual. Nunca uses 0.0.0.0.' }
$ip = [Net.IPAddress]::Parse($ClientIp)
if ($ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $ClientIp -eq '0.0.0.0') { throw 'Se requiere una IPv4 individual.' }
if ((Read-Host "Escribe MIGRATE $($Config.SqlDatabaseName) para aplicar las migraciones revisadas") -cne "MIGRATE $($Config.SqlDatabaseName)") { throw 'Cancelado.' }
$rule = 'trazo-migrate-' + [Guid]::NewGuid().ToString('N').Substring(0,10)
$oldConnection = $env:ConnectionStrings__Progress
$oldEnvironment = $env:ASPNETCORE_ENVIRONMENT
$ruleCreated = $false
try {
    $password = Read-PlainSecret 'Contraseña del administrador SQL Server'
    $env:ConnectionStrings__Progress = Get-Connection $password
    $password = $null
    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    Invoke-Az @('sql','server','firewall-rule','create','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$rule,'--start-ip-address',$ClientIp,'--end-ip-address',$ClientIp) | Out-Null
    $ruleCreated = $true
    & dotnet build (Join-Path $ProjectRoot 'backend')
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación.' }
    & dotnet ef database update --no-build --project (Join-Path $ProjectRoot 'backend')
    if ($LASTEXITCODE -ne 0) { throw 'Migración fallida. Revisa los errores sin borrar datos.' }
    $checkArgs = @((Join-Path $ProjectRoot 'backend/bin/Debug/net10.0/Progress.Api.dll'),'--check-database')
    if ($InitialEmptyCheck) { $checkArgs += '--require-empty' }
    & dotnet @checkArgs
    if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación del esquema/datos. No desplegar.' }
    if ($InitialEmptyCheck) {
        $appPassword = Read-PlainSecret 'Contraseña NUEVA del rol trazo_app (mínimo 20 caracteres; guárdala en tu gestor)'
        try {
            $appPassword | & dotnet (Join-Path $ProjectRoot 'backend/bin/Debug/net10.0/Progress.Api.dll') --configure-app-role
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar el rol de ejecución. No desplegar.' }
        } finally { $appPassword = $null }
    }
    Write-Host 'Migraciones verificadas. Ningún seed ejecutado.'
} finally {
    $env:ConnectionStrings__Progress = $oldConnection
    $env:ASPNETCORE_ENVIRONMENT = $oldEnvironment
    $password = $null
    if ($ruleCreated) { Invoke-Az @('sql','server','firewall-rule','delete','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$rule) | Out-Null }
}
