# Copy to config.local.ps1 (ignored). No passwords, tokens or connection strings.
@{
    SubscriptionId = 'REPLACE-WITH-YOUR-VISUAL-STUDIO-SUBSCRIPTION-ID'
    ResourceGroup = 'rg-trazo-mvp'
    Location = 'centralus'
    ContainerAppName = 'trazo-mvp'
    ContainerEnvironmentName = 'cae-trazo-mvp-central'
    RegistryName = 'REPLACEWITHUNIQUELOWERCASENAME'
    PullIdentityName = 'id-trazo-pull'
    SqlServerName = 'REPLACE-WITH-UNIQUE-SQL-NAME'
    SqlDatabaseName = 'trazo'
    SqlAdmin = 'trazo_admin'
    BackupRetentionDays = 7
}
