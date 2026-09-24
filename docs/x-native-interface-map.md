# X 原始公开数据接口（2026-09-17）

代码集中在 `src/platforms/x/`，当前版本 `x-native-0.2.1`。本阶段交付原始接口执行 CLI、会话提取、代理验证、证据和诊断工具；尚未接入管理 UI、持久化业务任务或 Go 网关。普通执行进程不启动浏览器、不连接 CDP、不调用浏览器签名服务。

## 实测接口

| 业务操作          | 观察到的原生 operation | 验证范围                                                                                                                       | 浏览器样本 evidenceId                |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| profile.detail    | UserByScreenName       | NASA / SpaceX 资料；关闭窗口后独立成功                                                                                         | b1ce7708-4450-4d05-95c0-5e6986e29e35 |
| profile.posts     | UserOriginalsTimeline  | SpaceX 3 页 64 条；关闭窗口换为 NASA 2 页 47 条                                                                                | 8c2b4eb4-debc-4556-926a-cce0d2194460 |
| profile.replies   | UserRepliesTimeline    | 3 页 132 条（含回复上下文，不是 132 条该用户回复）                                                                             | abd3cfb6-d3ab-44d3-aa47-22bd4e2f0812 |
| profile.reposts   | UserRepostsTimeline    | 3 页 60 条，保留转发原文及引用关系                                                                                             | de9aa3ed-5927-401e-b438-bd3f278cd277 |
| profile.media     | UserVideoTimeline      | NASA 3 页 54 条；当前页返回的视频时间线，不能等同所有图片媒体                                                                  | 71da0115-7b9c-44e8-9de8-a7c8e0298509 |
| post.detail       | TweetResultByRestId    | 独立更换 tweetId 成功，返回完整主帖及媒体字段                                                                                  | 485c4458-7984-46a1-af23-a47ff508ead8 |
| post.conversation | TweetDetail            | 主帖、回复、父子关系；换帖子 ID，关闭窗口连续 3 页 108 条                                                                      | c934ae2a-edcf-4872-b4ba-90b2344312fe |
| profile.followers | Followers              | 独立返回 65 条公开用户；受保护用户跳过；该响应无续页游标                                                                       | 80bd91d5-8cc0-4110-998c-1ed8b1b01aef |
| profile.following | Following              | 独立返回 67 条；该响应无续页游标                                                                                               | f7f8b6a5-264c-4385-8c27-7697c08a3cf9 |
| search.timeline   | SearchTimeline         | 历史 Top 3 页 62 条；Latest 2 页 40 条。9 月 17 日独立“马斯克”成功 20 条，但浏览器与关闭窗口后的 astronomy 仍空 404，**搜索不稳定** | 921635dc-af91-48b3-872f-ee8e47fafb24 |

这些条数是特定样本、特定时间的结果，不代表平台全部数据量。`hasMore:false` 表示本次接口没有提供底部续页；不能据此宣称已获得全部粉丝或所有回复。回复分支还有独立 `moduleCursors`。

搜索额外样本：Latest `2c0906f3-7c79-4092-8beb-74225abf5b6d`；People `d95252c5-d9ef-48fc-bb8e-7412ac31986f`；Media `5ebf7eca-11d9-44b1-9eee-d0238222a88e`。People/Media 已浏览器采样并离线解析，**尚未独立成功验收**。当前搜索产品枚举来自页面：Top / Latest / People / Media。

## 字段与分页

- 用户：ID、用户名、名称、简介、位置、注册时间、头像、封面、链接、认证信息、公开关注/粉丝/帖子/媒体计数。
- 帖子：ID、全文（含 note tweet）、时间、语言、作者、会话 ID、父帖/父用户 ID、回复/转发/引用/点赞/收藏/浏览计数、媒体地址/尺寸/替代文本/时长/码率版本、链接、提及和话题。
- 引用和转发保留嵌套关系（最多两层）；不返回本账号点赞、收藏、关注、通知设置等视角字段。
- 只读操作白名单；受保护账号内容不输出；本账号资料/帖子目标或嵌套内容会阻止或过滤。原始响应仅保留于加密诊断证据，业务结果使用字段投影。
- TimelineAddEntries / PinEntry / ReplaceEntry / AddToModule、顶部/底部游标、线程分支游标、广告、反馈提示、招聘卡片、不可用占位均有显式处理。未知结构报错，不转为空结果。
- `post.conversation` 同样可将某条回复 ID 作为 `focalTweetId`。已用 `2099894126317654515` 获得 5 条父帖及回复记录，requestId `e03815af-829b-48ac-aad1-d9ee1c73a4e0`。
- “ShowMoreThreads” 分支已独立取到两页 29 条，requestId `1836c9a6-98c9-4a13-bb2e-baececef4134`。不自动遍历所有分支；调用方选择保存结果中的分支索引。

