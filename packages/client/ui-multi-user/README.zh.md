---
description: "为多用户工作站提供 Web 账户登录、第三方 Cookie 登录、账户显示和退出登录。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-client-ui-multi-user`

[English](README.md) | 中文

## 概述

这个浏览器插件把全屏登录门禁和已登录账户行贡献到布局拥有的 `shell.overlay` 与侧边栏页脚槽位。它检查 Host 账户会话，提供密码登录或创建首个账户，列出已注册的第三方 Cookie 提供方，显示账户头像、名称和用户名，并通过侧边栏退出操作吊销应用会话。Cookie 表单只把原始值发送给选定的 Host 认证器；浏览器收到 HttpOnly 应用会话 Cookie，表单内容不会持久化。

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

把这个浏览器插件与 Web 账户 Controller 以及 layout/sidebar 槽位一起挂载。未认证用户看到登录门禁；已认证用户在设置上方看到账户头像、显示名称、用户名和退出操作。

### 最小配置

```yaml
- id: ui-multi-user
  name: '@deepseek-ai/dsh-client-ui-multi-user'
```

插件没有包级专属配置。Web profile 提供 Host Controller 和本地 Provider。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件拥有一个浏览器端 `AuthController`，并把它的可观察快照投影到两个槽位条目。`shell.overlay` 条目在存在 Principal 前渲染密码和第三方 Cookie 表单。`sidebar.footer.action` 条目在没有已认证 Principal 时保持为空；登录后渲染账户身份并调用 Controller 的退出方法，Controller 吊销 Host 会话并让登录门禁重新显示。所有可见文案都由 `multiUser` locale 命名空间提供。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 注册字典、登录门禁和侧边栏账户条目的浏览器插件 |
| [`src/client/LoginGate.tsx`](src/client/LoginGate.tsx) | 密码和第三方 Cookie 登录表单 |
| [`src/client/AccountFooterAction.tsx`](src/client/AccountFooterAction.tsx) | 头像、账户身份和退出操作 |
| [`tests/account-footer-action.client.spec.tsx`](tests/account-footer-action.client.spec.tsx) | 账户行渲染和退出行为覆盖 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [多用户身份 Provider](../../identity/multi-user/README.zh.md)——本插件显示的账户与 Principal 数据。
- [多用户 HTTP Controller](../../api/multi-user-controller/README.zh.md)——浏览器路由与应用会话所有者。
- [侧边栏 slot 约定](../ui-sidebar/README.zh.md)——在设置旁渲染的页脚操作槽位。

-----

<a id="model-experience"></a>
## 模型体验

### 账户界面

#### 模型看到什么

`shell.overlay` 登录门禁和 `sidebar.footer.action` 账户行只属于浏览器展示层，不会把账户字段、登录文案或退出结果加入模型上下文。

#### Token 影响

模型请求新增 Token 为零。账户状态只保留在浏览器和 Host 会话路由中。

#### KV Cache 影响

插件不改变模型请求前缀或提供方缓存输入。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明浏览器账户 UI 本身不会授权哪些内容。

- **资源归属是独立职责。** 部署仍需 Host 授权消费者，让会话、工作区、文件和工具按解析出的账户 Principal 过滤。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
