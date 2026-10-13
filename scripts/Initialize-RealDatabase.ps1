[CmdletBinding()]
param(
    [switch]$ArchiveExisting,
    # The alternate name is only for isolated integration tests.
    [ValidatePattern('^(progress|progress_test_[0-9]+)$')]
    [string]$Database = 'progress'
)

$ErrorActionPreference = 'Stop'
if (-not $env:TRAZO_SQL_PASSWORD) { throw 'Configura TRAZO_SQL_PASSWORD para SQL Server local.' }
$projectDirectory = Split-Path -Parent $PSScriptRoot
function Invoke-DatabaseSql([string]$Target, [string]$Sql) {
    $previous = $env:SQLCMDPASSWORD
    try {
        $env:SQLCMDPASSWORD = $env:TRAZO_SQL_PASSWORD
        $result = & docker compose --project-directory $projectDirectory exec -T -e SQLCMDPASSWORD sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -h -1 -W -d $Target -Q "SET NOCOUNT ON; $Sql"
        if ($LASTEXITCODE -ne 0) { throw 'SQL Server no pudo completar la operación. No se elimina ninguna base.' }
    } finally { $env:SQLCMDPASSWORD = $previous }
    return ($result -join "`n").Trim()
}

$exists = Invoke-DatabaseSql 'master' "SELECT count(*) FROM sys.databases WHERE name = '$Database'"
if ($exists -eq '1') {
    $tables = Invoke-DatabaseSql $Database "SELECT count(*) FROM sys.tables"
    if ($tables -eq '0') {
        Write-Output "$Database ya estÃ¡ vacÃ­a. Inicia la API con Database__SeedDemo=false."
        return
    }
    if (-not $ArchiveExisting) {
        throw "$Database ya tiene un esquema o datos. Se conserva intacta. DetÃ©n la API, respalda la base y ejecuta con -ArchiveExisting solo si deseas ARCHIVAR toda la base actual y comenzar otra vacÃ­a."
    }
    $sessions = Invoke-DatabaseSql 'master' "SELECT count(*) FROM sys.dm_exec_sessions WHERE database_id = DB_ID('$Database')"
    if ($sessions -ne '0') { throw "Hay conexiones abiertas a $Database. DetÃ©n la API y cierra tus clientes SQL. No se desconectan usuarios automÃ¡ticamente." }
    $archive = "${Database}_legacy_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    $archiveExists = Invoke-DatabaseSql 'master' "SELECT count(*) FROM sys.databases WHERE name = '$archive'"
    if ($archiveExists -ne '0') { throw "El archivo $archive ya existe. No se sobrescribe. Reintenta en otro segundo." }
    # Renaming preserves the complete database, including data, migrations and
    # seed history. SQL Server refuses the rename if a new connection races us.
    Invoke-DatabaseSql 'master' "ALTER DATABASE [$Database] MODIFY NAME = [$archive]" | Out-Null
    Write-Output "Base anterior conservada Ã­ntegramente: $archive"
}

# A rename retains physical files. New file names must not collide with the archive.
$fileId = "${Database}_$([Guid]::NewGuid().ToString('N'))"
Invoke-DatabaseSql 'master' "DECLARE @data nvarchar(4000) = CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultDataPath')); DECLARE @log nvarchar(4000) = CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultLogPath')); DECLARE @sql nvarchar(max) = N'CREATE DATABASE [$Database] ON PRIMARY (NAME=N''${fileId}'', FILENAME=N''' + REPLACE(@data, '''', '''''') + N'${fileId}.mdf'') LOG ON (NAME=N''${fileId}_log'', FILENAME=N''' + REPLACE(@log, '''', '''''') + N'${fileId}_log.ldf'')'; EXEC(@sql);" | Out-Null
Write-Output "Base real vacÃ­a creada: $Database. No se ejecutÃ³ seed."
Write-Output 'Inicia la API con Database__SeedDemo=false; aplicarÃ¡ las migraciones en Development.'
