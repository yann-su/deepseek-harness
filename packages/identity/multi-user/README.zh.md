---
description: "面向本地密码登录与第三方 Cookie 交换的账户身份和认证 seam。"
kind: "package-reference"
---

# @deepseek-ai/dsh-multi-user

[English](README.md) | 中文

## 概述

`dsh-multi-user` 定义产品账户身份 seam。它不同于匿名安装 id，也不同于负责获取模型提供方凭据的 `ctx.authorization`。Provider 负责本地账户存储和可吊销的应用会话；第三方插件注册 Cookie 鉴权器，把原始 HTTP Cookie 交换为稳定的外部 subject。原始 Cookie 只在这次交换期间存在，本 seam 永不持久化它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

挂载一个 Provider，再由第三方插件注册登录方式：

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

Provider 提供密码账户创建、密码登录、Cookie 登录、已验证外部身份关联、会话解析、会话吊销和非机密会话列表。Gateway 或 HTTP 插件应在每个请求中把应用 Cookie 解析为 `Principal`，并在所有 Session、Workspace、Job、Attachment 和流操作前执行归属检查。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/types.ts` 维护带 brand 的账户、用户、会话、Principal 和鉴权器词汇。
- `src/index.ts` 维护 Provider seam 以及带 disposer 的 Cookie 鉴权器注册表。
- `registerCookieAuthenticator()` 只在回调中接收原始 Cookie；Provider 不记录、不缓存、也不写入它。

<a id="model-experience"></a>
## 模型体验

### 认证状态

#### 模型看到什么

无。认证元数据和 Cookie 交换属于传输与配置，不会进入模型请求。

#### Token 影响

无。账户和会话标识不会添加到提示词文本或工具结果。

#### KV Cache 影响

无。认证状态不会改变模型可见的请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 本包不挂载 HTTP 路由，也不修改 Gateway。Connection/controller 插件必须把 `resolveSession()` 绑定到请求作用域，并执行资源归属授权。
- 本 seam 不隔离插件代码或操作系统命令执行。不可信任务应使用沙箱或 execution-world Provider。
- Cookie 鉴权器必须由自身的第三方 Provider 校验 Cookie 并返回稳定 subject；本包不会猜测第三方协议。

<a id="dev-note"></a>
### 开发备注

无。
