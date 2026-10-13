import assert from 'node:assert/strict'
import { randomBytes, pbkdf2Sync } from 'node:crypto'

export const testPassword = randomBytes(24).toString('base64')
const salt = randomBytes(16)
const header = Buffer.alloc(13)
header[0] = 1; header.writeUInt32BE(2, 1); header.writeUInt32BE(210000, 5); header.writeUInt32BE(salt.length, 9)
export const testPasswordHash = Buffer.concat([header, salt, pbkdf2Sync(testPassword, salt, 210000, 32, 'sha512')]).toString('base64')

export class AuthClient {
  constructor(base, extraHeaders = {}, timeoutMs = 20000) { this.base = base; this.extraHeaders = extraHeaders; this.cookies = new Map(); this.csrf = ''; this.timeoutMs = timeoutMs }
  async fetch(route, options = {}, csrf = true) {
    const response = await fetch(this.base + route, { ...options, redirect: 'manual', signal: options.signal ?? AbortSignal.timeout(this.timeoutMs), headers: {
      'Content-Type': 'application/json', ...this.extraHeaders,
      Cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join('; '),
      ...(csrf && options.method && options.method !== 'GET' ? {'X-CSRF-TOKEN':this.csrf} : {}), ...options.headers,
    } })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const index = pair.indexOf('=')
      this.cookies.set(pair.slice(0,index), pair.slice(index+1))
    }
    return response
  }
  async session() { const response = await this.fetch('/api/auth/session'); assert.equal(response.status,200); const data = await response.json(); this.csrf=data.csrfToken; return data }
  async login(password = testPassword) {
    const response = await this.fetch('/api/auth/login', {method:'POST',body:JSON.stringify({password})})
    if (response.ok) this.csrf=(await response.clone().json()).csrfToken
    return response
  }
}

export async function checkAuth(base) {
  const client = new AuthClient(base)
  for (const route of ['/api/activities','/api/dashboard','/api/body-measurements','/api/database-info','/openapi/v1.json'])
    assert.equal((await client.fetch(route)).status,401,route)
  assert.equal((await client.fetch('/api/activities',{method:'POST',body:'{}'},false)).status,401)
  assert.equal((await client.session()).authenticated,false)
  assert.equal((await client.login('incorrect-password')).status,401)
  const login = await client.login()
  assert.equal(login.status,200)
  const cookie = login.headers.getSetCookie().find(s=>s.startsWith('trazo-session='))
  assert.match(cookie,/httponly/i); assert.match(cookie,/samesite=strict/i)
  assert.equal((await client.session()).authenticated,true)
  assert.equal((await client.fetch('/api/activities')).status,200)
  for (const route of ['/api/activities','/api/auth/logout'])
    assert.equal((await client.fetch(route,{method:'POST',body:'{}'},false)).status,400)
  assert.equal((await client.fetch('/api/activities',{method:'POST',body:'{}',headers:{'X-CSRF-TOKEN':'forged',Origin:'https://attacker.example'}})).status,400)
  assert.equal((await client.fetch('/api/auth/logout',{method:'POST'})).status,204)
  assert.equal((await client.fetch('/api/dashboard')).status,401)
  assert.equal((await client.session()).authenticated,false)
  assert.equal((await client.login()).status,200)
  assert.equal((await client.login('incorrect-password')).status,401)
  assert.equal((await client.login('incorrect-password')).status,401)
  assert.equal((await client.login('incorrect-password')).status,429)
  assert.equal((await client.session()).authenticated,true)
  console.log('PASS auth: anonymous 401, login failure/success, session, logout, protected API, CSRF and bounded login attempts')
  return client
}
