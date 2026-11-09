[CmdletBinding()]
param([string]$ConfigPath = "$PSScriptRoot/config.local.ps1", [switch]$Execute)
. "$PSScriptRoot/common.ps1"
Load-TrazoConfig $ConfigPath
if (-not $Execute) { Write-Host 'Plan: build local, push ACR, secrets, revisión única Consumption, firewall de IPs de salida y health. Requiere migraciones previas. Usa -Execute tras aprobar Paso B.'; return }
Assert-TrazoGroup
$currentApps = @(Invoke-Az @('containerapp','list','-g',$Config.ResourceGroup))
$currentApp = $currentApps | Where-Object name -eq $Config.ContainerAppName
if ($currentApp -and @($currentApp.properties.template.containers[0].env | Where-Object { $_.name -eq 'Database__Provider' -and $_.value -eq 'Cosmos' }).Count -gt 0) {
    throw 'Producción ya usa Cosmos. Este deploy SQL antiguo reemplazaría la configuración. Usa scripts/azure/update-cosmos-image.ps1; rollback SQL explícito en docs/near-zero-deployment.md.'
}
if ((Read-Host 'Escribe DEPLOY tras verificar migraciones y, en el primer deploy, cero actividades/mediciones') -cne 'DEPLOY') { throw 'Cancelado.' }
$registry = Invoke-Az @('acr','show','-g',$Config.ResourceGroup,'-n',$Config.RegistryName)
$identity = Invoke-Az @('identity','show','-g',$Config.ResourceGroup,'-n',$Config.PullIdentityName)
$environment = Invoke-Az @('containerapp','env','show','-g',$Config.ResourceGroup,'-n',$Config.ContainerEnvironmentName)
$image = "$($registry.loginServer)/trazo:$(Get-Date -Format 'yyyyMMddHHmmss')"
Write-Host 'Compilando el artefacto local sin secretos...'
& docker build --platform linux/amd64 -t $image $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw 'Docker build falló.' }
# acr login emits plain "Login Succeeded", not JSON.
& az acr login -n $Config.RegistryName --subscription $Config.SubscriptionId --only-show-errors --output none | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'ACR login fallo.' }
& docker push $image
if ($LASTEXITCODE -ne 0) { throw 'Docker push falló.' }
if (-not $env:Auth__PasswordHash) { throw 'Ejecuta scripts/New-AuthSecret.ps1 en esta terminal antes de desplegar.' }
$password = Read-PlainSecret 'Contraseña del rol SQL Server trazo_app (no la del administrador)'
$connection = Get-Connection $password 'trazo_app'
$password = $null
$secrets = @(@{name='sql-connection';value=$connection},@{name='auth-password-hash';value=$env:Auth__PasswordHash})
$probe = { param($Type,$Path,$Delay) @{ type=$Type; httpGet=@{path=$Path;port=8080;scheme='HTTP'}; initialDelaySeconds=$Delay;periodSeconds=10;timeoutSeconds=5;failureThreshold=6 } }
$template = @{
    location=$Config.Location
    identity=@{type='UserAssigned';userAssignedIdentities=@{ $identity.id=@{} }}
    properties=@{
        managedEnvironmentId=$environment.id
        workloadProfileName='Consumption'
        configuration=@{
            activeRevisionsMode='Single'
            ingress=@{external=$true;targetPort=8080;transport='auto';allowInsecure=$false}
            secrets=$secrets
            registries=@(@{server=$registry.loginServer;identity=$identity.id})
        }
        template=@{
            revisionSuffix=(Get-Date -Format 'yyyyMMddHHmmss')
            containers=@(@{
                name='trazo';image=$image;resources=@{cpu=0.25;memory='0.5Gi'}
                env=@(
                    @{name='ASPNETCORE_ENVIRONMENT';value='Production'},
                    @{name='Database__Initialize';value='false'},
                    @{name='Database__SeedDemo';value='false'},
                    @{name='ConnectionStrings__Progress';secretRef='sql-connection'},
                    @{name='Auth__PasswordHash';secretRef='auth-password-hash'}
                )
                probes=@((& $probe 'Liveness' '/health/live' 15),(& $probe 'Readiness' '/health/ready' 5))
            })
            scale=@{minReplicas=0;maxReplicas=1;rules=@(@{name='http';http=@{metadata=@{concurrentRequests='10'}}})}
        }
    }
}
$path = Write-PrivateJson $template
try {
    # JSON is a YAML subset. Secrets live only in this ACL-restricted temporary
    # file and Container Apps, never in command-line arguments or saved config.
    $apps = @(Invoke-Az @('containerapp','list','-g',$Config.ResourceGroup))
    $operation = if ($Config.ContainerAppName -in @($apps | ForEach-Object name)) { 'update' } else { 'create' }
    Invoke-Az @('containerapp',$operation,'-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName,'--yaml',$path,'--no-wait') | Out-Null
} finally {
    Remove-Item -LiteralPath $path -ErrorAction SilentlyContinue
    $connection = $null; $secrets = $null; $template = $null
}
Write-Host 'Revisión solicitada. Las IPs de salida pueden tardar unos segundos en estar disponibles.'
Sync-AppFirewall
$app = Invoke-Az @('containerapp','show','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName)
$url = "https://$($app.properties.configuration.ingress.fqdn)"
Write-Host "Deployment solicitado: $url. Ejecuta status.ps1 hasta que readiness responda 200."
