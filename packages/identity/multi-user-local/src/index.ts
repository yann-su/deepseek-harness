/**
 * Local provider for the multi-user identity seam. Accounts and revocable
 * application sessions are stored in an owner-only JSON document. Passwords
 * are scrypt hashes; third-party plugins exchange an injected raw Cookie
 * header through `ctx.multiUser.registerCookieAuthenticator()` and only the
 * resulting external subject is persisted.
 * @module @deepseek-ai/dsh-multi-user-local
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import MultiUserProvider, { MultiUserError } from '@deepseek-ai/dsh-multi-user'
import type {
  Account, AccountId, AuthMethod, AuthSessionId, AuthenticationResult, CookieLoginRequest,
  CookieAuthenticatorId, PasswordAccountInput, PasswordLoginRequest, Principal,
  AuthSessionView, ExternalIdentity, UserId,
} from '@deepseek-ai/dsh-multi-user'

const scryptAsync = promisify(scrypt)
const STORE_VERSION = 1
const STORE_FILENAME = '.multi-user.json'
const GROUP_OTHER_BITS = 0o077
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000
const DEFAULT_PASSWORD_MIN_LENGTH = 8
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._@+-]{0,127}$/i

/** Local provider configuration. */
export interface Config {
  /** Explicit account store path; otherwise `<DSH_HOME>/.multi-user.json`. */
  readonly path?: string
  /** Harness home used when `path` is omitted. */
  readonly dshHome?: string
  /** Maximum absolute lifetime for an application session. */
  readonly sessionTtlMs?: number
  /** Minimum password length for locally created accounts. */
  readonly passwordMinLength?: number
  /** Create a local account automatically for an unknown third-party subject. */
  readonly autoProvisionCookieUsers?: boolean
}

/** Resolved local provider parameters. */
interface ResolvedConfig {
  readonly filename: string
  readonly sessionTtlMs: number
  readonly passwordMinLength: number
  readonly autoProvisionCookieUsers: boolean
}

/** Password verifier persisted for one account. */
interface StoredPassword {
  readonly salt: string
  readonly hash: string
}

/** Account record persisted without any raw login token. */
interface StoredAccount {
  readonly id: string
  readonly userId: string
  readonly username: string
  readonly displayName: string
  readonly createdAt: number
  readonly password?: StoredPassword
}

/** Revocable session record persisted with only a token hash. */
interface StoredSession {
  readonly id: string
  readonly accountId: string
  readonly userId: string
  readonly tokenHash: string
  readonly method: AuthMethod
  readonly providerId?: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly lastSeenAt: number
}

/** External subject link persisted after a cookie exchange. */
interface StoredExternalIdentity {
  readonly providerId: string
  readonly subject: string
  readonly accountId: string
  readonly userId: string
}

/** Versioned local account document. */
interface StoredDocument {
  readonly version: typeof STORE_VERSION
  readonly accounts: StoredAccount[]
  readonly sessions: StoredSession[]
  readonly externalIdentities: StoredExternalIdentity[]
}

/** A successful mutation result together with its newly committed document. */
interface Mutation<T> {
  readonly document: StoredDocument
  readonly value: T
}

/** Local file-backed multi-user provider. */
export class LocalMultiUserProvider extends MultiUserProvider {
  /** Plugin configuration schema. */
  static Config: z<Config> = z.object({
    path: z.string(),
    dshHome: z.string(),
    sessionTtlMs: z.number().step(1).min(60_000).default(DEFAULT_SESSION_TTL_MS),
    passwordMinLength: z.number().step(1).min(8).max(1_024).default(DEFAULT_PASSWORD_MIN_LENGTH),
    autoProvisionCookieUsers: z.boolean().default(true),
  })

  private readonly spec: ResolvedConfig
  private operations: Promise<void> = Promise.resolve()

  /**
   * @param ctx - context where the multi-user service is mounted.
   * @param config - local persistence and login policy.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx)
    this.spec = resolveConfig(config)
  }

  /** Whether the local store contains at least one account. */
  async hasAccounts(): Promise<boolean> {
    const document = await this.read()
    return document.accounts.length > 0
  }

