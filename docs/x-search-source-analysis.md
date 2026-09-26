# X 搜索空 404：源码与实测分析（2026-09-17）

## 结论与完成边界

本次找到并修复了独立 transaction 实现的 **CSS RGB 上界截断缺失**。它使一组历史失败素材生成了与官网不同的动态 ID。但它不是所有空 404 的统一解释：最新真实浏览器失败请求中的 ID，已经与同页面原始素材在 Node 中生成的 ID 完全一致。

本次独立搜索“马斯克”成功返回 20 条数据；之后同账号浏览器刷新同一搜索返回空 404；关闭 Roxy 后的 astronomy 独立验收也空 404。**搜索仍不稳定，未完成连续分页验收；不能把一次成功归因于补丁，也不能把所有失败归因于账号封禁、CDP、IP 或指纹。**

## 源码证据：谁构造 ID，谁返回 404

保留的代码位于 `artifacts/x/source-analysis/`，每个模块有 SHA-256、原始加密 evidenceId，见 `module-index.json`。

| 层 | 源码定位 | 观察 |
| --- | --- | --- |
| 搜索 query 定义 | `module-447423.js` | `SearchTimeline` 的 queryId 仍为 `KPSo2_UWdOMpPJwjhfT1Qg` |
| 请求 ID 中间件 | `module-991160.js:23`、`:37` | 加载 chunk 59924 / module 208932；传入去掉 query 的 path 与 method；异常则返回 `btoa(e:异常)` |
| 真实动态 ID | `transaction.decoded.js:178`、`:382`、`:406` | 读取 verification key、SVG 动画、当前秒数；SHA-256 后截前 16 字节，再 XOR 与 Base64 |
| 会话绑定中间件 | `module-995604.js:163`、`:211` | feature flag 与指定 operation 双重门控，当前名单没有 SearchTimeline |
| HTTP 错误转换 | `module-147770.js:31`、`:53` | 消费已有 HTTP 状态与正文，把空正文转为通用错误；不会在这里制造网络层空 404 |

主脚本 URL：`https://abs.twimg.com/responsive-web/client-web/main.64394040da9f9879a.js`，原始证据 `c082826b-bdb0-4721-b765-c0058390e5a2`。页面中加载的模块也逐一读取保存，未执行模块中的业务操作。

当前 ondemand URL：`https://abs.twimg.com/responsive-web/client-web/ondemand.s.62eaf35b242cc757a.js`，SHA-256 `1b0ac38199e80c9d4a3042a0cc767e4d5077007204ce87da2e678aa5d716163e`，证据 `ee890277-8b96-4ef6-8ee6-726d413b6115`。

AST 工具只对已审核哈希的字符串表、RC4 解码器和旋转初始化做受限求值，将 267 处字符串调用还原。输出保留混淆包装和死分支，不伪称完整反编译。Node VM 不作为安全沙箱；未经审核版本直接拒绝，生产进程不导入此工具。

## 已确认的计算错误

官网通过 Web Animations 设置颜色与旋转，再读取 `getComputedStyle`。贝塞尔曲线的纵坐标允许负数或大于 1，因此中间的 RGB 数值可以越界。Chrome 对 RGB 做 `[0,255]` 截断。

历史失败 run `a7c1f6d7-0b8e-45a5-b223-0ec5e3c5782d` 的行数据：

```text
frame = [177,156,248,105,76,36,195,48,92,120,177]
动画时刻 = 290ms / 4096ms
官网颜色 = rgb(181,161,255)  → b5a1ff
修复前 Node 颜色 = (181,161,261) → b5a1105
```

字符串不同会改变 SHA-256，最终 ID 也不同。`packages/platform-x/src/transaction.ts:98` 已增加上界 255；回归测试用不含真实 verification key 的合成素材复现上述颜色与最终 ID。

最初拿上游 npm 算法做对照，14/14 相同，却没有发现该问题。改成执行**官网原始代码**与真实 Chrome CSS 引擎后，修复前只有 13/14 相同，修复后 14/14 相同。这说明上游算法只能作为参考，不能作为最终正确性标准。

保存：`official-parity-before.json`、`official-parity.json`。后一个报告会包含后续新增素材；计数与浏览器版本以报告字段为准。实验在独立无账号 Chrome 152 上运行，仅注入 public meta/SVG/官网脚本，阻断页面 HTTP 请求；不向 X 发 API，不用于生产签名。逐字节对照的输入固定为相同 key、SVG、path、method、time、mask，原始 ID 和 hash 输入仅保存到加密证据。

该历史 404 与错误 ID 同时出现，说明实现缺陷真实存在；没有同一服务端条件下的修复前后 A/B，不能宣称该次 404 仅由它导致。

## WebRTC 与会话签名：存在不等于参与搜索校验

官网确实调用 `RTCPeerConnection/createOffer`，并从 offer 中取得少量数据 D。但当前实际数据流是：

```text
(Array.from(SHA256(hashInput)).concat(D)).slice(0,16)
```

SHA-256 本来有 32 字节，D 拼接在它后面，因此最终前 16 字节不包含 D。源码数据流证明当前版本的 D 不影响 ID；“脚本出现 WebRTC”不能作为“必须模拟 WebRTC 才能搜索”的证据。两次离线生成也一致，但没有等待 offer 完成的穷尽时序测试，主要结论依据静态数据流。

