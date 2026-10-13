# Offline checks only. This script never invokes Azure CLI.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$scripts = Get-ChildItem (Join-Path $root 'scripts/azure/*.ps1')
foreach ($file in $scripts) {
    $tokens = $null; $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw "Error de sintaxis en $($file.Name): $($errors.Message -join ', ')" }
}
. (Join-Path $root 'scripts/azure/common.ps1')
$script:Config = @{ PostgresServerName='pg-example';PostgresDatabaseName='progress';PostgresAdmin='admin' }
$connection = Get-Connection 'test;double"quote' 'trazo_app'
if ($connection -notlike '*Username=trazo_app;Password="test;double""quote";SSL Mode=VerifyFull*') { throw 'Connection quoting incorrecto' }
$path = Write-PrivateJson @{value='test-only-secret'}
try {
    if ((Get-Content -LiteralPath $path -Raw | ConvertFrom-Json).value -ne 'test-only-secret') { throw 'Serialización de secretos incorrecta' }
    if ($env:OS -eq 'Windows_NT' -and -not (Get-Acl -LiteralPath $path).AreAccessRulesProtected) { throw 'El archivo temporal hereda permisos' }
} finally { Remove-Item -LiteralPath $path }
foreach ($name in @('provision','build-and-deploy','migrate','rotate-password')) {
    $source = Get-Content (Join-Path $root "scripts/azure/$name.ps1") -Raw
    if ($source -notmatch 'if \(-not \$Execute\)') { throw "Falta plan por defecto: $name" }
}
$destroy = Get-Content (Join-Path $root 'scripts/azure/destroy.ps1') -Raw
if ($destroy -notmatch 'Read-Host' -or $destroy -notmatch 'Assert-TrazoGroup' -or $destroy -notmatch '-cne') { throw 'Destroy sin confirmación explícita' }
Write-Output 'PASS Azure scripts offline: syntax, quoted TLS connection, private temporary secrets, plan defaults and explicit destroy guard. No Azure commands executed.'
