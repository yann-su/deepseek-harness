---
description: "The identity package group: anonymous, per-harness-home correlation ids shared by telemetry, feedback, and DeepSeek provider requests."
kind: "package-group"
---

# identity/ — shared identity

English | [中文](README.zh.md)

## Summary

The identity group provides one anonymous id per harness home that the installation's telemetry, feedback, and DeepSeek requests attach to their records, so everything leaving one home can be recognized as coming from the same installation without identifying the user. It also defines optional product-account authentication with local password and third-party Cookie providers. There is nothing to configure for the anonymous id: it appears automatically the first time one of those features runs and stays stable until its file is deleted. This page maps the group, and each package README owns its details.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.md) | Gives every harness home one anonymous id that telemetry, feedback, and DeepSeek requests attach to their records, so records from one installation can be recognized without identifying the user |
| [`multi-user`](multi-user/README.md) | Defines product accounts, Principals, revocable sessions, and pluggable password or third-party Cookie authentication |
| [`multi-user-local`](multi-user-local/README.md) | Persists local accounts and hashed application sessions in an owner-only store, and hosts Cookie authenticator registrations |

<a id="related-documentation"></a>
## Related documentation

- [Session telemetry subsystem](../../docs/subsystems/session-telemetry.md) — the telemetry feature that carries the id on exports.
- [Product accounts and authentication](../../docs/subsystems/auth.md) — the multi-user account, Principal, and Cookie-authentication subsystem.
- [dsh-llm-deepseek](../llm/llm-deepseek/README.md) — the DeepSeek provider that carries the id on requests.
- [dsh-command-feedback](../feedback/command-feedback/README.md) — the feedback command that names the anonymous installation in its acknowledgement.

<a id="dev-note"></a>
## Dev Note

None.
