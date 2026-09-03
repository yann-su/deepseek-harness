/** Wire-safe and provider-facing types for the multi-user identity seam. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable account identity. */
export type AccountId = Branded<'AccountId'>
/** Stable user identity inside an account. */
export type UserId = Branded<'UserId'>
/** Opaque persisted authentication-session identity. */
export type AuthSessionId = Branded<'AuthSessionId'>
/** Identifier chosen by a cookie-authenticator plugin. */
export type CookieAuthenticatorId = Branded<'CookieAuthenticatorId'>

/** A local account without password hashes or other secrets. */
export interface Account {
  /** Stable account id. */
  readonly id: AccountId
  /** Stable user id for the account owner. */
  readonly userId: UserId
  /** Normalized login name. */
  readonly username: string
  /** Display name shown by clients. */
  readonly displayName: string
  /** Creation time in epoch milliseconds. */
  readonly createdAt: number
}
/** Identity returned by a third-party cookie authenticator. */
export interface ExternalIdentity {
  /** Provider-owned stable subject; never use an email as the primary key. */
  readonly subject: string
  /** Optional provider-supplied email for initial account labeling. */
  readonly email?: string
  /** Optional provider-supplied display name. */
  readonly displayName?: string
  /** Optional provider-supplied username. */
  readonly username?: string
}

/** A third-party authenticator that exchanges an injected Cookie header. */
export interface CookieAuthenticator {
  /** Stable plugin-owned identifier. */
  readonly id: CookieAuthenticatorId
  /** Human-readable provider name. */
  readonly label: string
  /**
   * Validate the raw Cookie header with the third party and return its stable
   * identity. The cookie is never persisted by the multi-user provider.
   * @param cookie - raw HTTP Cookie header, kept in memory for this call only.
   * @param signal - optional cancellation signal owned by the caller.
   * @returns the external identity, or `undefined` when the cookie is rejected.
   */
  authenticate(cookie: string, signal?: AbortSignal): Promise<ExternalIdentity | undefined>
}

/** Password account creation input. */
export interface PasswordAccountInput {
  /** Login name; providers normalize it before uniqueness checks. */
  readonly username: string
  /** Password supplied over a protected transport. */
  readonly password: string
  /** Optional display name; defaults to the normalized username. */
  readonly displayName?: string
}

/** Password login input. */
export interface PasswordLoginRequest {
  /** Login name. */
  readonly username: string
  /** Password supplied over a protected transport. */
  readonly password: string
  /** Optional session lifetime override, bounded by the provider. */
  readonly expiresAt?: number
}

/** Cookie login input. */
export interface CookieLoginRequest {
  /** Registered cookie authenticator id. */
  readonly providerId: CookieAuthenticatorId
  /** Raw third-party Cookie header. It is never written to storage. */
  readonly cookie: string
  /** Optional session lifetime override, bounded by the provider. */
  readonly expiresAt?: number
  /** Optional cancellation signal for the third-party exchange. */
  readonly signal?: AbortSignal
}

/** Method used to create an authentication session. */
export type AuthMethod = 'password' | 'cookie'

/** Public view of one authentication session. */
export interface AuthSessionView {
  /** Session identity used by revoke/list operations. */
  readonly id: AuthSessionId
  /** Account that owns the session. */
  readonly accountId: AccountId
  /** User that owns the session. */
  readonly userId: UserId
  /** Authentication method used to create it. */
  readonly method: AuthMethod
  /** Third-party provider when `method` is `cookie`. */
  readonly providerId?: CookieAuthenticatorId
  /** Creation time in epoch milliseconds. */
  readonly createdAt: number
  /** Absolute expiry time in epoch milliseconds. */
  readonly expiresAt: number
  /** Last successful session resolution in epoch milliseconds. */
  readonly lastSeenAt: number
}

/** Request-scoped identity exposed to authorization consumers. */
export interface Principal {
  /** Account owning the current request. */
  readonly accountId: AccountId
  /** User owning the current request. */
  readonly userId: UserId
  /** Session backing the current request. */
  readonly sessionId: AuthSessionId
  /** Account snapshot safe for UI and policy code. */
  readonly account: Account
  /** Authentication method used by the current session. */
  readonly method: AuthMethod
  /** Third-party provider when `method` is `cookie`. */
  readonly providerId?: CookieAuthenticatorId
}

/** Result returned after a successful login. */
export interface AuthenticationResult {
  /** Opaque token to put in the application Cookie. */
  readonly token: string
  /** Request-scoped identity associated with the token. */
  readonly principal: Principal
  /** Public session view for device/session management UI. */
  readonly session: AuthSessionView
}

/** Public method metadata for a registered cookie authenticator. */
export interface CookieAuthenticatorView {
  /** Authenticator id. */
  readonly id: CookieAuthenticatorId
  /** Human-readable provider name. */
  readonly label: string
}