  /** Create and persist one password account. */
  async createPasswordAccount(input: PasswordAccountInput): Promise<Account> {
    const username = normalizeUsername(input.username)
    validatePassword(input.password, this.spec.passwordMinLength)
    const displayName = normalizeDisplayName(input.displayName, username)
    const password = await hashPassword(input.password)
    return this.mutate((document) => {
      if (document.accounts.some(account => account.username === username)) {
        throw new MultiUserError('ACCOUNT_EXISTS', `an account named "${username}" already exists`)
      }
      const account: StoredAccount = {
        id: randomUUID(),
        userId: randomUUID(),
        username,
        displayName,
        createdAt: Date.now(),
        password,
      }
      const next = { ...document, accounts: [...document.accounts, account] }
      return { document: next, value: publicAccount(account) }
    })
  }

  /** Verify a password and create a revocable application session. */
  async loginWithPassword(request: PasswordLoginRequest): Promise<AuthenticationResult> {
    const username = normalizeUsername(request.username)
    if (request.password.length === 0) throw invalidCredentials()
    return this.mutate(async (document) => {
      const account = document.accounts.find(candidate => candidate.username === username)
      const valid = await verifyPassword(request.password, account?.password)
      if (account === undefined || !valid) throw invalidCredentials()
      return createSession(document, account, 'password', undefined, this.expiry(request.expiresAt))
    })
  }

  /**
   * Link a verified external subject to an existing local account.
   * @param accountId - local account that will own the subject.
   * @param providerId - registered cookie authenticator id.
   * @param external - verified provider subject and optional display metadata.
   * @returns resolution after the durable link is committed.
   */
  async linkExternalIdentity(accountId: AccountId, providerId: CookieAuthenticatorId, external: ExternalIdentity): Promise<void> {
    const identity = normalizeExternalIdentity(external)
    await this.mutate((document) => {
      const account = document.accounts.find(candidate => candidate.id === accountId)
      if (account === undefined) throw new MultiUserError('ACCOUNT_NOT_FOUND', 'the account to link does not exist')
      const existing = document.externalIdentities.find(candidate =>
        candidate.providerId === providerId && candidate.subject === identity.subject)
      if (existing !== undefined && existing.accountId !== accountId) {
        throw new MultiUserError('EXTERNAL_IDENTITY_LINKED', 'the external identity is already linked to another account')
      }
      if (existing !== undefined) return { document, value: undefined }
      return {
        document: {
          ...document,
          externalIdentities: [...document.externalIdentities, {
            providerId, subject: identity.subject, accountId: account.id, userId: account.userId,
          }],
        },
        value: undefined,
      }
    })
  }

  /** Exchange a third-party Cookie header and create a local application session. */
  async loginWithCookie(request: CookieLoginRequest): Promise<AuthenticationResult> {
    if (request.cookie.trim() === '') throw new MultiUserError('COOKIE_REQUIRED', 'a third-party Cookie header is required')
    const authenticator = this.cookieAuthenticator(request.providerId)
    let external: ExternalIdentity | undefined
    try {
      external = await authenticator.authenticate(request.cookie, request.signal)
    } catch (error) {
      throw new MultiUserError('COOKIE_AUTHENTICATOR_FAILED', 'the third-party cookie exchange failed', { cause: error })
    }
    if (external === undefined || external.subject.trim() === '') throw invalidCredentials()
    const identity = normalizeExternalIdentity(external)
    return this.mutate((document) => {
      const link = document.externalIdentities.find(candidate =>
        candidate.providerId === request.providerId && candidate.subject === identity.subject)
      let account: StoredAccount | undefined = link === undefined
        ? undefined
        : document.accounts.find(candidate => candidate.id === link.accountId)
      if (link !== undefined && account === undefined) {
        throw new MultiUserError('INVALID_STORE', 'the external identity points to a missing account')
      }
      let next = document
      if (account === undefined) {
        if (!this.spec.autoProvisionCookieUsers) {
          throw new MultiUserError('EXTERNAL_ACCOUNT_NOT_LINKED', 'the third-party identity is not linked to a local account')
        }
        account = createExternalAccount(document, identity)
        next = {
          ...document,
          accounts: [...document.accounts, account],
          externalIdentities: [...document.externalIdentities, {
            providerId: request.providerId,
            subject: identity.subject,
            accountId: account.id,
            userId: account.userId,
          }],
        }
      }
      return createSession(next, account, 'cookie', request.providerId, this.expiry(request.expiresAt))
    })
  }

