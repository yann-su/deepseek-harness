import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { cookieAuthenticatorId, MultiUserError } from '@deepseek-ai/dsh-multi-user'
import LocalMultiUserProvider from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function harness(config: ConstructorParameters<typeof LocalMultiUserProvider>[1] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-multi-user-'))
  const path = join(directory, 'accounts.json')
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const ctx = new Context()
  const fiber = ctx.plugin(LocalMultiUserProvider, { path, ...config })
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return { ctx, path }
}

async function writeStore(path: string, value: unknown): Promise<void> {
  await writeFile(path, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
}

async function expectStoreError(ctx: Context, path: string, value: unknown): Promise<void> {
  await writeStore(path, value)
  await expect(ctx.multiUser.hasAccounts()).rejects.toMatchObject({ code: 'INVALID_STORE' })
}

describe('local multi-user provider', () => {
  it('creates a password account, logs in, persists only a token hash, and resolves the Principal', async () => {
    const { ctx, path } = await harness()
    const account = await ctx.multiUser.createPasswordAccount({
      username: 'Alice', password: 'correct horse battery staple', displayName: 'Alice',
    })

    const result = await ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple' })
    expect(result.principal.accountId).toBe(account.id)
    expect(result.principal.account.username).toBe('alice')
    expect(await ctx.multiUser.resolveSession(result.token)).toEqual(result.principal)
    expect((await readFile(path, 'utf8'))).not.toContain(result.token)
    expect((await ctx.multiUser.listSessions(account.id))).toHaveLength(1)
  })

  it('rejects invalid passwords without revealing whether the account exists', async () => {
    const { ctx } = await harness()
    await ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple' })

    await expect(ctx.multiUser.loginWithPassword({ username: 'alice', password: 'wrong password' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(ctx.multiUser.loginWithPassword({ username: 'missing', password: 'wrong password' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('exchanges an injected third-party Cookie and auto-provisions the external subject once', async () => {
    const { ctx } = await harness()
    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async cookie => cookie === 'sso=valid'
        ? { subject: 'subject-1', email: 'alice@example.test', displayName: 'Alice SSO' }
        : undefined,
    })

    const first = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' })
    const second = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' })
    expect(first.principal.accountId).toBe(second.principal.accountId)
    expect(first.principal.method).toBe('cookie')
    expect(await ctx.multiUser.hasAccounts()).toBe(true)
  })

  it('revokes one session and can revoke every session for an account', async () => {
    const { ctx } = await harness()
    const account = await ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple' })
    const first = await ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple' })
    const second = await ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple' })

    expect(await ctx.multiUser.revokeSession(first.session.id)).toBe(true)
    expect(await ctx.multiUser.resolveSession(first.token)).toBeUndefined()
    expect(await ctx.multiUser.resolveSession(second.token)).toBeDefined()
    expect(await ctx.multiUser.revokeAllSessions(account.id)).toBe(1)
    expect(await ctx.multiUser.resolveSession(second.token)).toBeUndefined()
  })

  it('can require a pre-linked third-party identity instead of auto-provisioning', async () => {
    const { ctx } = await harness({ autoProvisionCookieUsers: false })
    const account = await ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple' })
    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async () => ({ subject: 'unlinked' }),
    })

    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' }))
      .rejects.toMatchObject({ code: 'EXTERNAL_ACCOUNT_NOT_LINKED' })

    await ctx.multiUser.linkExternalIdentity(account.id, providerId, { subject: 'unlinked' })
    const result = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' })
    expect(result.principal.accountId).toBe(account.id)
  })

  it('validates account inputs, duplicate names, and requested expiries', async () => {
    const { ctx } = await harness()
    await expect(ctx.multiUser.createPasswordAccount({ username: 'bad name', password: 'correct horse battery staple' }))
      .rejects.toMatchObject({ code: 'INVALID_USERNAME' })
    await expect(ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'short' }))
      .rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    await expect(ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple', displayName: 'x'.repeat(129) }))
      .rejects.toMatchObject({ code: 'INVALID_DISPLAY_NAME' })
    await ctx.multiUser.createPasswordAccount({ username: 'Alice', password: 'correct horse battery staple' })
    await expect(ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' })
    await expect(ctx.multiUser.loginWithPassword({ username: 'alice', password: '' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple', expiresAt: Date.now() - 1 }))
      .rejects.toMatchObject({ code: 'INVALID_SESSION_EXPIRY' })
    await expect(ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple', expiresAt: Number.NaN }))
      .rejects.toMatchObject({ code: 'INVALID_SESSION_EXPIRY' })
  })

  it('exposes and disposes Cookie authenticator registrations', async () => {
    const { ctx } = await harness()
    const providerId = cookieAuthenticatorId('example')
    const authenticator = {
      id: providerId,
      label: 'Example SSO',
      authenticate: async () => ({ subject: 'subject' }),
    }
    const dispose = ctx.multiUser.registerCookieAuthenticator(authenticator)
    expect(ctx.multiUser.listCookieAuthenticators()).toEqual([{ id: providerId, label: 'Example SSO' }])
    expect(() => ctx.multiUser.registerCookieAuthenticator(authenticator)).toThrow(MultiUserError)
    dispose()
    dispose()
    expect(ctx.multiUser.listCookieAuthenticators()).toEqual([])
    expect(() => cookieAuthenticatorId('not valid')).toThrow(TypeError)
    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=missing' }))
      .rejects.toMatchObject({ code: 'COOKIE_AUTHENTICATOR_NOT_FOUND' })
  })

  it('normalizes Cookie failures and forwards the raw Cookie and signal', async () => {
    const { ctx } = await harness()
    const providerId = cookieAuthenticatorId('example')
    const controller = new AbortController()
    let seenCookie: string | undefined
    let seenSignal: AbortSignal | undefined
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async (cookie, signal) => {
        seenCookie = cookie
        seenSignal = signal
        return { subject: 'subject' }
      },
    })
    const result = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=raw', signal: controller.signal })
    expect(result.principal.providerId).toBe(providerId)
    expect(seenCookie).toBe('sso=raw')
    expect(seenSignal).toBe(controller.signal)
    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: '   ' }))
      .rejects.toMatchObject({ code: 'COOKIE_REQUIRED' })

    const failingId = cookieAuthenticatorId('failing')
    ctx.multiUser.registerCookieAuthenticator({
      id: failingId,
      label: 'Failing SSO',
      authenticate: async () => { throw new Error('provider failed') },
    })
    await expect(ctx.multiUser.loginWithCookie({ providerId: failingId, cookie: 'sso=bad' }))
      .rejects.toMatchObject({ code: 'COOKIE_AUTHENTICATOR_FAILED' })

    const rejectedId = cookieAuthenticatorId('rejected')
    ctx.multiUser.registerCookieAuthenticator({
      id: rejectedId,
      label: 'Rejected SSO',
      authenticate: async () => undefined,
    })
    await expect(ctx.multiUser.loginWithCookie({ providerId: rejectedId, cookie: 'sso=bad' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    const emptyId = cookieAuthenticatorId('empty')
    ctx.multiUser.registerCookieAuthenticator({
      id: emptyId,
      label: 'Empty SSO',
      authenticate: async () => ({ subject: '   ' }),
    })
    await expect(ctx.multiUser.loginWithCookie({ providerId: emptyId, cookie: 'sso=bad' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('links external identities idempotently and prevents cross-account takeover', async () => {
    const { ctx } = await harness({ autoProvisionCookieUsers: false })
    const first = await ctx.multiUser.createPasswordAccount({ username: 'first', password: 'correct horse battery staple' })
    const second = await ctx.multiUser.createPasswordAccount({ username: 'second', password: 'correct horse battery staple' })
    const providerId = cookieAuthenticatorId('example')
    await expect(ctx.multiUser.linkExternalIdentity('missing' as typeof first.id, providerId, { subject: 'subject' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' })
    await ctx.multiUser.linkExternalIdentity(first.id, providerId, { subject: ' subject ', email: ' alice@example.test ', displayName: ' Alice ', username: 'alice' })
    await ctx.multiUser.linkExternalIdentity(first.id, providerId, { subject: 'subject' })
    await expect(ctx.multiUser.linkExternalIdentity(second.id, providerId, { subject: 'subject' }))
      .rejects.toMatchObject({ code: 'EXTERNAL_IDENTITY_LINKED' })
  })

  it('supports external-account labels, collisions, and explicit linking policy', async () => {
    const { ctx, path } = await harness()
    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async (cookie) => {
        if (cookie === 'username') return { subject: 'username-subject', username: 'Existing Name', displayName: 'Named User' }
        if (cookie === 'email') return { subject: 'email-subject', email: 'email@example.test' }
        if (cookie === 'subject') return { subject: 'subject-only' }
        return { subject: '!!!-subject', username: '!!!' }
      },
    })
    await ctx.multiUser.createPasswordAccount({ username: 'existing-name', password: 'correct horse battery staple' })
    const username = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'username' })
    expect(username.principal.account.username).toBe('existing-name-1')
    const email = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'email' })
    expect(email.principal.account.username).toBe('email')
    const subject = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'subject' })
    expect(subject.principal.account.username).toMatch(/^user-subject-only$/u)
    const fallback = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'fallback' })
    expect(fallback.principal.account.username).toMatch(/^user-[a-f0-9]{12}$/u)
    expect((await readFile(path, 'utf8')).match(/!!!/u)).not.toBeNull()
  })

  it('rejects malformed external subjects and strict non-linked Cookie accounts', async () => {
    const { ctx } = await harness({ autoProvisionCookieUsers: false })
    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async cookie => cookie === 'long' ? { subject: 'x'.repeat(513) } : { subject: 'subject' },
    })
    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: 'long' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: 'subject' }))
      .rejects.toMatchObject({ code: 'EXTERNAL_ACCOUNT_NOT_LINKED' })
  })

  it('handles missing, expired, and tampered sessions and no-op revocation', async () => {
    const { ctx, path } = await harness()
    expect(await ctx.multiUser.resolveSession('')).toBeUndefined()
    const account = await ctx.multiUser.createPasswordAccount({ username: 'alice', password: 'correct horse battery staple' })
    const result = await ctx.multiUser.loginWithPassword({ username: 'alice', password: 'correct horse battery staple' })
    const bounded = await ctx.multiUser.loginWithPassword({
      username: 'alice', password: 'correct horse battery staple', expiresAt: Date.now() + 1_000,
    })
    expect(bounded.session.expiresAt).toBeLessThanOrEqual(Date.now() + 1_000)
    expect(await ctx.multiUser.revokeSession('missing' as typeof result.session.id)).toBe(false)
    const document = JSON.parse(await readFile(path, 'utf8')) as { sessions: Array<Record<string, unknown>>; accounts: Array<Record<string, unknown>> }
    document.sessions[0]!.expiresAt = 0
    await writeStore(path, document)
    expect(await ctx.multiUser.resolveSession(result.token)).toBeUndefined()
    document.sessions[0]!.expiresAt = Date.now() + 60_000
    document.sessions[0]!.accountId = 'missing'
    await writeStore(path, document)
    expect(await ctx.multiUser.resolveSession(result.token)).toBeUndefined()
    document.sessions[0]!.accountId = account.id
    document.sessions[0]!.userId = 'tampered'
    await writeStore(path, document)
    expect(await ctx.multiUser.resolveSession(result.token)).toBeUndefined()
  })

  it('uses the configured harness home when no explicit store path is supplied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-multi-user-default-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const ctx = new Context()
    const provider = new LocalMultiUserProvider(ctx, { dshHome: directory })
    expect(await provider.hasAccounts()).toBe(false)
    const account = await provider.createPasswordAccount({ username: 'defaulted', password: 'correct horse battery staple' })
    expect(account.username).toBe('defaulted')
  })

  it('rejects an external link whose account was removed from the durable store', async () => {
    const { ctx, path } = await harness()
    const providerId = cookieAuthenticatorId('example')
    ctx.multiUser.registerCookieAuthenticator({
      id: providerId,
      label: 'Example SSO',
      authenticate: async () => ({ subject: 'subject' }),
    })
    const result = await ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' })
    const document = JSON.parse(await readFile(path, 'utf8')) as { accounts: Array<Record<string, unknown>> }
    document.accounts = []
    await writeStore(path, document)
    await expect(ctx.multiUser.loginWithCookie({ providerId, cookie: 'sso=valid' }))
      .rejects.toMatchObject({ code: 'INVALID_STORE' })
    expect(result.principal.account.username).toMatch(/^user-/u)
  })

  it('fails closed for malformed durable documents', async () => {
    const { ctx, path } = await harness()
    await expectStoreError(ctx, path, '{')
    for (const value of [null, [], {}, { version: 2, accounts: [], sessions: [], externalIdentities: [] },
      { version: 1, accounts: {}, sessions: [], externalIdentities: [] },
      { version: 1, accounts: [], sessions: {}, externalIdentities: [] },
      { version: 1, accounts: [], sessions: [], externalIdentities: {} }]) {
      await expectStoreError(ctx, path, value)
    }

    const valid = { version: 1, accounts: [], sessions: [], externalIdentities: [] }
    await expectStoreError(ctx, path, { ...valid, accounts: [null] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: '', userId: 'u', username: 'u', displayName: 'U', createdAt: 1 }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: '', username: 'u', displayName: 'U', createdAt: 1 }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: '', displayName: 'U', createdAt: 1 }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: 'u', displayName: '', createdAt: 1 }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: 'u', displayName: 'U', createdAt: 'bad' }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: 'u', displayName: 'U', createdAt: 1, password: [] }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: 'u', displayName: 'U', createdAt: 1, password: { salt: '', hash: 'h' } }] })
    await expectStoreError(ctx, path, { ...valid, accounts: [{ id: 'a', userId: 'u', username: 'u', displayName: 'U', createdAt: 1, password: { salt: 's', hash: '' } }] })

    await expectStoreError(ctx, path, { ...valid, sessions: [null] })
    const session = { id: 's', accountId: 'a', userId: 'u', tokenHash: 'h', method: 'password', createdAt: 1, expiresAt: 2, lastSeenAt: 1 }
    for (const key of ['id', 'accountId', 'userId', 'tokenHash', 'method', 'createdAt', 'expiresAt', 'lastSeenAt']) {
      await expectStoreError(ctx, path, { ...valid, sessions: [{ ...session, [key]: key === 'createdAt' || key === 'expiresAt' || key === 'lastSeenAt' ? 'bad' : '' }] })
    }
    await expectStoreError(ctx, path, { ...valid, sessions: [{ ...session, method: 'other' }] })
    await expectStoreError(ctx, path, { ...valid, sessions: [{ ...session, method: 'cookie' }] })

    await expectStoreError(ctx, path, { ...valid, externalIdentities: [null] })
    const external = { providerId: 'p', subject: 's', accountId: 'a', userId: 'u' }
    for (const key of ['providerId', 'subject', 'accountId', 'userId']) {
      await expectStoreError(ctx, path, { ...valid, externalIdentities: [{ ...external, [key]: '' }] })
    }
  })

  it('rejects an insecure store and surfaces non-ENOENT filesystem errors', async () => {
    const { ctx, path } = await harness()
    if (process.platform !== 'win32') {
      await writeStore(path, { version: 1, accounts: [], sessions: [], externalIdentities: [] })
      await chmod(path, 0o644)
      await expect(ctx.multiUser.hasAccounts()).rejects.toMatchObject({ code: 'INSECURE_STORE_PERMISSIONS' })
    }
    await rm(path, { force: true })
    await mkdir(path)
    await chmod(path, 0o700)
    await expect(ctx.multiUser.hasAccounts()).rejects.toMatchObject({ code: 'EISDIR' })
  })
})
