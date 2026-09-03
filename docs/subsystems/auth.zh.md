# 产品账户与认证

[English](auth.md) | 中文

多用户身份 seam 将产品账户与匿名安装 id、提供方凭据授权分开。[dsh-multi-user](../../packages/identity/multi-user) 维护账户、Principal 和应用会话词汇；[dsh-multi-user-local](../../packages/identity/multi-user-local) 存储本地账户和可吊销会话。第三方插件注册 Cookie 鉴权器，把原始 HTTP Cookie 交换为稳定的外部 subject。本地 Provider 永不持久化 Cookie。

## 请求身份

HTTP 或 WebSocket Consumer 在每个请求中解析一次应用 Cookie 并取得 `Principal`。资源 Controller 必须为每个读取、变更、后台任务和流操作执行 Principal 的账户归属检查；前端过滤不是授权机制。

## 鉴权方式

密码登录通过 scrypt 校验后创建本地账户会话。Cookie 登录调用 Provider 注册的鉴权器，然后解析已有的外部 subject 关联，或按 Provider 配置自动创建本地账户。两种方式都返回不透明应用 token，磁盘上只保存其 hash。

## 数据与执行作用域

身份 Provider 不负责 Session 或 Workspace 记录，也不隔离插件代码或子进程。Consumer 必须为持久化资源增加账户归属。不可信执行需要沙箱或 execution-world Provider；Cookie 登录本身不是操作系统隔离边界。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