  /** Resolve an opaque application token to a non-secret Principal. */
  async resolveSession(token: string): Promise<Principal | undefined> {
    if (token.trim() === '') return undefined
    const document = await this.read()
    const tokenHash = hashToken(token)
    const session = document.sessions.find(candidate => candidate.tokenHash === tokenHash)
    if (session === undefined || session.expiresAt <= Date.now()) return undefined
    const account = document.accounts.find(candidate => candidate.id === session.accountId)
    if (account === undefined || account.userId !== session.userId) return undefined
    return principalOf(account, session)
  }

  /** Revoke a single application session. */
  async revokeSession(sessionId: AuthSessionId): Promise<boolean> {
    return this.mutate((document) => {
      const sessions = document.sessions.filter(session => session.id !== sessionId)
      return {
        document: sessions.length === document.sessions.length ? document : { ...document, sessions },
        value: sessions.length !== document.sessions.length,
      }
    })
  }

  /** Revoke all sessions belonging to an account. */
  async revokeAllSessions(accountId: AccountId): Promise<number> {
    return this.mutate((document) => {
      const sessions = document.sessions.filter(session => session.accountId !== accountId)
      return { document: { ...document, sessions }, value: document.sessions.length - sessions.length }
    })
  }

  /** List non-secret sessions for one account. */
  async listSessions(accountId: AccountId): Promise<readonly AuthSessionView[]> {
    const document = await this.read()
    return document.sessions
      .filter(session => session.accountId === accountId && session.expiresAt > Date.now())
      .map(sessionViewOf)
  }

  /** Resolve a requested expiry without allowing a caller to extend provider policy. */
  private expiry(requested: number | undefined): number {
    const now = Date.now()
    const limit = now + this.spec.sessionTtlMs
    if (requested === undefined) return limit
    if (!Number.isFinite(requested) || requested <= now) {
      throw new MultiUserError('INVALID_SESSION_EXPIRY', 'session expiry must be a future epoch millisecond')
    }
    return Math.min(requested, limit)
  }