另一条 `x-twitter-session-signature/timestamp/tokenhash` 链使用 ECDSA P-256，会话绑定模块确实存在。但当前门控名单为 CreateTweet、CreateNoteTweet、UserAccountLabel、FavoriteTweet、UnfavoriteTweet、CreateRetweet、DeleteRetweet、CreateBookmark、DeleteBookmark，**不含 SearchTimeline**。本次没有注册新绑定、读取密钥或调用任何写操作。不能把这条旁支误接进搜索执行器。

## 当前真实失败样本的逐字节验证

浏览器原始页面 HTML 缓存因禁用缓存无法读取，两次失败都记录了 Protocol error，证据：`1ffdb4ca-076f-4c32-ab0e-cfff3230e948`（Page 未启用）、`a9cd50c8-6876-4a15-82af-3ab85e383fad`（内容未缓存）。随后改为**在刷新前捕获文档响应**，成功保存同次加载的 meta/SVG 与实际 HTTP 请求。

- 真实浏览器请求证据：`f8c4e950-239c-403a-a663-d7c7bae0ee64`，HTTP 404，0 字节。
- 浏览器 ID 内 key 与当前文档 verification key 一致。
- 以该请求中的实际时间、mask、method/path 在 Node 重算，ID 逐字节一致。
- 对照证据：`90184e54-37e3-47ad-9924-b78b5017b481`；报告：`live-parity-f8c4e950-239c-403a-a663-d7c7bae0ee64.json`。

这排除了**该样本**的独立算法差异和浏览器用错页面 key；不证明服务端必然接受这个页面 key，也不证明所有指纹一致。

## 同账号成功与失败的请求对照

| 北京时间 | 模式 | 查询 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 10:34:22 | Node 独立请求 | 马斯克 / Top | HTTP 200，20 条，业务结构通过 | run `5040d474-6f42-43b9-874c-fae943f6158a` |
| 10:34:58 | 浏览器刷新 | 马斯克 / Top | HTTP 404，0 字节 | `ef1ea0c2-aa28-4ec2-864f-3bebc251b4c7` |
| 10:39:27 | 浏览器与页面素材成对捕获 | 马斯克 / Top | HTTP 404，ID 与 Node 一致 | `f8c4e950-239c-403a-a663-d7c7bae0ee64` |
| 10:40:59 | Roxy 窗口关闭后独立请求 | astronomy / Top | 第一页 HTTP 404，未重试 | run `d11b5f4b-914b-4649-a7df-1600967e300e` |

第一、二行的 queryId、variables、features、fieldToggles **完全相同**。auth_token 与 Authorization 指纹相同，CSRF 均匹配，时间差正常。不同项仍包括 Cookie 完整集合、动态 ID/页面 key、Referer、浏览器自动网络头及实际传输栈，因此不是严格单变量实验。

成功/失败共享同一公开额度窗口：50 中剩余 49 → 48 → 47，说明没有耗尽该响应头暴露的额度；不能排除其他速率、账号、线路或策略限制。

成功的 `x-response-time=944`，两次浏览器失败为 9、11；均出现平台交易 ID 和 `cloudflare envoy` 标识。这符合较早被拒绝的现象，但这些响应头不能确定是边缘、网关还是业务后端做了拒绝，更无法从前端脚本定位服务端的具体代码行。

无浏览器验收报告：`artifacts/x/browserless-a429651e-a97d-412e-a540-ea585d1feef4.json`。请求前后窗口关闭均确认，结束恢复。报告保留当时旧分类 `SCHEMA_CHANGED`；从 `x-native-0.2.1` 起，空 404 明确归为 `RESEARCH_REQUIRED`，原始历史记录不改写。

## 排查链与下一次实验

1. `audit-search.ts` 汇总成功/失败的会话指纹、时间、额度、参数哈希、状态、响应耗时和交易 ID；cursor 仅输出哈希。原始 Cookie、Token、请求/响应正文仍在加密证据库。
2. `capture-source-modules.ts` 只读取选定 public webpack factory，保存原文、哈希、模块号。
3. `deobfuscate-transaction.ts` 对已审核版本做可重复 AST 字符串还原。
4. `compare-official-transaction.ts` 对历史素材进行官网原代码与 Node 的离线对照。
5. `inspect-live-transaction.ts <dirid> --reload` 先监听文档和搜索响应，再一次刷新，对真实浏览器 ID 做逐字节核验；不自动循环刷新。
6. 失败后 `tools/diagnose.ts <requestId>` 固化阶段、异常栈、状态、样本、结论和下一步。

后续优先：在已确认稳定成功的同一查询与线路上，分别固定其他条件对 Cookie/Referer 做单变量比较；若浏览器自身继续间歇失败，应先获取自然成功/失败的成对样本，保留服务端交易 ID，而不是反复换 key 或换账号重试。另需把真实浏览器成功样本纳入同页面动画对照，检验 Roxy 与普通 Chrome 的差异。当前源码不足以证明服务端拒绝规则，不用猜测代替结论。

## 本轮验证结果

`pnpm check` 通过；全仓 19 个测试文件、92 项测试通过，包含 RGB 越界回归、空 404 分类及生产依赖不含浏览器的检查。官网原代码离线对照最终 16/16 通过。上述离线结果不替代平台稳定性验收，真实请求的成功与失败分别列于前表。
