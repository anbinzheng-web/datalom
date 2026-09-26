# 豆包纯 Node 执行器

2026-09-17：**运行时脱离浏览器已验证；从零建立可聊天的游客身份尚未完成。**

签名在 Node `vm` 中执行固定版本官方 BDMS JavaScript，`linkedom` 提供纯 JS DOM 兼容对象，HTTP 使用 Node 内置 `fetch`。没有 Chromium、CDP、Playwright、RoxyBrowser、impit、外部签名进程或签名服务参与此路径。现有 SQLite/系统凭据库仍负责加密保存本地状态。

## 当前本机直接运行

已准备并实测的会话名为 `guest-node`：

```sh
pnpm doubao:node status guest-node
pnpm doubao:node chat guest-node --new "你好"
pnpm doubao:node chat guest-node "继续刚才的话题"
```

默认继续该会话上一次成功的聊天，`--new` 创建新聊天但沿用同一游客身份。每次生成新的消息 ID、时间戳、唯一键和 `a_bogus`。响应必须包含非空回答和最终 `SSE_REPLY_END(end_type=3)` 才算成功；HTTP 200 不等于成功。

## 准备会话与 SDK

```sh
pnpm doubao:node import-session my-guest <已有成功游客请求的证据ID>
pnpm doubao:node sign-check my-guest
```

导入只读取加密证据，不连接浏览器；拒绝账号 Cookie。历史 Cookie 请求头没有完整过期属性，导入不能恢复其原始属性；未来失效必须作为失效处理，不能宣称长期可用。

初次签名会通过 HTTP 下载官方 BDMS，校验固定 SHA-256 后加密缓存到当前数据目录。后续复用缓存；哈希变化立即拒绝执行。`sign-check` 不发送聊天，检查 Node 环境下新签名产生且请求参数未被意外改写；缓存缺失时可能下载 SDK。源码入口为 `packages/platform-doubao/src/signer.ts`，官方源码来源见 `docs/third-party.md`。

## Token 刷新

```sh
pnpm doubao:node refresh-token guest-node
pnpm doubao:node chat guest-node --candidate-token "继续刚才的话题"
```

刷新沿用活动 Token 初始化 `xmst`，只产生一次 SDK Token 请求。新 Token 先存为候选；`--candidate-token` 发送一次真实消息验证它，只有聊天成功才提升为活动 Token。失败保留原值，无自动重试、无身份轮换。该流程已有真实成功记录，但长期有效期、长时间离线后的恢复尚未完成验证。

## 全新游客初始化（研究状态）

```sh
pnpm doubao:node init fresh-guest
pnpm doubao:node chat fresh-guest --candidate-token --new "你好"
```

`init` 用 Node 请求页面、解析页面 JSON、申请 Tea/游客标识、生成并保存 `fp`、请求候选 Token。它**不代表聊天已通过**。初步实测的全新身份仍返回 `SharkBlock / 710022002`。保存部分初始化状态，同名会话重用已有身份；没有自动重建身份、切换 IP 或无限重试。当前成功路径仍依赖一次历史游客身份导入。

本次冷启动失败的同一身份已保存为 `fresh-node`，可以用 `pnpm doubao:node status fresh-node` 查看状态；后续诊断应继续使用它。

## 证据与验证

每次聊天的普通报告在 `artifacts/doubao-node/<session-id>-last-run.json`，只包含状态、长度、哈希、来源与证据 ID。Cookie、Token、完整请求、回答正文均保留于加密诊断事件；CLI stdout 按用户请求输出本次回答。读取已有证据可使用 `pnpm diagnose raw <evidenceId>`。

专属测试覆盖新建/续聊请求、消息唯一性、SSE 任意字节切分、中文 UTF-8、结束后主动取消流、失败部分正文、Token 候选验证、会话租约和加密保存。生产依赖图测试包含此 CLI。离线测试不替代真实接口结果；真实成功与失败证据见 `docs/doubao-research.md`。

当前仅实现游客文本对话 CLI。通用 Worker/API/UI 接入、登录账号、多模态、长时间稳定性和全新身份冷启动均不能标为已完成。
