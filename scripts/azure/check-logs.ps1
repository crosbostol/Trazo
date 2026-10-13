[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1")
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
$secrets = @(Invoke-Az @('containerapp','secret','list','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName,'--show-values'))
# Inspect in memory only. Never print the log buffer, passwords, hash or connection.
$logs = & az containerapp logs show --subscription $Config.SubscriptionId -g $Config.ResourceGroup -n $Config.ContainerAppName --type console --tail 300 --format json --only-show-errors 2>$null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron inspeccionar los logs de la replica activa.' }
$text = $logs -join "`n"
$forbidden = @('TRAZO_PRIVATE_PRODUCTION_FIXTURE')
foreach ($secret in $secrets) {
    if ($secret.value) {
        $forbidden += $secret.value
        if ($secret.name -eq 'sql-connection') {
            # Get-Connection always quotes passwords using ADO.NET double quotes.
            $match = [regex]::Match($secret.value, '(?i)Password="((?:""|[^"])*)"')
            if (-not $match.Success) { throw 'No se pudo extraer la credencial para verificar logs sin mostrarla.' }
            $forbidden += $match.Groups[1].Value.Replace('""','"')
        }
    }
}
$localPath = Join-Path $env:LOCALAPPDATA 'Trazo/azure-credentials.clixml'
if (Test-Path -LiteralPath $localPath) {
    $saved = Import-Clixml -LiteralPath $localPath
    foreach ($secure in $saved.Values) {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $forbidden += [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
}
foreach ($value in $forbidden) {
    if ($value -and $text.Contains($value)) { throw 'Fallo: los logs contienen un secreto o payload de prueba. No se muestra el contenido.' }
}
$secrets=$null; $saved=$null; $forbidden=$null; $text=$null; $logs=$null
Write-Host 'PASS: muestra de hasta 300 lineas de logs sin credenciales, hash, connection string ni payload de prueba.'
