[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1", [switch]$SyncFirewall)
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
Assert-TrazoGroup
if ($SyncFirewall) { Sync-AppFirewall }
Invoke-Az @('resource','list','-g',$Config.ResourceGroup,'--query','[].{name:name,type:type,location:location}') | Format-Table
$sqlServers = @(Invoke-Az @('sql','server','list','-g',$Config.ResourceGroup))
if ($Config.SqlServerName -in @($sqlServers | ForEach-Object name)) {
    Invoke-Az @('sql','db','list','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'--query','[].{name:name,status:status,sku:sku.name,minCapacity:minCapacity,maxVcores:sku.capacity,useFreeLimit:useFreeLimit,exhaustion:freeLimitExhaustionBehavior,pauseMinutes:autoPauseDelay,backup:currentBackupStorageRedundancy}') | Format-Table
}
$apps = @(Invoke-Az @('containerapp','list','-g',$Config.ResourceGroup))
if ($Config.ContainerAppName -in @($apps | ForEach-Object name)) {
    $app = Invoke-Az @('containerapp','show','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName)
    $url = "https://$($app.properties.configuration.ingress.fqdn)"
    Write-Host "$url | Estado: $($app.properties.provisioningState)"
    foreach ($route in @('/health/live','/health/ready','/api/dashboard')) {
        try { $response = Invoke-WebRequest "$url$route" -UseBasicParsing; Write-Host "$route -> $($response.StatusCode)" }
        catch { if ($_.Exception.Response) { Write-Host "$route -> $([int]$_.Exception.Response.StatusCode)" } else { Write-Host "$route -> conexión no disponible" } }
    }
    Write-Host 'Esperado: live 200, ready 200, dashboard sin sesión 401. No se imprimen secrets ni payloads.'
}
