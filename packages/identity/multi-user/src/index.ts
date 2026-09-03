/**
 * Service Definition for product-account identity and authentication.
 * Provider implementations own account persistence and password hashing;
 * consumers register third-party cookie exchangers and attach the resulting
 * Principal to their request scope. This seam is separate from anonymous
 * telemetry identity and from provider-credential authorization.
 * @module @deepseek-ai/dsh-multi-user
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  Account, AccountId, AuthSessionId, AuthenticationResult, CookieAuthenticator,
  CookieAuthenticatorId, CookieAuthenticatorView, CookieLoginRequest, PasswordAccountInput,
  PasswordLoginRequest, Principal, AuthSessionView, ExternalIdentity,
} from './types.ts'

export type {
  Account, AccountId, AuthMethod, AuthSessionId, AuthSessionView, AuthenticationResult,
  CookieAuthenticator, CookieAuthenticatorId, CookieAuthenticatorView, CookieLoginRequest,
  ExternalIdentity, PasswordAccountInput, PasswordLoginRequest, Principal, UserId,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Account identity and authentication provider. */
    multiUser: MultiUserProvider
  }
}

/** Stable error from the multi-user identity seam. */
export class MultiUserError extends Error {
  /** Machine-readable failure code. */
  readonly code: string

  /**
   * @param code - stable failure category.
   * @param message - correction-oriented diagnostic.
   * @param options - optional contained cause.
   */
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MultiUserError'
    this.code = code
  }
}

/**
 * Brand a provider-owned cookie authenticator id after validation.
 * @param value - lowercase identifier selected by the authenticator plugin.
 * @returns the branded identifier.
 */
export function cookieAuthenticatorId(value: string): CookieAuthenticatorId {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new TypeError(`cookie authenticator id "${value}" must match /^[a-z][a-z0-9-]*$/`)
  }
  return brandString<CookieAuthenticatorId>(value)
}

/**
 * Abstract account/authentication provider. It owns the registry of cookie
 * exchangers so a third-party plugin can add an authentication method without
 * coupling the local account store to that provider's protocol.
 */
export abstract class MultiUserProvider extends Service {
  private readonly cookieAuthenticators = new Map<CookieAuthenticatorId, CookieAuthenticator>()

  constructor(ctx: Context) {
    super(ctx, 'multiUser')
  }

  /**
   * Register one third-party Cookie exchanger. The raw Cookie value is passed
   * only to the exchanger during login and is never retained by this seam.
   * @param authenticator - provider id, label, and exchange callback.
   * @returns disposer that removes the authenticator.
   * @throws {MultiUserError} code `DUPLICATE_COOKIE_AUTHENTICATOR` when reused.
   */
  registerCookieAuthenticator(authenticator: CookieAuthenticator): () => void {
    if (this.cookieAuthenticators.has(authenticator.id)) {
      throw new MultiUserError(
        'DUPLICATE_COOKIE_AUTHENTICATOR',
        `a cookie authenticator for "${authenticator.id}" is already registered`,
      )
    }
    const dispose = this.ctx.effect(() => {
      this.cookieAuthenticators.set(authenticator.id, authenticator)
      return () => { this.cookieAuthenticators.delete(authenticator.id) }
    }, 'multiUser.registerCookieAuthenticator()')
    return () => void dispose()
  }

  /**
   * List registered cookie providers without exposing callbacks.
   * @returns public provider ids and labels.
   */
  listCookieAuthenticators(): readonly CookieAuthenticatorView[] {
    return [...this.cookieAuthenticators.values()].map(({ id, label }) => ({ id, label }))
  }

  /** Resolve one registered cookie provider for a local implementation. */
  protected cookieAuthenticator(id: CookieAuthenticatorId): CookieAuthenticator {
    const authenticator = this.cookieAuthenticators.get(id)
    if (authenticator === undefined) {
      throw new MultiUserError('COOKIE_AUTHENTICATOR_NOT_FOUND', `no cookie authenticator is registered for "${id}"`)
    }
    return authenticator
  }

  /**
   * Whether this home already contains an account.
   * @returns true when at least one account exists.
   */
  abstract hasAccounts(): Promise<boolean>

  /**
   * Create a local password account.
   * @param input - account name, password, and optional display name.
   * @returns the public account record.
   */
  abstract createPasswordAccount(input: PasswordAccountInput): Promise<Account>

  /**
   * Authenticate a local password and create an application session.
   * @param request - username, password, and optional expiry.
   * @returns the application token, Principal, and public session.
   */
  abstract loginWithPassword(request: PasswordLoginRequest): Promise<AuthenticationResult>

  /**
   * Link a verified third-party subject to an existing account.
   * @param accountId - local account that will own the subject.
   * @param providerId - registered cookie authenticator id.
   * @param identity - verified external subject returned by that authenticator.
   * @returns resolution after the durable link is committed.
   */
  abstract linkExternalIdentity(
    accountId: AccountId,
    providerId: CookieAuthenticatorId,
    identity: ExternalIdentity,
  ): Promise<void>

  /**
   * Exchange a third-party Cookie and create or resolve an application session.
   * @param request - authenticator id, raw Cookie, and optional expiry.
   * @returns the application token, Principal, and public session.
   */
  abstract loginWithCookie(request: CookieLoginRequest): Promise<AuthenticationResult>

  /**
   * Resolve an opaque application token to its current Principal.
   * @param token - application Cookie value.
   * @returns the Principal, or undefined when the token is invalid or expired.
   */
  abstract resolveSession(token: string): Promise<Principal | undefined>

  /**
   * Revoke one session by its public id.
   * @param sessionId - session to revoke.
   * @returns true when a stored session was removed.
   */
  abstract revokeSession(sessionId: AuthSessionId): Promise<boolean>

  /**
   * Revoke every session belonging to one account.
   * @param accountId - account whose sessions are removed.
   * @returns number of sessions removed.
   */
  abstract revokeAllSessions(accountId: AccountId): Promise<number>

  /**
   * List non-secret session metadata for one account.
   * @param accountId - account whose sessions are listed.
   * @returns active session views without tokens.
   */
  abstract listSessions(accountId: AccountId): Promise<readonly AuthSessionView[]>
}

export default MultiUserProvider
