# 豆包对话接口研究 · 2026-09-16

**最新状态（2026-09-17）：纯 Node 动态签名和 HTTP 聊天已打通，已有游客身份下可新建对话、跨进程续聊、延续刷新 Token。初始游客身份来自历史成功证据；全新游客冷启动仍未打通，未接入生产 Worker/API。使用方式见 [doubao-node.md](doubao-node.md)。下文早期记录保留其当时结论。**

## 实际实验

- 使用 Playwright 启动独立 Chrome，未使用 RoxyBrowser，没有登录账号。已有研究访客状态加密保存并复用，没有轮换访客身份或 IP。
- 浏览器设置 `--no-proxy-server`，HTTP/3 关闭；Node 探针明确不配置代理并清除其进程内代理环境变量。没有改动用户的系统代理配置。本机默认路由为物理网卡 `en0`；未做运营商出口地理归属鉴定。
- 页面免登录可打开，并自动申请匿名标识。先后通过页面输入框发送两条短消息：“只回复：DATALOM测试成功”和“请只回复：你好”。两次均未取得回答。
- 对话实际请求为 **`POST https://www.doubao.com/chat/completion`**，响应类型 `text/event-stream`。
- 返回 HTTP 200，但流中只有 `SSE_HEARTBEAT → STREAM_ERROR → SSE_REPLY_END`，业务错误码 **710022002**。提示为“当前服务访问频繁，请稍后重试”；未取得模型回答。
- 确认拒绝后停止发送对话，继续离线脚本分析和只读限流查询。
- 研究浏览器关闭后，纯 Node.js + impit 直连调用前置限流接口成功：`is_limit=false`、`limit_time=0`。

默认研究使用 headless。用户明确要求本机 Chrome + CDP 后，增加 `--headed-cdp`：启动独立有界面 Chrome、CDP 仅监听本机，验证窗口最小化后再导航；复用已有研究会话，不读取用户个人 Chrome 资料。

## 协议结构

### 消息限流预检

`POST /im/message/send_rate_limit`

请求信封：`cmd=2260`、`channel=2`、`version="1"`、新 `sequence_id`，以及 `uplink_body.check_message_send_rate_limit_uplink_body={}`。

返回：`status_code=0`，`downlink_body.check_message_send_rate_limit_downlink_body` 含 `is_limit`、`limit_time`、`limit_tips`。真实前端将 `limit_time` 按**秒**换算为到期时间。

这是一个预检范围。预检未限流不能证明对话一定能发送，更不能证明无限额度。独立探针复用已观察到的访客请求，不新建身份，不生成聊天，不重放旧聊天签名。

### 对话请求

请求体顶层：`client_meta`、`messages`、`option`、`user_context`、`ext`。

- `client_meta` 包含本地/服务端会话标识、bot 标识和上次消息位置。
- `messages` 包含本地消息 ID 和文本 `content_block`。
- `option` 包含创建时间、唯一键、模型设置、创建会话选项、SSE 和恢复选项。
- 观察到的查询参数包括 `device_id`、`web_id`、`tea_uuid`、`web_tab_id`、`fp`、`a_bogus`、版本与地区等。
- `a_bogus` 是实际请求中的动态字段；本次没有完成其独立生成验证。

当前静态资源中同时存在旧版 `/samantha/chat/completion` 调用代码，但此次真实页面使用 `/chat/completion`。没有把静态发现的其他路径冒充已验证接口。

## 限制的分类证据

官方前端 `chat.42382d60.js` 内的数值映射如下（原始源码与 SHA-256 存在加密证据中）：

| 错误码    | 前端名称            | 可以确认的分类         |
| --------- | ------------------- | ---------------------- |
| 710022002 | SharkBlock          | 本次实际命中的风控拒绝 |
| 710022004 | RateLimit           | 消息频率限制分支       |
| 710022013 | TouristReachLimit   | 游客额度耗尽分支       |
| 710022003 | CountryRestricted   | 地区限制分支           |
| 710022017 | CountryNotAvailable | 地区不可用分支         |
| 710022019 | TouristPunished     | 游客风控分支           |
| 710012001 | LoginInvalid        | 登录/会话失效分支      |

