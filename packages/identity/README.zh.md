---
description: "identity 包组：由遥测、反馈与 DeepSeek 提供方请求共享的匿名按 harness home 关联 id。"
kind: "package-group"
---

# identity/ — 共享身份

[English](README.md) | 中文

## 概述

identity 组为每个 harness home 提供一个匿名 id，该安装的遥测、反馈与 DeepSeek 请求会把它附加到各自的记录上，因此离开同一个 home 的所有内容都能被识别为来自同一套安装，而无需识别用户身份。本组也定义可选的产品账户鉴权，支持本地密码和第三方 Cookie Provider。匿名 id 无需配置：它会在这些功能之一首次运行时自动出现，并在文件被删除前保持稳定。本页是组的映射，每个包的 README 负责自身细节。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.zh.md) | 让每个 harness home 拥有一个匿名 id，遥测、反馈与 DeepSeek 请求把它附加到记录上，使来自同一安装的记录无需识别用户即可被辨认 |
| [`multi-user`](multi-user/README.zh.md) | 定义产品账户、Principal、可吊销会话以及可插拔的密码和第三方 Cookie 鉴权 |
| [`multi-user-local`](multi-user-local/README.zh.md) | 将本地账户和哈希后的应用会话持久化到 owner-only 文件，并承载 Cookie 鉴权器注册 |

<a id="related-documentation"></a>
## 相关文档

- [会话遥测子系统](../../docs/subsystems/session-telemetry.zh.md)——在导出中携带该 id 的遥测功能。
- [产品账户与鉴权](../../docs/subsystems/auth.zh.md)——多用户账户、Principal 与 Cookie 鉴权子系统。
- [dsh-llm-deepseek](../llm/llm-deepseek/README.zh.md)——在请求中携带该 id 的 DeepSeek 提供方。
- [dsh-command-feedback](../feedback/command-feedback/README.zh.md)——在确认文本中点名该匿名安装的反馈命令。

<a id="dev-note"></a>
## 开发备注

无。
