[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1", [switch]$Execute)
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
if (-not $Execute) { Write-Host 'Plan: reemplazar hash secreto y reiniciar revisiones activas, sin recompilar la imagen. Invalida las sesiones existentes. Usa -Execute.'; return }
Assert-TrazoGroup
& (Join-Path $ProjectRoot 'scripts/New-AuthSecret.ps1')
$app = Invoke-Az @('containerapp','show','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName)
$url = "https://management.azure.com$($app.id)"
$current = Invoke-Az @('rest','--method','post','--url',"$url/listSecrets?api-version=2025-01-01")
$secrets = @($current.value | Where-Object name -ne 'auth-password-hash') + @(@{name='auth-password-hash';value=$env:Auth__PasswordHash})
$path = Write-PrivateJson @{properties=@{configuration=@{secrets=$secrets}}}
try { Invoke-Az @('rest','--method','patch','--url',"${url}?api-version=2025-01-01",'--body',"@$path") | Out-Null }
finally { Remove-Item -LiteralPath $path -ErrorAction SilentlyContinue; $current=$null; $secrets=$null }
$revisions = @(Invoke-Az @('containerapp','revision','list','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName,'--query','[?properties.active].name'))
foreach ($revision in $revisions) { Invoke-Az @('containerapp','revision','restart','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName,'--revision',$revision) | Out-Null }
Write-Host 'Contraseña rotada. Las sesiones con el hash anterior se rechazan al llegar a las revisiones reiniciadas.'