本次证据能够区分风控拒绝和普通频率/游客额度分类。**不能据此判断此次拒绝具体由 IP、指纹、会话、自动化环境中的哪一项导致。** 请求存在设备参数，只能证明它被发送，无法证明它是服务端唯一限流键。

前端代码没有给出可验证的服务端阈值、计数键或重置窗口。目前没有“每日 N 次”“换浏览器就恢复”等实证结论。

## 排查记录与下一步

已确认：两次研究浏览器页面请求均被拒绝。第二次在匿名标识、启动接口和限流预检完成、已有访客会话 Cookie 后提交，仍返回相同错误。用户报告同机同网络普通 Chrome 未登录可正常回答，但尚未捕获其成功请求。独立预检可达，所以“无法连接接口”不能解释这次失败。

尚未确认：风控触发因素、游客额度数值、浏览器外的独立签名生成。

下一项有价值的实验是取得同一访客、同一出口的正常页面成功对照，保留会话、响应和脚本版本，再逐项定位必要的协议依赖。当前不通过轮换身份/IP 重置额度，也不进行高频撞限流实验。

每次研究使用独立 `requestId`，请求、响应、页面快照、源码和异常写入 `.datalom/datalom.sqlite` 的加密诊断事件。总结已写回 `doubao-diagnosis`，当前状态为 `successful_browser_baseline_captured`，不是生产适配器完成。普通报告不含 Cookie、完整签名、会话密钥、回答正文或会话 ID。

本次采集器补齐 IndexedDB、sessionStorage、请求开始事件和重复响应头记录，修复关闭浏览器时的异常捕获；预检缺失或明确限流时停止发送。被动页面采集及正常退出已验证，没有新增聊天请求。

观测环境包含 `HeadlessChrome/152.0.0.0` 和 `webdriver=true`，不能据此认定风控触发原因。服务端规则无法仅凭前端 AST 证明。

核心证据：

- 真实对话拒绝：`ed1aff91-9301-4d4e-958e-27d6dd4272bc`
- 第二次对话拒绝：`a348dcca-74ff-422b-9824-ad91926c84bd`
- 第二次初始化完成：`a3f19343-4b43-46c7-8e75-6d297932920d`
- 第二次发送前快照：`7e67c1ff-3ecd-485a-b63e-8258c6b1f158`
- 独立预检响应：`f5034b8d-ec43-48e5-ad94-e6e88a89fbe6`
- 前端错误码源码：`f11566dd-bfbd-42de-95c6-68057b3b5a9b`
- 预检到期逻辑源码：`03674e6f-78f4-4d23-81ef-7ad2d927715b`

## 复现入口

```sh
pnpm exec tsx --conditions=datalom-source research/doubao/tools/research.ts inspect # 无界面，只观察页面
pnpm exec tsx --conditions=datalom-source research/doubao/tools/probe.ts            # 纯 Node 直连，只读预检一次
pnpm exec tsx --conditions=datalom-source research/doubao/tools/scripts.ts          # 分析实际加载过的公开脚本，优先用本机证据缓存
pnpm exec tsx --conditions=datalom-source research/doubao/tools/report.ts           # 从已有证据生成报告，不发送聊天
pnpm diagnose raw <eventId>                   # 原始证据仅解密到本机受限文件
```

`doubao-research.ts chat` 是显式发送一次真实消息的研究操作；不会被测试或 Worker 自动调用，也没有自动重试循环。当前已有风控拒绝，先解决成功基线问题再运行。

报告：[../artifacts/doubao-report.json](../artifacts/doubao-report.json)。新增测试验证 HTTP 200 错误流、风控/频率/额度分类、多行 SSE 和预检含义；这些离线解析测试不代表成功对话已验证。

## 本机诊断对照工具

