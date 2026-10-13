[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1", [switch]$Execute)
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
Show-TrazoPlan
$base = "https://management.azure.com/subscriptions/$($Config.SubscriptionId)/providers/Microsoft.Sql/locations/$($Config.Location)"
$cap = Invoke-Az @('rest','--method','get','--url',"${base}/capabilities?api-version=2025-01-01")
$supported = @($cap.supportedServerVersions | ForEach-Object supportedEditions | Where-Object name -eq 'GeneralPurpose' | ForEach-Object supportedServiceLevelObjectives | Where-Object { $_.name -eq 'GP_S_Gen5_2' -and $_.status -eq 'Available' })
if (-not $supported) { throw 'GP_S_Gen5_2 no disponible; no se sustituye por una oferta pagada.' }
if (-not $Execute) { Write-Host 'Solo plan. Usa -Execute para provisionar la oferta autorizada.'; return }
if ((Read-Host "Escribe PROVISION $($Config.ResourceGroup) para crear recursos") -cne "PROVISION $($Config.ResourceGroup)") { throw 'Cancelado.' }
Assert-TrazoGroup
$registration = Invoke-Az @('provider','show','--namespace','Microsoft.Sql','--query','registrationState')
if ($registration -ne 'Registered') { Invoke-Az @('provider','register','--namespace','Microsoft.Sql','--wait') | Out-Null }
Write-Host 'Preparando registry e identidad de lectura...'
$registries = @(Invoke-Az @('acr','list','-g',$Config.ResourceGroup))
if ($Config.RegistryName -notin @($registries | ForEach-Object name)) { Invoke-Az @('acr','create','-g',$Config.ResourceGroup,'-n',$Config.RegistryName,'--sku','Basic','--admin-enabled','false','-l',$Config.Location) | Out-Null }
$identities = @(Invoke-Az @('identity','list','-g',$Config.ResourceGroup))
if ($Config.PullIdentityName -notin @($identities | ForEach-Object name)) { Invoke-Az @('identity','create','-g',$Config.ResourceGroup,'-n',$Config.PullIdentityName,'-l',$Config.Location) | Out-Null }
$identity = Invoke-Az @('identity','show','-g',$Config.ResourceGroup,'-n',$Config.PullIdentityName)
$registry = Invoke-Az @('acr','show','-g',$Config.ResourceGroup,'-n',$Config.RegistryName)
$assignments = @(Invoke-Az @('role','assignment','list','--assignee',$identity.principalId,'--scope',$registry.id))
if ('AcrPull' -notin @($assignments | ForEach-Object roleDefinitionName)) { Invoke-Az @('role','assignment','create','--assignee-object-id',$identity.principalId,'--assignee-principal-type','ServicePrincipal','--role','AcrPull','--scope',$registry.id) | Out-Null }
Write-Host 'Preparando Container Apps Consumption sin workspace de logs...'
$environments = @(Invoke-Az @('containerapp','env','list','-g',$Config.ResourceGroup))
if ($Config.ContainerEnvironmentName -notin @($environments | ForEach-Object name)) { Invoke-Az @('containerapp','env','create','-g',$Config.ResourceGroup,'-n',$Config.ContainerEnvironmentName,'-l',$Config.Location,'--enable-workload-profiles','true','--logs-destination','none') | Out-Null }

Write-Host 'Preparando logical SQL server con TLS 1.2 y firewall inicialmente cerrado...'
$servers = @(Invoke-Az @('sql','server','list','-g',$Config.ResourceGroup))
if ($Config.SqlServerName -notin @($servers | ForEach-Object name)) {
    $password = Read-PlainSecret 'Contrasena nueva del administrador SQL Server'
    try { Invoke-Az @('sql','server','create','-g',$Config.ResourceGroup,'-n',$Config.SqlServerName,'-l',$Config.Location,'--admin-user',$Config.SqlAdmin,'--admin-password',$password,'--minimal-tls-version','1.2','--enable-public-network','true') | Out-Null }
    finally { $password = $null }
}
$databases = @(Invoke-Az @('sql','db','list','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName))
if ($Config.SqlDatabaseName -notin @($databases | ForEach-Object name)) {
    $usage = Invoke-Az @('rest','--method','get','--url',"${base}/usages?api-version=2025-01-01")
    $quota = @($usage.value | Where-Object { $_.name -eq 'FreeLimitQuota' })
    if (-not $quota -or $quota[0].properties.currentValue -ge $quota[0].properties.limit) { throw 'No hay cuota Free confirmada; no crear DB pagada.' }
    Invoke-Az @('sql','db','create','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$Config.SqlDatabaseName,'--edition','GeneralPurpose','--family','Gen5','--capacity','2','--compute-model','Serverless','--min-capacity','0.5','--auto-pause-delay','60','--max-size','32GB','--use-free-limit','true','--free-limit-exhaustion-behavior','AutoPause','--backup-storage-redundancy','Local','--zone-redundant','false') | Out-Null
}
$db = Invoke-Az @('sql','db','show','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$Config.SqlDatabaseName)
if (-not $db.useFreeLimit -or $db.freeLimitExhaustionBehavior -ne 'AutoPause' -or $db.autoPauseDelay -ne 60 -or $db.sku.name -ne 'GP_S_Gen5' -or $db.sku.capacity -ne 2 -or $db.minCapacity -ne 0.5 -or $db.maxSizeBytes -ne 34359738368 -or $db.zoneRedundant -or $db.currentBackupStorageRedundancy -ne 'Local') { throw 'Configuracion efectiva no coincide con Free autorizada. Detener y revisar; nunca usar BillOverUsage.' }
Invoke-Az @('sql','db','str-policy','set','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$Config.SqlDatabaseName,'--retention-days','7') | Out-Null
Invoke-Az @('sql','server','advanced-threat-protection-setting','update','-g',$Config.ResourceGroup,'-n',$Config.SqlServerName,'--state','Disabled') | Out-Null
Write-Host 'Azure SQL Free confirmada. PostgreSQL intacto. Continuar con migrate.ps1 -InitialEmptyCheck.'
