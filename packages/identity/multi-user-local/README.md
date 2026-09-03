---
description: "Owner-only local account and revocable application-session provider for the multi-user identity seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-multi-user-local

English | [中文](README.zh.md)

## Summary

`dsh-multi-user-local` stores local accounts, scrypt password verifiers, external-subject links, and revocable application sessions in one owner-only JSON document. Session tokens are random opaque values; only their SHA-256 hashes are persisted. A third-party Cookie is passed to the registered authenticator, exchanged for an external subject, and discarded by this provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Security and persistence](#security-and-persistence)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount it after `dsh-multi-user`:

```yaml
- id: multi-user
  name: '@deepseek-ai/dsh-multi-user-local'
  config:
    path: !!js path.join(process.env.DSH_HOME, '.multi-user.json')
```

The provider supports `createPasswordAccount()`, `loginWithPassword()`, `loginWithCookie()`, `linkExternalIdentity()`, `resolveSession()`, `revokeSession()`, `revokeAllSessions()`, and `listSessions()`. Unknown Cookie subjects can be auto-provisioned by default; set `autoProvisionCookieUsers: false` when an administrator must link external identities first.

## Security and persistence

The store is created with mode `0600` and its parent directory with mode `0700` on POSIX hosts. Writes use the repository atomic-write and cross-process lock helpers. Malformed or unsupported documents fail loudly; the provider never silently starts with an empty account database.

## Model Experience

### Account and session records

#### What the model sees

None. `Account` and `AuthSessionView` records are not model-visible.

#### Token effect

None. The provider does not add authentication fields to prompts or tool results.

#### KV Cache effect

None. Authentication records do not change the model-visible request prefix.

## Known Limitations and Deferred Work

- This provider is a local account store, not an OIDC implementation. OIDC or another third-party protocol belongs in a Cookie authenticator plugin.
- Session `lastSeenAt` is updated at creation; high-frequency sliding expiration is intentionally deferred.
- Account ownership must still be enforced by the Gateway and resource controllers; this provider does not know Session or Workspace records.

<a id="dev-note"></a>
### Dev Note

None.