`pnpm exec tsx --conditions=datalom-source research/doubao/tools/import-har.ts /本机路径/reference.har` 仅导入豆包域名记录，原始内容加密保存，普通报告只展示字段差异。多条对话必须在最后指定从 0 开始的索引；没有响应正文或只有结束事件不算成功。Chrome 脱敏导出可能省略 Cookie，缺失不能判定为实际未发送。工具未取得真实成功 HAR，离线测试不代表根因已查明。

## 本机有界面 Chrome + CDP 对照

2026-09-16，实验 `eec82c57-0e27-4464-a5b3-92593f312bbc` 使用已安装 Chrome 152.0.7977.83，经本机 CDP 连接。最小化状态经过 CDP 回读确认（证据 `abb3e102-adc8-47ec-9df7-d45c4d7b8870`）。复用已有研究会话，初始化和预检完成后，从页面输入框发送一次 `hi`。HTTP 200，SSE 仍为 SharkBlock / 710022002，没有模型回答。响应证据 `d7a4e4ad-141c-488d-b667-1a0475eb7ce0`；发送前环境证据 `3113b150-c813-4bf7-b7ef-35806b24bedc`。

此次 UA 为普通 Chrome，webdriver 仍为 true；改成有界面模式不足以恢复回答，具体服务端触发条件仍未知。该会话不等同于用户截图中的个人 Chrome 会话。此前还发生一次最小化状态读取过早，发送前已中止；增加等待窗口状态完成后再读取，失败证据 `50ece87e-f68f-4275-a156-09c2bc73b510` 保留。

本次对话响应和会话快照保存成功后，最小化窗口截图超时（`1a9271f5-1861-47c6-9264-790221c2882f`）。采集器已改为在此模式保存 HTML/DOM 而跳过截图，不为截图恢复窗口。

修复后有界面 CDP 被动采集回归正常退出，实验 2b3437aa-41e2-4159-a9fa-738a2855533d，未发送新消息；TypeScript 检查通过。

## RoxyBrowser 成功基线 · 2026-09-17

用户提供的 RoxyBrowser Profile `aa3e11bbf7b078b11d9e46422a061b32` 已经打开豆包数字会话页，页面显示游客态“登录”按钮。通过正常输入框发送一次唯一标记消息后，`POST /chat/completion` 返回 HTTP 200、`text/event-stream`，模型完整回复标记文本。

成功流共 25 个事件，关键顺序为：

```text
SSE_HEARTBEAT
SSE_ACK
FULL_MSG_NOTIFY
STREAM_MSG_NOTIFY
STREAM_CHUNK / CHUNK_DELTA ...
SSE_REPLY_END(end_type=1)
SSE_REPLY_END(end_type=2)
SSE_REPLY_END(end_type=3)
```

正文不是单一字段：`STREAM_MSG_NOTIFY` 给初始文本，首个 `STREAM_CHUNK` 继续追加，后续 `CHUNK_DELTA` 追加剩余文本。`msg_finish_attr.brief` 给出完整短回答，可作结束校验。同期出现的一条 `GET /chat/completion` 请求体和响应体均为空，不承载正文。

加密成功证据为 `cc7e907f-3ca0-4912-b5d7-3d3145723671`，脱敏对照运行 `46b300da-4a5e-4335-8c0b-9ef246423310`。对照仍是同一 POST 端点和五个顶层请求体字段；动态身份、签名、前端版本和请求体细节均有变化。

最明显的会话差异是：旧失败样本含 `sid_guard`、`uid_tt`、`sessionid`、`odin_tt` 等账号 Cookie，而成功样本是游客态，不含这些账号 Cookie。两次实验的出口和匿名身份也不同，因此这只是下一轮单变量实验的优先方向，不能据此确认 SharkBlock 的根因。

协议解析器现在只有在收到非空回答且存在 `end_type=3` 时才返回成功；心跳或结束事件本身仍不算成功。成功回答已经用真实 8 KB SSE 样本回归，公开报告只记录回答长度和 SHA-256。

### 游客态硬边界与动态签名回归

