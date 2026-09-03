---
description: "多用户身份 seam 的 owner-only 本地账户和可吊销应用会话 Provider。"
kind: "package-reference"
---

# @deepseek-ai/dsh-multi-user-local

[English](README.md) | 中文

## 概述

`dsh-multi-user-local` 将本地账户、scrypt 密码校验值、外部 subject 关联以及可吊销的应用会话存入一个 owner-only JSON 文档。会话 token 是随机不透明值，磁盘上只保存其 SHA-256 hash。第三方 Cookie 会交给已注册的鉴权器交换外部 subject，随后由本 Provider 丢弃。

## 目录

- [使用本包](#use-this-package)
- [安全与持久化](#security-and-persistence)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在 `dsh-multi-user` 之后挂载：

```yaml
- id: multi-user
  name: '@deepseek-ai/dsh-multi-user-local'
  config:
    path: !!js path.join(process.env.DSH_HOME, '.multi-user.json')
```

Provider 支持 `createPasswordAccount()`、`loginWithPassword()`、`loginWithCookie()`、`linkExternalIdentity()`、`resolveSession()`、`revokeSession()`、`revokeAllSessions()` 和 `listSessions()`。默认会为未知 Cookie subject 自动创建本地账户；需要管理员预先关联外部身份时设置 `autoProvisionCookieUsers: false`。

<a id="security-and-persistence"></a>
## 安全与持久化

POSIX 主机上，存储文件创建为 `0600`，父目录创建为 `0700`。写入使用仓库的原子写和跨进程锁辅助函数。文档损坏或版本不受支持时会明确失败，Provider 不会静默启动成空账户库。

<a id="model-experience"></a>
## 模型体验

### 账户与会话记录

#### 模型看到什么

无。账户和会话记录不会进入模型可见内容。

#### Token 影响

无。Provider 不会向提示词或工具结果添加认证字段。

#### KV Cache 影响

无。认证记录不会改变模型可见的请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 本 Provider 是本地账户存储，不实现 OIDC。OIDC 或其他第三方协议应放进 Cookie 鉴权器插件。
- 会话 `lastSeenAt` 只在创建时更新；高频滑动过期暂不实现。
- 账户归属仍需由 Gateway 和资源 Controller 强制执行；本 Provider 不知道 Session 或 Workspace 记录。

<a id="dev-note"></a>
### 开发备注

无。
