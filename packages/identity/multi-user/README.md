---
description: "Account identity and authentication seam for local password login and third-party Cookie exchanges."
kind: "package-reference"
---

# @deepseek-ai/dsh-multi-user

English | [中文](README.zh.md)

## Summary

`dsh-multi-user` defines the product-account identity seam. It is distinct from the anonymous installation id and from `ctx.authorization`, which obtains model-provider credentials. A provider implements local account storage and revocable application sessions; third-party plugins register a Cookie authenticator that exchanges a raw HTTP Cookie for a stable external subject. The raw Cookie is scoped to that exchange and is never persisted by this seam.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount a provider and let a third-party plugin add its login method:

```ts
import { cookieAuthenticatorId } from '@deepseek-ai/dsh-multi-user'
import type { Context } from '@deepseek-ai/cordis'
import type { ExternalIdentity } from '@deepseek-ai/dsh-multi-user'

declare const ctx: Context
declare function exchangeCookie(cookie: string, signal?: AbortSignal): Promise<ExternalIdentity | undefined>

const dispose = ctx.multiUser.registerCookieAuthenticator({
  id: cookieAuthenticatorId('example-sso'),
  label: 'Example SSO',
  authenticate: async (cookie, signal) => exchangeCookie(cookie, signal),
})
```

The provider exposes password account creation, password login, Cookie login, verified external-identity linking, session resolution, session revocation, and non-secret session listing. A Gateway or HTTP plugin should resolve the application Cookie to a `Principal` once per request and make ownership checks before every Session, Workspace, Job, Attachment, and stream operation.

## Understand the implementation

- `src/types.ts` owns branded account, user, session, Principal, and authenticator vocabulary.
- `src/index.ts` owns the provider seam and the disposer-backed Cookie authenticator registry.
- `registerCookieAuthenticator()` accepts the raw Cookie only in the callback; the provider does not log, cache, or write it.

## Model Experience

### Authentication state

#### What the model sees

None. Authentication metadata from `ctx.multiUser` and Cookie exchanges are transport and configuration concerns; they do not enter model requests.

#### Token effect

None. Account and session identifiers are not added to prompt text or tool results.

#### KV Cache effect

None. Authentication state does not change the model-visible request prefix.

## Known Limitations and Deferred Work

- This package does not mount an HTTP route or modify the Gateway. A connection/controller plugin must bind `resolveSession()` to the request scope and enforce resource ownership.
- The seam does not isolate plugin code or OS command execution. Use the sandbox or an execution-world provider for untrusted work.
- Cookie authenticators must validate the Cookie with their own provider and return a stable subject; this package does not guess a third-party protocol.

<a id="dev-note"></a>
### Dev Note

None.
