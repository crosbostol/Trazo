[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1")
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
Assert-TrazoGroup
Invoke-Az @('resource','list','-g',$Config.ResourceGroup,'--query','[].{name:name,type:type}') | Format-Table
Write-Host 'Esto elimina TODO el grupo, incluyendo PostgreSQL y su historial. Exporta y verifica un respaldo primero. Nunca es parte del deployment.'
if ((Read-Host "Escribe exactamente DELETE $($Config.SubscriptionId)/$($Config.ResourceGroup)") -cne "DELETE $($Config.SubscriptionId)/$($Config.ResourceGroup)") { throw 'Cancelado.' }
Invoke-Az @('group','delete','-n',$Config.ResourceGroup,'--yes') | Out-Null
