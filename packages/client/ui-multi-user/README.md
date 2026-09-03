---
description: "Web account login, third-party Cookie sign-in, account display, and logout for a multi-user workstation."
kind: "package-reference"
---

# `@deepseek-ai/dsh-client-ui-multi-user`

English | [中文](README.zh.md)

## Summary

This browser plugin contributes a full-page login gate and an authenticated account row to the layout-owned `shell.overlay` and sidebar footer slots. It checks the Host account session, offers password sign-in or first-account creation, lists registered third-party Cookie providers, shows the account avatar and display name, and revokes the application session from the sidebar logout action. The Cookie form sends the raw value only to the selected Host authenticator; the browser receives an HttpOnly application-session cookie and the form is not persisted.

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

Mount this browser plugin with the Web account controller and the layout/sidebar slots. Unauthenticated users see the login gate; authenticated users see the account avatar, display name, username, and logout action above Settings.

### Minimal configuration

```yaml
- id: ui-multi-user
  name: '@deepseek-ai/dsh-client-ui-multi-user'
```

The plugin has no package-specific configuration. The Web profile supplies the Host controller and local provider.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin owns one browser `AuthController` and projects its observable snapshot into two slot entries. The `shell.overlay` entry renders password and third-party Cookie forms until a Principal exists. The `sidebar.footer.action` entry stays empty without an authenticated Principal; after login it renders the account identity and calls the controller's logout method, which revokes the Host session and returns the gate to the login state. All visible copy is provided by the `multiUser` locale namespace.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin registration for dictionaries, login gate, and sidebar account entry |
| [`src/client/LoginGate.tsx`](src/client/LoginGate.tsx) | Password and third-party Cookie login form |
| [`src/client/AccountFooterAction.tsx`](src/client/AccountFooterAction.tsx) | Avatar, account identity, and logout action |
| [`tests/account-footer-action.client.spec.tsx`](tests/account-footer-action.client.spec.tsx) | Account-row rendering and logout behavior coverage |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Multi-user identity provider](../../identity/multi-user/README.md) — account and Principal data shown by this plugin.
- [Multi-user HTTP controller](../../api/multi-user-controller/README.md) — browser route and application-session owner.
- [Sidebar slot contract](../ui-sidebar/README.md) — footer action slot rendered beside Settings.

-----

<a id="model-experience"></a>
## Model Experience

### Account UI

#### What the model sees

The `shell.overlay` login gate and `sidebar.footer.action` account row are browser-only presentation. They do not add account fields, login copy, or logout results to model context.

#### Token effect

Zero model-request tokens. Account state remains in the browser and Host session route.

#### KV Cache effect

The plugin does not alter model request prefixes or provider cache inputs.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the browser account UI does not authorize by itself.

- **Resource ownership is separate.** Deployments still need a Host authorization consumer so sessions, workspaces, files, and tools are filtered by the resolved account Principal.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
