import { dropDatabase, localPassword } from './sql-test-support.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Exercise the exact user-facing procedure only against our disposable name.
export function checkDatabaseSetup(sql) {
  const database = `progress_test_${Date.now()}99`
  const root = fileURLToPath(new URL('../', import.meta.url))
  const script = (...args) => spawnSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'scripts/Initialize-RealDatabase.ps1'), '-Database', database, ...args],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000, env: {...process.env, TRAZO_SQL_PASSWORD:localPassword} })
  let archive
  try {
    const created = script()
    assert.equal(created.status, 0, created.stderr)
    assert.equal(script().status, 0, 'Already empty database should be left alone')
    sql(database, 'CREATE TABLE preserved (value nvarchar(100)); INSERT INTO preserved VALUES (\'keep this\')')
    const refused = script()
    assert.notEqual(refused.status, 0, 'Existing data must require explicit archive option')
    assert.equal(sql(database, 'SELECT value FROM preserved'), 'keep this')
    const archived = script('-ArchiveExisting')
    archive = sql('master', `SELECT name FROM sys.databases WHERE name LIKE '${database}_legacy_%'`)
    assert.equal(archived.status, 0, archived.stderr)
    assert.match(archive, new RegExp(`^${database}_legacy_\\d{8}_\\d{6}$`))
    assert.equal(sql(archive, 'SELECT value FROM preserved'), 'keep this')
    assert.equal(sql(database, "SELECT count(*) FROM sys.tables"), '0')
    console.log('PASS real database setup: create empty, refuse populated, explicit archive preserves all data and creates clean database')
  } finally {
    // Never select arbitrary databases for cleanup; names belong to this test.
    if (/^progress_test_\d+$/.test(database)) dropDatabase(database)
    if (archive && new RegExp(`^${database}_legacy_\\d{8}_\\d{6}$`).test(archive)) dropDatabase(archive)
  }
}
