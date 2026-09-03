# Agent Note：产品账户认证 seam 同时支持密码和注入 Cookie

Status: implemented

[English](2026-09-02-multi-user-auth-seam.md) | 中文

## 问题

浏览器连接已经能把进程启动令牌交换成签名 Cookie，但 Harness 没有产品账户、请求级 Principal、可吊销的应用会话，也没有第三方登录扩展点。匿名安装 id 与 `ctx.authorization` 各自有不同用途，不能升级成账户身份。

## 决定

增加 `dsh-multi-user` 账户/认证 Service Definition，以及 `dsh-multi-user-local` owner-only JSON Provider。Provider 使用 scrypt 校验值创建密码账户，发放随机不透明应用 token 但只保存其 SHA-256 hash，把 token 解析为 Principal，并支持吊销单个会话或账户的全部会话。第三方插件按 id 注册 Cookie 鉴权器；回调只在一次交换期间接收原始 Cookie，并返回稳定的外部 subject。Provider 永不持久化原始 Cookie。

工作站默认会为未知外部 subject 自动创建本地账户；要求管理员预先关联时设置 `autoProvisionCookieUsers: false`。HTTP 和 Gateway 集成仍由明确的 Consumer 负责：它必须在每个请求中解析应用 Cookie，并在所有资源和流操作前执行归属检查。

## 备选方案

**复用匿名安装 id。** 否决：它有意标识 harness home 而不是产品账户，并会发送给遥测和提供方请求。

**把第三方 Cookie 值放进 credentials 记录。** 否决：Cookie 是 Provider 交换的输入，可能具有不同吊销和作用域；持久化它会把短暂的浏览器凭据变成长期机密。

**让现有浏览器启动令牌充当账户会话。** 否决：它只在进程内一次性有效，而账户会话需要登出、过期和按设备吊销。

## 影响

该 seam 支持密码和第三方登录，同时不把本地存储耦合到任何外部协议。现有匿名遥测身份和提供方凭据授权保持不变。Provider 不隔离插件代码或子进程，也不为 Session 或 Workspace 记录附加归属；后续仍需 Connection/Gateway/Controller 和 execution-world 集成。

Web profile 现在挂载了 exact-Fetch Controller 和基于 slot 的浏览器账户界面。UI 把登录门禁贡献到 `shell.overlay`，把已登录账户头像、名称和退出操作贡献到 `sidebar.footer.action`。Controller 写入独立的 HttpOnly 应用会话 Cookie，并提供密码、首个账户、Provider 列表、第三方 Cookie、会话和登出操作。资源归属仍必须由 Controller 显式执行，不能由 UI 会话自动推导。

## 测试

`packages/identity/multi-user-local/tests/provider.spec.ts` 覆盖密码账户创建与持久化、无效凭据、带自动创建的注入 Cookie 交换、会话吊销以及要求预关联外部身份的策略。

`packages/api/multi-user-controller/tests/routes.host.spec.ts` 覆盖真实路由组合、首个账户创建、应用会话 Cookie 发放、Provider 列表、第三方 Cookie 交换、会话解析和 fiber 释放。

`packages/client/ui-multi-user/tests/account-footer-action.client.spec.tsx` 覆盖已认证身份渲染、收起侧栏渲染、退出分发和未认证空状态。
