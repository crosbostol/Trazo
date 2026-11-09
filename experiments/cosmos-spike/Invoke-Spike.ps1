[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId
)

# Creates and removes only a fresh, tagged group for synthetic data. Never reuse
# production groups or accounts. Keys are fetched only by the Node child process.
$ErrorActionPreference = 'Stop'
if ($SubscriptionId -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid subscription identifier.' }
$suffix = Get-Date -Format 'yyyyMMddHHmmss'
$group = "rg-trazo-cosmos-spike-$suffix"
$account = "trazospike$suffix"
$createdGroup = $false

function Invoke-SpikeAz([string[]]$Arguments) {
    $output = & az @Arguments --subscription $SubscriptionId --only-show-errors -o json
    if ($LASTEXITCODE -ne 0) { throw "Azure command failed: $($Arguments[0]) $($Arguments[1])" }
    if ($output) { return ($output -join "`n" | ConvertFrom-Json) }
}

Push-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
try {
    if (Invoke-SpikeAz @('group', 'exists', '-n', $group)) { throw 'Refusing to reuse an existing resource group.' }
    $registered = Invoke-SpikeAz @('provider', 'show', '-n', 'Microsoft.DocumentDB')
    if ($registered.registrationState -ne 'Registered') {
        Invoke-SpikeAz @('provider', 'register', '-n', 'Microsoft.DocumentDB', '--wait') | Out-Null
    }
    $ip = (Invoke-RestMethod 'https://checkip.amazonaws.com').Trim()
    $parsedIp = $null
    if (![System.Net.IPAddress]::TryParse($ip, [ref]$parsedIp) -or
        $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Expected the workstation public IPv4 address.'
    }
    Invoke-SpikeAz @('group', 'create', '-n', $group, '-l', 'centralus', '--tags',
        'purpose=trazo-cosmos-spike', 'syntheticDataOnly=true') | Out-Null
    $createdGroup = $true
    Invoke-SpikeAz @('cosmosdb', 'create', '-n', $account, '-g', $group,
        '--kind', 'GlobalDocumentDB', '--capabilities', 'EnableServerless',
        '--locations', 'regionName=centralus', 'failoverPriority=0', 'isZoneRedundant=False',
        '--default-consistency-level', 'Session', '--backup-policy-type', 'Periodic',
        '--backup-redundancy', 'Local', '--backup-interval', '240', '--backup-retention', '8',
        '--ip-range-filter', $ip, '--network-acl-bypass', 'None',
        '--enable-automatic-failover', 'false', '--enable-multiple-write-locations', 'false',
        '--tags', 'purpose=trazo-cosmos-spike', 'syntheticDataOnly=true') | Out-Null

    $env:COSMOS_SPIKE_SUBSCRIPTION = $SubscriptionId
    $env:COSMOS_SPIKE_GROUP = $group
    $env:COSMOS_SPIKE_ACCOUNT = $account
    & node experiments/cosmos-spike/run.mjs seed
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic integration checks failed.' }
    Write-Host 'Waiting ten minutes without data-plane requests. Do not open Cosmos Data Explorer.'
    for ($i = 0; $i -lt 21; $i++) { Start-Sleep -Seconds 30 }
    & node experiments/cosmos-spike/run.mjs probe
    if ($LASTEXITCODE -ne 0) { throw 'Idle probe failed.' }
    & node experiments/cosmos-spike/prices.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Price estimate failed.' }
}
finally {
    if ($createdGroup) {
        $actual = Invoke-SpikeAz @('group', 'show', '-n', $group)
        if ($actual.name -ne $group -or $actual.tags.purpose -ne 'trazo-cosmos-spike' -or
            $actual.tags.syntheticDataOnly -ne 'true') {
            throw "Cleanup refused: unexpected group identity or tags. Inspect $group."
        }
        Invoke-SpikeAz @('group', 'delete', '-n', $group, '--yes') | Out-Null
        if (Invoke-SpikeAz @('group', 'exists', '-n', $group)) {
            throw "Temporary group still exists: $group"
        }
        Write-Host "Deleted temporary group: $group"
    }
    Pop-Location
}
