---
description: "为多用户工作站提供 Web 账户登录、第三方 Cookie 交换、会话查询和退出路由。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-api-multi-user-controller`

[English](README.md) | 中文

## 概述

这个 Host 插件为 Web 客户端提供账户注册、密码登录、第三方 Cookie 交换、会话查询和退出登录。它把应用会话放进 HttpOnly 的 `dsh-account-session` Cookie，并将原始第三方 Cookie 传给一个选定的认证器而不持久化。工作站需要浏览器账户会话时，把它和 [`multi-user`](../../identity/multi-user/README.zh.md) provider 一起挂载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把这个 Controller 与 `multi-user` provider 和 Web server 一起挂载。Controller 注册浏览器账户插件使用的精确 `/api/auth/*` Fetch 路由。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-multi-user-local'
- name: '@deepseek-ai/dsh-api-multi-user-controller'
```

Controller 没有包级专属配置。Provider 配置属于选定的 `multi-user` 实现。

### 路由

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/auth/session` | 返回当前主体以及是否处于首次设置状态。 |
| GET | `/api/auth/providers` | 列出已注册的 Cookie 认证器。 |
| POST | `/api/auth/register` | 创建并登录密码账户。 |
| POST | `/api/auth/password` | 使用本地密码登录。 |
| POST | `/api/auth/cookie` | 交换注入的第三方 Cookie。 |
| POST | `/api/auth/logout` | 撤销当前应用会话。 |

Cookie 认证器由独立的提供方插件通过 `ctx.multiUser.registerCookieAuthenticator()` 注册。本包不理解也不保存它们的提供方凭据。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Controller 在每个请求中解析一次应用会话 Cookie，把账户操作委托给 `ctx.multiUser`，再转换成 JSON 和 Set-Cookie 响应。登录响应发放独立的 HttpOnly 应用 Cookie；退出登录会撤销解析出的会话并让该 Cookie 失效。无效 JSON、超大的 Cookie header、未知提供方和提供方错误都会在成功响应前被拒绝。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 路由注册、请求校验、账户会话 Cookie 处理和 JSON 响应 |
| [`tests/routes.host.spec.ts`](tests/routes.host.spec.ts) | 路由组合与生命周期覆盖 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [多用户身份 Provider](../../identity/multi-user/README.zh.md)——账户、Principal、会话和 Cookie 认证器约定。
- [本地多用户 Provider](../../identity/multi-user-local/README.zh.md)——owner-only 账户与会话持久化。
- [浏览器多用户 UI](../../client/ui-multi-user/README.zh.md)——登录门禁和侧边栏账户操作。

-----

<a id="model-experience"></a>
## 模型体验

### 账户路由

#### 模型看到什么

Controller 只提供浏览器账户路由（例如 `/api/auth/session`），不会把账户字段、登录表单或路由响应加入模型请求。

#### Token 影响

模型请求新增 Token 为零。账户路由 payload 只停留在浏览器和 Host transport。

#### KV Cache 影响

Controller 不改变模型请求前缀或提供方缓存输入。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明该路由消费者本身不会授权哪些内容。

- **资源归属是独立职责。** 现有 Remote 业务接口仍需要授权消费者解析账户 Principal，并在每个资源和流操作上检查所有权。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
