[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][Guid]$SubscriptionId,
    [Parameter(Mandatory = $true)][ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$ImageDigest,
    [ValidatePattern('^rg-trazo-[a-z0-9-]+$')][string]$ResourceGroup = 'rg-trazo-mvp',
    [ValidatePattern('^trazo-[a-z0-9-]+$')][string]$AppName = 'trazo-mvp',
    [switch]$Execute
)
$ErrorActionPreference = 'Stop'
function Invoke-ImageAz([string[]]$Arguments) {
    $output = & az @Arguments --subscription $SubscriptionId --only-show-errors -o json
    if ($LASTEXITCODE -ne 0) { throw 'Azure no pudo completar la operación. No se modifican secretos ni se despliega un provider alternativo.' }
    if ($output) { return ($output -join "`n" | ConvertFrom-Json) }
}
$app = Invoke-ImageAz @('containerapp','show','-g',$ResourceGroup,'-n',$AppName)
$provider = @($app.properties.template.containers[0].env | Where-Object name -eq 'Database__Provider')
if ($provider.Count -ne 1 -or $provider[0].value -ne 'Cosmos') { throw 'Este helper solo actualiza una aplicación ya configurada con Cosmos.' }
$endpointValue = ($app.properties.template.containers[0].env | Where-Object name -eq 'Cosmos__Endpoint').value
$endpoint = [Uri]$endpointValue
if ($endpoint.Scheme -ne 'https' -or !$endpoint.Host.EndsWith('.documents.azure.com')) { throw 'Endpoint Cosmos inesperado.' }
$accountName = $endpoint.Host.Split('.')[0]
$account = Invoke-ImageAz @('cosmosdb','show','-g',$ResourceGroup,'-n',$accountName)
if (!$account.enableFreeTier -or $account.capacity.totalThroughputLimit -gt 1000 -or
    $account.capacity.totalThroughputLimit -lt 1 -or $account.locations.Count -ne 1) {
    throw 'La cuenta no conserva Free Tier/región única/límite de throughput. No se desplegó.'
}
$image = "ghcr.io/crosbostol/trazo@$ImageDigest"
Write-Host "Destino: $AppName; imagen: $image. Se conservan provider, base, identidad, escala y secretos."
if (!$Execute) { Write-Host 'Plan validado. -Execute actualiza únicamente la imagen.'; return }
$result = Invoke-ImageAz @('containerapp','update','-g',$ResourceGroup,'-n',$AppName,'--image',$image)
Write-Host "Revisión solicitada: $($result.properties.latestRevisionName). Verifica readiness y los flujos antes de retirar una imagen anterior."
