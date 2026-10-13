import { spawnSync } from 'node:child_process'

// Local disposable fixtures only; never an Azure connection or a real user's database.
export const localPassword = process.env.TRAZO_SQL_PASSWORD || 'LocalOnly_Trazo_SQL_2026!'
export const connection = (database, host = 'tcp:127.0.0.1,1433') =>
  `Server=${host};Database=${database};User ID=sa;Password="${localPassword.replaceAll('"', '""')}";Encrypt=True;TrustServerCertificate=True;Pooling=False`
export function sql(database, query) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', '-e', 'SQLCMDPASSWORD', 'sqlserver',
    '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-U', 'sa', '-C', '-b', '-h', '-1', '-W', '-d', database, '-Q', `SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; ${query}`],
  { encoding: 'utf8', windowsHide: true, env: {...process.env, TRAZO_SQL_PASSWORD:localPassword, SQLCMDPASSWORD:localPassword} })
  if (result.status !== 0) throw new Error(result.stdout + result.stderr)
  return result.stdout.trim()
}
export function createDatabase(name) {
  if (!/^progress_test_\d+(_demo)?$/.test(name)) throw new Error('Not a disposable database')
  sql('master', `CREATE DATABASE [${name}];`)
}
export function dropDatabase(name) {
  if (!/^progress_test_\d+(_demo|_legacy_\d{8}_\d{6})?$/.test(name)) throw new Error('Not a disposable database')
  sql('master', `IF DB_ID('${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`)
}
