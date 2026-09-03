---
description: "Web account login, third-party Cookie exchange, session discovery, and logout routes for a multi-user workstation."
kind: "package-reference"
---

# `@deepseek-ai/dsh-api-multi-user-controller`

English | [中文](README.zh.md)

## Summary

This Host plugin gives a Web client account registration, password login, third-party Cookie exchange, session discovery, and logout. It keeps the application session in an HttpOnly `dsh-account-session` cookie and passes a raw third-party Cookie to one selected authenticator without persisting it. Mount it with the [`multi-user`](../../identity/multi-user/README.md) provider when a workstation needs a browser-facing account session.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this controller with a `multi-user` provider and a Web server. The controller registers the exact `/api/auth/*` Fetch routes consumed by the browser account plugin.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-multi-user-local'
- name: '@deepseek-ai/dsh-api-multi-user-controller'
```

The controller has no package-specific configuration. Provider settings belong to the selected `multi-user` implementation.

### Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/session` | Return the current principal and first-run account state. |
| GET | `/api/auth/providers` | List registered Cookie authenticators. |
| POST | `/api/auth/register` | Create and sign in a password account. |
| POST | `/api/auth/password` | Sign in with a local password. |
| POST | `/api/auth/cookie` | Exchange an injected third-party Cookie. |
| POST | `/api/auth/logout` | Revoke the current application session. |

Cookie authenticators are registered by separate provider plugins through `ctx.multiUser.registerCookieAuthenticator()`. This package does not know or retain their provider credentials.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The controller resolves the application-session cookie once per request, delegates account operations to `ctx.multiUser`, and translates the result into JSON plus a Set-Cookie header. Login responses mint a separate HttpOnly application cookie; logout revokes the resolved session and expires that cookie. Invalid JSON, oversized Cookie headers, unknown providers, and provider failures are rejected before a successful response is returned.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Route registration, request validation, account-session Cookie handling, and JSON responses |
| [`tests/routes.host.spec.ts`](tests/routes.host.spec.ts) | Route composition and lifecycle coverage |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Multi-user identity provider](../../identity/multi-user/README.md) — account, Principal, session, and Cookie-authenticator contracts.
- [Local multi-user provider](../../identity/multi-user-local/README.md) — owner-only account and session persistence.
- [Browser multi-user UI](../../client/ui-multi-user/README.md) — login gate and sidebar account action.

-----

<a id="model-experience"></a>
## Model Experience

### Account routes

#### What the model sees

The controller serves browser account routes such as `/api/auth/session` and does not add account fields, login forms, or route responses to model requests.

#### Token effect

Zero model-request tokens. Account route payloads stay on the browser and Host transport.

#### KV Cache effect

The controller does not change model request prefixes or provider cache inputs.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what this route consumer does not authorize by itself.

- **Resource ownership is separate.** Existing Remote business endpoints still need an authorization consumer that resolves the account Principal and checks ownership for every resource and stream operation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