新增游客态检查会在发送前拒绝 `sid_guard`、`sid_tt`、`uid_tt`、`sessionid`、`odin_tt`、`bd_sso_hi3jfd` 等账号 Cookie；`flow_cur_user_sec_id` 只有空值才允许。页面还必须显示“登录”按钮，否则停止发送。旧的本地研究会话如果含账号 Cookie，不再复用其 Cookie、localStorage 或 sessionStorage。

真实回归命令通过 RoxyBrowser OpenAPI 返回的本机 CDP 地址连接现有游客页：

```sh
pnpm doubao:guest -- <dirid> <cdp-endpoint> "只回复：ANON-BOGUS-OK"
```

2026-09-17 回归结果：账号 Cookie 列表为空，页面游客态检查通过，模型回复 `ANON-BOGUS-OK`，共 16 个 SSE 事件。请求含新 `a_bogus`，且与上一条成功样本不同。加密证据为 `fd76ab2d-a7e4-4bb8-be8c-1ca0bb12f522`。

这条路径依赖豆包官方页面执行 BDMS 并生成每次请求的新签名，所以已经可作为浏览器游客执行器使用。它没有复现 `a_bogus` 算法，也不是浏览器外生产签名器。

## 纯 Node 执行进展 · 2026-09-17

新增 `signer.ts`、`session.ts`、`native.ts` 和 `tools/native-run.ts`。官方 BDMS `bdms-sdk.f36aabd9.js`（SHA-256 `ceac08af90a0ad7690473b42c421433756f112bfb8a28f611718e0c32446387c`）在 Node `vm` 和纯 JS 的 DOM 兼容层内运行，所有 SDK 网络请求先截获；只有明确调用的 Node `fetch` 发出 HTTP。未启动、连接、操作任何浏览器。不是重放旧 `a_bogus`，也不是逐行重写完毕的独立算法。

已验证：

- Node 首次独立消息成功：`cdbd2643-0cbf-4e65-918b-cac50c4b8b9a`。
- Node 新建对话成功：`95fca1b2-b016-4dfc-8e09-ed95c07b84ac`。
- 正式 CLI 新建对话、保存上下文成功：`e0263de9-11cf-445f-9fb6-1b3d1934a3bc`。
- 独立新进程续聊，准确回答前一轮校验词：`166e7001-1907-4cbc-9f70-7118bd0bd85c`。
- 正式 CLI 再次延续刷新 Token：`42f59cbf-3a83-4575-9681-e11f7c050b5a`；使用该新 Token 续聊成功：`2ee70863-32e3-4353-aeb7-d162931d7bcc`。

修复的刷新问题：仅调用 `/web/r/token` 能拿到 `x-ms-token`，但不能证明该 Token 可用于聊天。不带原状态生成的 Token 导致同一个原本正常的身份被拒绝（`52614ef6-e1d8-4078-9e41-cf74a4681fe2`）。源码定位到 `localStorage.xmst`；补上原 Token 后，刷新请求自动携带该 `msToken`，后续真实对话成功。代码把新 Token 保存为候选，聊天验证成功才提升为活动 Token，失败保留原值。

冷启动仍未解决：Node HTTP 能从页面获得 `ttwid` / device ID，从 `/alice/user/get_web_anon_id` 获得游客 UID，从 `mcs.doubao.com/webid` 获得 Tea ID，并独立生成 `fp`、取得 Token。然而同一新身份的聊天仍返回 `SharkBlock / 710022002`（`d1c0de51-a76f-4194-a337-4a1682156ecb`）。没有通过轮换身份/IP 或重复发送相同请求掩盖失败。Tea `web_id` 与 `tea_uuid` 相等，不能把游客 UID 当作 Tea ID；它们和 device ID 也不是同一个字段。

离线检查 BDMS Token 明文输入发现 Node 兼容环境的 `nWID.extra` 有异常，`envCode=129`、`ubCode=14`，另有 `MouseEvent` 缺失和 `Object.defineProperty called on non-object`。这些是可复现的环境差异，尚不能据此确认服务端拒绝根因。后续应沿用当前冷启动身份逐项补齐兼容环境并验证，不把已有身份成功当作冷启动成功。
