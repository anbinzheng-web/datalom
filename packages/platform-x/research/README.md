# X 协议与排障经验

历史样本基线为 2026-09。实现见 `../src/transaction.ts`、`../src/native.ts` 及 `../src/api/`；源码对照工具位于 `src/`。这些结论不代表当前搜索稳定可用。

- transaction ID 来自页面 verification key、SVG 动画、method/path、时间与随机 mask；HTTP query 不属于该 path。素材由同一账号线路获取，不复用浏览器生成的旧 ID。
- CSS 贝塞尔插值可能越界。Chrome 会将 RGB 截断到 `[0,255]`；曾出现 Node 算出蓝色 261、Chrome 为 255，改变摘要与最终 ID。仅对照上游 npm 算法漏掉了同源错误，必须与官网代码和实际 CSS 引擎对照。
- 对照固定 key、SVG、path、method、time、mask，逐字节比较。已确认某个空 404 浏览器样本的 ID 与 Node 完全一致，因此算法修复不能解释所有 404。
- 所研究版本将 WebRTC 数据拼到 32 字节 SHA-256 后再截前 16 字节，故该分支不影响 ID。源码存在某个能力不等于它参与当前请求。
- 会话 ECDSA 签名模块在所研究版本受 operation 门控，未包含 SearchTimeline；不能把写操作旁支接入搜索执行器。
- 空 404 不足以证明封号、CDP 检测或 IP 问题。记录服务端交易 ID、会话指纹、参数哈希及响应时延，再做单变量对照；相同公开配额不排除其他服务端策略。
- Conversation 的模块游标绑定原模块与证据；不能把一条分支分页当作整页下一页。保留 tombstone、不可见及截断语义。

曾有独立搜索成功，随后浏览器与关闭 Profile 后的独立请求均出现空 404；连续分页和稳定性未由这些实验确认。失败不能靠循环换账号、key 或重试掩盖。

工具链：`audit-search.ts` 比较样本，`capture-source-modules.ts` 保存来源和 hash，`deobfuscate-transaction.ts` 做受限 AST 还原，`compare-official-transaction.ts` 离线对照，`inspect-live-transaction.ts` 成对捕获文档与请求。只对审核过的源码版本求值；Node VM 不是安全沙箱。报告使用 artifactPath，原始请求与素材进入加密证据。

## 来源与许可证

- [Lqm1/x-client-transaction-id](https://github.com/Lqm1/x-client-transaction-id)，npm `0.3.1`，MIT Copyright (c) 2025 Lami。`packages/platform-x/src/transaction.ts` 改写其独立动画插值与 transaction ID 算法；许可证保留于 `packages/platform-x/src/vendor/LICENSE-x-client-transaction-id`。没有引用其默认直连下载器或访客授权工具。
- `linkedom` 0.18.12：仅离线解析页面 HTML/SVG，下载脚本不执行。
- X 的运行时主脚本/ondemand 素材来自同账号代理线路，原文与 hash 存于加密诊断证据。独立请求结果与当前阻塞见上文。
