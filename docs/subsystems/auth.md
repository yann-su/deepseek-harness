# Product Accounts and Authentication

English | [中文](auth.zh.md)

The multi-user identity seam defines product accounts separately from the anonymous installation id and from provider-credential authorization. [dsh-multi-user](../../packages/identity/multi-user) owns the account, Principal, and application-session vocabulary; [dsh-multi-user-local](../../packages/identity/multi-user-local) stores local accounts and revocable sessions. Third-party plugins register a Cookie authenticator that exchanges a raw HTTP Cookie for a stable external subject. The Cookie is never persisted by the local provider.

## Request identity

An HTTP or WebSocket consumer resolves the application Cookie once per request and obtains a `Principal`. Resource controllers must enforce the Principal's account ownership for every read, mutation, background job, and stream; frontend filtering is not an authorization mechanism.

## Authentication methods

Password login creates a local account session after scrypt verification. Cookie login calls a provider-registered authenticator and either resolves an existing external-subject link or auto-provisions a local account according to provider configuration. Both methods return an opaque application token; only its hash is stored.

## Data and execution scope

The identity provider does not own Session or Workspace records and does not isolate plugin code or subprocesses. Consumers must add account ownership to durable resources. Untrusted execution needs the sandbox or an execution-world provider; a Cookie login alone is not an operating-system isolation boundary.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmultiuser--multiuserprovider-abstract-seam"></a>

### `ctx.multiUser` — `MultiUserProvider` (abstract seam)

Abstract account/authentication provider. It owns the registry of cookie exchangers so a third-party plugin can add an authentication method without coupling the local account store to that provider's protocol.

```ts cordis-catalog
/**
 * Register one third-party Cookie exchanger. The raw Cookie value is passed
 * only to the exchanger during login and is never retained by this seam.
 * @param authenticator - provider id, label, and exchange callback.
 * @returns disposer that removes the authenticator.
 * @throws {MultiUserError} code `DUPLICATE_COOKIE_AUTHENTICATOR` when reused.
 */
registerCookieAuthenticator(authenticator: CookieAuthenticator): () => void

/**
 * List registered cookie providers without exposing callbacks.
 * @returns public provider ids and labels.
 */
listCookieAuthenticators(): readonly CookieAuthenticatorView[]

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
abstract linkExternalIdentity( accountId: AccountId, providerId: CookieAuthenticatorId, identity: ExternalIdentity, ): Promise<void>

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
```

Source: [`packages/identity/multi-user/src/index.ts`](../../packages/identity/multi-user/src/index.ts)
<!-- END GENERATED cordis-surface -->