  /** Read and validate the current document. */
  private async read(): Promise<StoredDocument> {
    await ensureOwnerOnly(this.spec.filename)
    let text: string
    try {
      text = await readFile(this.spec.filename, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return emptyDocument()
      throw error
    }
    return parseDocument(text, this.spec.filename)
  }

  /** Serialize a read-modify-write through both the process queue and file lock. */
  private async mutate<T>(operation: (document: StoredDocument) => Mutation<T> | Promise<Mutation<T>>): Promise<T> {
    const result = this.operations.then(async () => withFileLock(this.spec.filename, async () => {
      const current = await this.read()
      const mutation = await operation(current)
      await writeFileAtomic(this.spec.filename, `${JSON.stringify(mutation.document, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
      return mutation
    }, { waitMs: 30_000 }))
    this.operations = result.then(() => undefined, () => undefined)
    return (await result).value
  }
}

/** Resolve defaults once at the provider boundary. */
function resolveConfig(config: Config): ResolvedConfig {
  return {
    filename: resolve(config.path ?? join(resolveDshHome(config.dshHome), STORE_FILENAME)),
    sessionTtlMs: config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
    passwordMinLength: config.passwordMinLength ?? DEFAULT_PASSWORD_MIN_LENGTH,
    autoProvisionCookieUsers: config.autoProvisionCookieUsers ?? true,
  }
}

/** Empty versioned store. */
function emptyDocument(): StoredDocument {
  return { version: STORE_VERSION, accounts: [], sessions: [], externalIdentities: [] }
}

/** Parse a durable document at the file boundary and reject unknown layouts. */
function parseDocument(text: string, filename: string): StoredDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new MultiUserError('INVALID_STORE', `multi-user store at ${filename} is not valid JSON`, { cause: error })
  }
  if (!isRecord(value) || value.version !== STORE_VERSION
    || !Array.isArray(value.accounts) || !Array.isArray(value.sessions)
    || !Array.isArray(value.externalIdentities)) {
    throw new MultiUserError('INVALID_STORE', `multi-user store at ${filename} has an unsupported version or layout`)
  }
  const accounts = value.accounts.map((entry, index) => parseAccount(entry, filename, index))
  const sessions = value.sessions.map((entry, index) => parseSession(entry, filename, index))
  const externalIdentities = value.externalIdentities.map((entry, index) => parseExternal(entry, filename, index))
  return { version: STORE_VERSION, accounts, sessions, externalIdentities }
}

function parseAccount(value: unknown, filename: string, index: number): StoredAccount {
  if (!isRecord(value)) throw invalidRecord(filename, 'account', index)
  const id = requiredString(value, 'id')
  const userId = requiredString(value, 'userId')
  const username = requiredString(value, 'username')
  const displayName = requiredString(value, 'displayName')
  const createdAt = requiredNumber(value, 'createdAt')
  if (id === undefined || userId === undefined || username === undefined || displayName === undefined || createdAt === undefined) {
    throw invalidRecord(filename, 'account', index)
  }
  const passwordValue = value.password
  let password: StoredPassword | undefined
  if (passwordValue !== undefined) {
    if (!isRecord(passwordValue)) throw invalidRecord(filename, 'account password', index)
    const salt = requiredString(passwordValue, 'salt')
    const hash = requiredString(passwordValue, 'hash')
    if (salt === undefined || hash === undefined) {
      throw invalidRecord(filename, 'account password', index)
    }
    password = { salt, hash }
  }
  return {
    id, userId, username, displayName, createdAt,
    ...password === undefined ? {} : { password },
  }
}

function parseSession(value: unknown, filename: string, index: number): StoredSession {
  if (!isRecord(value)) throw invalidRecord(filename, 'session', index)
  const id = requiredString(value, 'id')
  const accountId = requiredString(value, 'accountId')
  const userId = requiredString(value, 'userId')
  const tokenHash = requiredString(value, 'tokenHash')
  const method = requiredString(value, 'method')
  const createdAt = requiredNumber(value, 'createdAt')
  const expiresAt = requiredNumber(value, 'expiresAt')
  const lastSeenAt = requiredNumber(value, 'lastSeenAt')
  if (id === undefined || accountId === undefined || userId === undefined || tokenHash === undefined
    || method === undefined || createdAt === undefined || expiresAt === undefined || lastSeenAt === undefined
    || (method !== 'password' && method !== 'cookie')) {
    throw invalidRecord(filename, 'session', index)
  }
  const providerId = typeof value.providerId === 'string' ? value.providerId : undefined
  if (method === 'cookie' && providerId === undefined) throw invalidRecord(filename, 'cookie session', index)
  return {
    id, accountId, userId, tokenHash, method, ...providerId === undefined ? {} : { providerId },
    createdAt, expiresAt, lastSeenAt,
  }
}

function parseExternal(value: unknown, filename: string, index: number): StoredExternalIdentity {
  if (!isRecord(value)) throw invalidRecord(filename, 'external identity', index)
  const providerId = requiredString(value, 'providerId')
  const subject = requiredString(value, 'subject')
  const accountId = requiredString(value, 'accountId')
  const userId = requiredString(value, 'userId')
  if (providerId === undefined || subject === undefined || accountId === undefined || userId === undefined) {
    throw invalidRecord(filename, 'external identity', index)
  }
  return { providerId, subject, accountId, userId }
}

function invalidRecord(filename: string, kind: string, index: number): MultiUserError {
  return new MultiUserError('INVALID_STORE', `multi-user store at ${filename} contains an invalid ${kind} at index ${String(index)}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function requiredNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    throw new MultiUserError('INVALID_USERNAME', 'username must contain 1-128 letters, digits, or . _ @ + - characters')
  }
  return username
}

function normalizeDisplayName(value: string | undefined, username: string): string {
  const displayName = value?.trim() || username
  if (displayName.length > 128) throw new MultiUserError('INVALID_DISPLAY_NAME', 'display name must be at most 128 characters')
  return displayName
}

function validatePassword(password: string, minimum: number): void {
  if (password.length < minimum) throw new MultiUserError('PASSWORD_TOO_SHORT', `password must contain at least ${String(minimum)} characters`)
}

async function hashPassword(password: string, salt = randomBytes(16)): Promise<StoredPassword> {
  const hash = await scryptAsync(password, salt, 64)
  return { salt: salt.toString('base64url'), hash: (hash as Buffer).toString('base64url') }
}

async function verifyPassword(password: string, stored: StoredPassword | undefined): Promise<boolean> {
  const candidate = stored === undefined
    ? await hashPassword(password, Buffer.from('dsh-multi-user-dummy-salt'))
    : await hashPassword(password, Buffer.from(stored.salt, 'base64url'))
  if (stored === undefined) return false
  const expected = Buffer.from(stored.hash, 'base64url')
  const actual = Buffer.from(candidate.hash, 'base64url')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

function createSession(
  document: StoredDocument,
  account: StoredAccount,
  method: AuthMethod,
  providerId: CookieAuthenticatorId | undefined,
  expiresAt: number,
): Mutation<AuthenticationResult> {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const session: StoredSession = {
    id: randomUUID(), accountId: account.id, userId: account.userId,
    tokenHash: hashToken(token), method,
    ...providerId === undefined ? {} : { providerId },
    createdAt: now, expiresAt, lastSeenAt: now,
  }
  const next = { ...document, sessions: [...document.sessions, session] }
  return {
    document: next,
    value: { token, principal: principalOf(account, session), session: sessionViewOf(session) },
  }
}

function principalOf(account: StoredAccount, session: StoredSession): Principal {
  return {
    accountId: brandString<AccountId>(account.id),
    userId: brandString<UserId>(account.userId),
    sessionId: brandString<AuthSessionId>(session.id),
    account: publicAccount(account),
    method: session.method,
    ...session.providerId === undefined ? {} : { providerId: brandString<CookieAuthenticatorId>(session.providerId) },
  }
}

function publicAccount(account: StoredAccount): Account {
  return {
    id: brandString<AccountId>(account.id),
    userId: brandString<UserId>(account.userId),
    username: account.username,
    displayName: account.displayName,
    createdAt: account.createdAt,
  }
}

function sessionViewOf(session: StoredSession): AuthSessionView {
  return {
    id: brandString<AuthSessionId>(session.id),
    accountId: brandString<AccountId>(session.accountId),
    userId: brandString<UserId>(session.userId),
    method: session.method,
    ...session.providerId === undefined ? {} : { providerId: brandString<CookieAuthenticatorId>(session.providerId) },
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
  }
}

function normalizeExternalIdentity(identity: ExternalIdentity): ExternalIdentity {
  const subject = identity.subject.trim()
  if (subject.length === 0 || subject.length > 512) throw invalidCredentials()
  return {
    subject,
    ...identity.email?.trim() ? { email: identity.email.trim() } : {},
    ...identity.username?.trim() ? { username: identity.username.trim() } : {},
    ...identity.displayName?.trim() ? { displayName: identity.displayName.trim() } : {},
  }
}

function createExternalAccount(document: StoredDocument, identity: ExternalIdentity): StoredAccount {
  const requested = identity.username ?? identity.email?.split('@')[0] ?? `user-${identity.subject.slice(0, 12)}`
  const base = sanitizeExternalUsername(requested)
  let username = base
  let suffix = 1
  while (document.accounts.some(account => account.username === username)) {
    username = `${base.slice(0, Math.max(1, 120 - String(suffix).length))}-${String(suffix)}`
    suffix += 1
  }
  return {
    id: randomUUID(),
    userId: randomUUID(),
    username,
    displayName: normalizeDisplayName(identity.displayName ?? identity.email, username),
    createdAt: Date.now(),
  }
}

function sanitizeExternalUsername(value: string): string {
  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9._@+-]+/g, '-')
  return normalizeUsername(sanitized.replace(/^-+|-+$/g, '') || `user-${randomBytes(6).toString('hex')}`)
}

function invalidCredentials(): MultiUserError {
  return new MultiUserError('INVALID_CREDENTIALS', 'the supplied login credentials were not accepted')
}

async function ensureOwnerOnly(filename: string): Promise<void> {
  try {
    const mode = (await stat(filename)).mode
    if (process.platform !== 'win32' && (mode & GROUP_OTHER_BITS) !== 0) {
      throw new MultiUserError('INSECURE_STORE_PERMISSIONS', `multi-user store ${filename} is readable beyond its owner`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
      return
    }
    throw error
  }
}

export default LocalMultiUserProvider