## 独立请求实现

1. CDP 仅用于研究工具获取真实请求及 Cookie；会话保存在独立 `x_sessions` 加密表。
2. 普通/Partitioned Cookie 分库存储。当前只支持 `https://x.com` 顶层、无跨站祖先的同源请求；其他分区明确排除并记录，不展开为普通 Cookie。opaque 或上下文缺失则停止。Cookie 路径、过期、域检查、Set-Cookie 更新及两个 jar 的持久化均受测试覆盖。
3. 请求通过 `GOST → 配置的上游代理 → 账号代理`，禁止直连回退、跳转和 HTTP/3。浏览器与 impit 出口相同的证据：`0a129afe-949c-4e1a-92fd-5ed81d16ed96`。这不是 TLS/HTTP2 指纹完全相同的证明；Chrome 150 会话与 chrome151 网络 preset 的差异仍存在。
4. 每个执行器从账号线路独立获取未登录 `/home` 页面、版本化 `ondemand.s` 和 `main` 脚本；素材 URL、状态、原文、SHA-256、失败堆栈均加密记录。只解析数据，不 eval 下载脚本。
5. 纯 JS 计算 SVG 动画插值、SHA-256、当前时间和随机掩码，为最终 GET/path 生成新 `x-client-transaction-id`。不复用浏览器 transaction ID。代码参考 MIT 项目并保留许可证，见 `docs/third-party.md`。
6. 当前主脚本解析 allowlist 内的只读 query ID；遇到冲突或缺失停止。业务 variables/features 仍来自成功采样；没有自动发明新增 feature 默认值，平台协议变化仍需研究。
7. 请求间隔 3 秒、单账号租约、60 秒租约续期、版本校验、30 秒请求截止、5 分钟任务截止、最多 3 页/次、无自动重试。限流/挑战/登录失败冷却 5 分钟。跨账号全局并发 20 的生产调度尚未为 X 接入。

## 无浏览器验收

| 报告                                                                | 内容                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `artifacts/x/browserless-59abfcf8-eb94-4bf0-8251-6a07eb78c5be.json` | 资料独立成功；Profile 请求前后关闭，结束后恢复                         |
| `artifacts/x/browserless-8c5c7e93-c461-4665-9f7a-d775b9a4129d.json` | 新帖子 `2099883890223501613`，3 页 108 条；运行期独立下载素材并生成 ID |
| `artifacts/x/browserless-7e6fa433-40ca-4ffb-be8d-bc4cad109091.json` | v0.2.0，新用户目标 NASA，原帖 2 页 47 条；窗口恢复                     |
| `artifacts/x/browserless-f8ef2802-6697-46d6-9038-28be24df42be.json` | 搜索失败：空 404。关闭/恢复均正常，未将失败记为验收成功                |

静态依赖测试递归检查 X `native-run.ts`，排除 Playwright、Roxy connector、research 导入。关闭窗口前后状态由独立研究 harness 验证。

## 排查记录与未完成项

### 已定位并修复

- 动态 ID 颜色计算遗漏 CSS RGB 上界 255：官网原始代码 + Chrome 对照发现 1 组历史失败素材算成 261；已修复并增加回归测试。新增素材后官网与 Node 离线逐字节对照 16/16 通过。详见 [源码分析](x-search-source-analysis.md)。
- 空 404 不能说明响应结构变化：从 v0.2.1 起归类为 `RESEARCH_REQUIRED`，保留原始状态与证据，不自动重试。
- Cookie 初始化失败：原有公共 Cookie jar 不支持分区语义；新增 X 固定顶层上下文的分区隔离实现，未丢掉原始属性。
- 9 月 16 日搜索空 404：不带 transaction ID 失败；仅补回样本 ID 的诊断实验成功；随后独立生成 ID 成功（Top 3 页、Latest 2 页）。固定 ID 重放只算诊断，不作为交付。
- 响应解析：真实样本揭示 visibility wrapper 内无 typename、TimelineJob、TimelinePrompt、TimelineLabel 等结构；各修复均基于原始响应，后续独立分页成功。
- 首次资料无浏览器 harness 使用了拼错的 evidenceId，子进程在发 HTTP 前拒绝；`63a58142-bd40-481b-824b-0cbb3c0612c6` 报告保留。已修复调用，并增加关闭窗口前样本预检。
- 初期把 `flow/timeline.json` 推测为业务接口，检查 request body 后证实是事件日志，已排除。不是数据接口。

