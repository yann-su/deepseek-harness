# Agent Note: Product-account authentication seam supports passwords and injected Cookies

Status: implemented

English | [中文](2026-09-02-multi-user-auth-seam.zh.md)

## Problem

The browser connection already exchanged a process launch token for a signed Cookie, but the Harness had no product account, request Principal, revocable application session, or extension point for a third-party login. The anonymous installation id and `ctx.authorization` intentionally serve different purposes and cannot become account identity.

## Decision

Add `dsh-multi-user` as the account/authentication Service Definition and `dsh-multi-user-local` as its owner-only JSON provider. The provider creates password accounts with scrypt verifiers, issues opaque random application tokens while persisting only SHA-256 token hashes, resolves a token to a Principal, and supports single-session or account-wide revocation. Third-party plugins register a Cookie authenticator by id; the callback receives the raw Cookie for one exchange and returns a stable external subject. The raw Cookie is never persisted by the provider.

Unknown external subjects auto-provision a local account by default for workstation use; deployments that require an administrator link set `autoProvisionCookieUsers: false`. HTTP and Gateway integration remains an explicit consumer responsibility: it must resolve the application Cookie once per request and enforce ownership on every resource and stream operation.

## Alternatives considered

**Reuse the anonymous installation id.** Rejected: it intentionally identifies a harness home rather than a product account and is sent to telemetry and provider requests.

**Put third-party Cookie values in credentials records.** Rejected: a Cookie is an input to the provider's exchange and may be revoked or scoped differently; persisting it would turn a transient browser credential into a durable secret.

**Make the existing browser launch token the account session.** Rejected: it is process-scoped and one-time, while account sessions need logout, expiry, and per-device revocation.

## Consequences

The seam supports password and third-party login without coupling the local store to any external protocol. Existing anonymous telemetry identity and provider-credential authorization remain unchanged. The provider does not isolate plugin code or subprocesses, and it does not attach ownership to Session or Workspace records; those concerns require the subsequent Connection/Gateway/controller and execution-world integrations.

The Web profile now mounts an exact-Fetch controller and a slot-based browser account UI. The UI contributes the login gate to `shell.overlay` and an authenticated avatar, display name, and logout action to `sidebar.footer.action`. The controller writes a separate HttpOnly application-session Cookie and exposes password, first-account, provider-list, third-party Cookie, session, and logout operations. Resource ownership remains an explicit controller policy rather than an implication of the UI session.

## Testing

`packages/identity/multi-user-local/tests/provider.spec.ts` covers password creation and persistence, invalid credentials, injected Cookie exchange with auto-provisioning, session revocation, and the pre-linked external identity policy.

`packages/api/multi-user-controller/tests/routes.host.spec.ts` covers real route composition, first-account creation, application-session Cookie issuance, provider listing, third-party Cookie exchange, session resolution, and fiber disposal.

`packages/client/ui-multi-user/tests/account-footer-action.client.spec.tsx` covers authenticated identity rendering, rail rendering, logout dispatch, and the unauthenticated empty state.
