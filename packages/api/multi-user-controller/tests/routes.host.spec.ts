import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { cookieAuthenticatorId } from '@deepseek-ai/dsh-multi-user'
import LocalMultiUserProvider from '@deepseek-ai/dsh-multi-user-local'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, inject } from '../src/index.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function fixture() {
  const routes = new Map<string, ConnectionFetchRoute>()
  const connection: HostConnectionHandle = {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return async () => { routes.delete(route.path) }
      },
    },
  } as HostConnectionHandle
  return { routes, connection }
}

describe('multi-user web routes', () => {
  it('composes exact routes and carries a password session in an HttpOnly cookie', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-multi-user-controller-'))
    roots.push(root)
    const ctx = new Context()
    new LocalMultiUserProvider(ctx, { path: join(root, 'accounts.json') })
    const { connection, routes } = fixture()
    ctx.provide('connection', connection)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect([...routes.keys()]).toEqual([
      '/api/auth/session', '/api/auth/providers', '/api/auth/register',
      '/api/auth/password', '/api/auth/cookie', '/api/auth/logout',
    ])

    const session = routes.get('/api/auth/session')!
    const before = await session.fetch(new Request('http://localhost/api/auth/session'))
    expect(await before.json()).toEqual({ authenticated: false, hasAccounts: false })

    const register = routes.get('/api/auth/register')!
    const created = await register.fetch(new Request('http://localhost/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password-123' }),
    }))
    expect(created.status).toBe(200)
    const accountCookie = created.headers.get('set-cookie')
    expect(accountCookie).toMatch(/^dsh-account-session=.*HttpOnly/u)

    const after = await session.fetch(new Request('http://localhost/api/auth/session', {
      headers: { cookie: accountCookie!.split(';', 1)[0]! },
    }))
    expect((await after.json()) as { authenticated: boolean }).toMatchObject({ authenticated: true })

    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async cookie => cookie === 'sso=valid' ? { subject: 'external-alice' } : undefined,
    })
    const providers = routes.get('/api/auth/providers')!
    expect(await providers.fetch(new Request('http://localhost/api/auth/providers'))
      .then(response => response.json())).toEqual({ providers: [{ id: providerId, label: 'Example SSO' }] })
    const cookieLogin = routes.get('/api/auth/cookie')!
    const invalidProvider = await cookieLogin.fetch(new Request('http://localhost/api/auth/cookie', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'not valid', cookie: 'sso=valid' }),
    }))
    expect(invalidProvider.status).toBe(400)
    const exchanged = await cookieLogin.fetch(new Request('http://localhost/api/auth/cookie', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'example', cookie: 'sso=valid' }),
    }))
    expect(exchanged.status).toBe(200)
    expect((await exchanged.json()) as { principal: { method: string } }).toMatchObject({ principal: { method: 'cookie' } })

    await fiber.dispose()
    expect(routes.size).toBe(0)
  })
})