专用详情最新验证 requestId：`7e37ffdd-452b-417a-910c-1c553b0cf3e3`。

### 当前搜索间歇失败（2026-09-17）

- 独立请求 `86c987a8-6949-4987-8a8e-04fec918511b`、`16fdf0e9-ae5b-4a5d-a9f6-801adb25d4e8` 返回 HTTP 404，正文 0 字节。
- 浏览器同一账号、同一网络亦失败：样本 `58c4770e-81bd-4121-81d4-d5e23d26cdc6`；禁用缓存并加载最新脚本后仍失败：`3cc1e725-2b68-46e8-83a2-2874818424a4`。
- 站点 main 和 ondemand 版本确实跨日变化，但 SearchTimeline query ID 仍为 `KPSo2_UWdOMpPJwjhfT1Qg`，因此不能归因为旧 ID。单独刷新 query ID 没有解决问题。
- 9 月 16 日 Latest 也曾发生一次空 404（`a7c1f6d7-0b8e-45a5-b223-0ec5e3c5782d`），随后同查询成功；因此不能把搜索异常简单归为跨日更新。
- 最初与上游 0.3.1 算法 14/14 相同，但改用官网原代码与真实 CSS 引擎后发现只有 13/14 相同，定位出上述颜色截断问题。不能以上游库作为唯一正确性标准。
- 本次独立“马斯克”Top 查询成功 20 条，run `5040d474-6f42-43b9-874c-fae943f6158a`；随后浏览器同账号、同 queryId/variables/features/fieldToggles 仍空 404。成功与失败都有剩余额度，账号与 CSRF 一致。
- 最新浏览器失败请求 `f8c4e950-239c-403a-a663-d7c7bae0ee64` 的动态 ID，与同页面原始素材经 Node 重算逐字节一致；说明颜色修复不是所有空 404 的统一解释。
- 关闭窗口后的 astronomy 仍在第一页失败，验收报告 `artifacts/x/browserless-a429651e-a97d-412e-a540-ea585d1feef4.json`，结束已恢复窗口。不得标为连续分页验收通过。
- 已还原 transaction 脚本、搜索 query 和错误中间件，排除当前代码中 WebRTC 输出及 ECDSA 会话绑定作为搜索签名必要输入的猜测；账号/IP/服务端策略的确切拒绝条件仍未证实。
- 完整源码行号、实验脚本、失败链路与下一实验见 [X 搜索源码分析](x-search-source-analysis.md)。停止无变量变化的重复请求。
- 脱敏诊断报告：`artifacts/x/diagnosis-86c987a8-6949-4987-8a8e-04fec918511b.json`。

其余尚未覆盖：搜索 People/Media 独立验收、Lists/列表详情与时间线、社区、引用列表、公开直播/Spaces、趋势接口、认证粉丝/附属账号、所有图片媒体、多账号长期稳定性、真实限流边界、故障断链和性能基准。本阶段不能宣称 X 所有接口已完成。

## 本地命令

均从仓库根目录执行。生产命令不需要打开 Roxy；`extract`/`observe`/`verify-route`/`verify-browserless` 属于研究工具。

```sh
pnpm exec tsx src/platforms/x/tools/extract.ts <dirid>
pnpm exec tsx src/platforms/x/tools/verify-route.ts <dirid>
pnpm exec tsx src/platforms/x/tools/observe.ts <dirid>
pnpm exec tsx src/platforms/x/tools/native-run.ts <dirid> profile.posts <captureEvidenceId> '{"userId":"11348282"}' 3
pnpm exec tsx src/platforms/x/tools/native-run.ts <dirid> post.conversation <captureEvidenceId> '{"focalTweetId":"2099883890223501613"}' 3
pnpm exec tsx src/platforms/x/tools/native-run.ts <dirid> post.conversation <captureEvidenceId> '{"_continuationEvidenceId":"<resultEvidenceId>","_moduleIndex":0}' 2
pnpm exec tsx src/platforms/x/tools/diagnose.ts <requestId>
```

普通续页使用 `_continuationEvidenceId`，省略 `_moduleIndex`；分支续页显式指定索引。续页证据须属于同一账号和操作，不允许更换目标或排序。页面结果写入加密诊断库，普通 `artifacts/x/independent-*.json` 仅含状态、计数、耗时、证据 ID 等脱敏摘要。

离线测试不等于真实平台成功，以上表格分别标明；本轮检查结果见源码分析报告。
