Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Load-TrazoConfig([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw 'Copia config.example.ps1 a config.local.ps1 y completa sus valores.' }
    $script:Config = & $Path
    [void][Guid]::Parse($Config.SubscriptionId)
    foreach ($key in @('ResourceGroup','Location','ContainerAppName','ContainerEnvironmentName','PullIdentityName','SqlServerName','SqlDatabaseName','SqlAdmin')) {
        if ($Config[$key] -notmatch '^[a-z][a-z0-9_-]{1,62}$') { throw "Configuración inválida: $key" }
    }
    if ($Config.RegistryName -notmatch '^[a-z0-9]{5,50}$') { throw 'RegistryName debe ser único, minúsculas/números, 5-50 caracteres.' }
    if ($Config.ResourceGroup -notlike 'rg-trazo-*') { throw 'Usa un grupo dedicado con prefijo rg-trazo-.' }
    if ($Config.SqlDatabaseName.EndsWith('_demo')) { throw 'Azure debe usar una base real sin seed.' }
    $account = Invoke-Az @('account','show')
    Write-Host "Destino explícito: $($account.name) / $($account.id) / $($Config.Location) / $($Config.ResourceGroup)"
}

function Invoke-Az([string[]]$Arguments) {
    # Never echo arguments: some Azure operations carry transient secrets.
    $errorPath = [IO.Path]::GetTempFileName()
    try {
        $output = & az @Arguments --subscription $Config.SubscriptionId --only-show-errors --output json 2> $errorPath
        if ($LASTEXITCODE -ne 0) { throw "Azure CLI falló en '$($Arguments[0..([Math]::Min(2,$Arguments.Length-1))] -join ' ')'. Revisa permisos, región y estado con status.ps1. No se imprimen argumentos ni respuestas que puedan contener secretos." }
        if ($output) { return ($output -join "`n") | ConvertFrom-Json }
    } finally { Remove-Item -LiteralPath $errorPath -ErrorAction SilentlyContinue }
}

function Assert-TrazoGroup {
    $group = Invoke-Az @('group','show','--name',$Config.ResourceGroup)
    if ($group.tags.trazo -ne 'mvp') { throw 'El grupo no está marcado como trazo=mvp. No se modifica un grupo ajeno.' }
}

function Show-TrazoPlan {
    Write-Host 'Plan: Azure SQL Free GP_S_Gen5_2 Central US, min 0.5/max 2 vCores, 32 GB, pause 60 min, AutoPause al agotar cuota. Reutilizar ACR, identidad y ACA Consumption 0-1 replica. PostgreSQL intacto.'
    Write-Host 'Sin Defender de pago, Log Analytics, Key Vault, DNS ni red premium.'
}

function Read-PlainSecret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Connection([string]$Password, [string]$Username = $Config.SqlAdmin) {
    # Quote according to ADO.NET, including embedded semicolons and quotes.
    $escaped = $Password.Replace('"','""')
    return "Server=tcp:$($Config.SqlServerName).database.windows.net,1433;Database=$($Config.SqlDatabaseName);User ID=$Username;Password=`"$escaped`";Encrypt=True;TrustServerCertificate=False;Connection Timeout=60;Pooling=False"
}

function Write-PrivateJson($Value) {
    $path = [IO.Path]::GetTempFileName()
    if ($env:OS -eq 'Windows_NT') {
        $acl = New-Object Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true,$false)
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
        Set-Acl -LiteralPath $path -AclObject $acl
    } else { & chmod 600 $path; if ($LASTEXITCODE -ne 0) { throw 'No se pudieron proteger los secretos temporales.' } }
    [IO.File]::WriteAllText($path,($Value | ConvertTo-Json -Depth 50),[Text.UTF8Encoding]::new($false))
    return $path
}

function Sync-AppFirewall {
    $app = Invoke-Az @('containerapp','show','-g',$Config.ResourceGroup,'-n',$Config.ContainerAppName)
    $ips = @($app.properties.outboundIpAddresses)
    if ($ips.Count -eq 0) { throw 'Azure no publicó IPs de salida. No se abre SQL Server a todo Azure. Revisa la red antes de continuar.' }
    $existing = @(Invoke-Az @('sql','server','firewall-rule','list','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName))
    foreach ($ip in $ips) {
        $parsed = [Net.IPAddress]::Parse($ip)
        if ($parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $ip -eq '0.0.0.0') { throw 'IP de salida inesperada.' }
        $name = 'trazo-app-' + $ip.Replace('.','-')
        if (@($existing | Where-Object { $_.name -eq $name -and $_.startIpAddress -eq $ip -and $_.endIpAddress -eq $ip }).Count -gt 0) { continue }
        Invoke-Az @('sql','server','firewall-rule','create','-g',$Config.ResourceGroup,'-s',$Config.SqlServerName,'-n',$name,'--start-ip-address',$ip,'--end-ip-address',$ip) | Out-Null
    }
    Write-Host 'Firewall actualizado con las IPs de salida publicadas de la aplicación. No se habilitó 0.0.0.0 ni acceso global.'
}
