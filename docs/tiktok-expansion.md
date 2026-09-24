# TikTok 接口扩展建议：对照 TikHub

> 范围已按用户后续要求调整：当前只研究 TikTok 原站接口，不实施本文的业务封装与通用编排建议。请以 [原站接口缺口与研究顺序](tiktok-native-interface-map.md) 为准；本文仅保留为之前的能力调研资料。

调研日期：2026-09-16。状态：公开文档调研与当前代码对照完成；下列新增操作尚未实现、未进行真实平台验收。本次没有使用 TikHub API Key、调用付费数据接口或变更生产执行器。

## 结论

第一批建议增加八个业务操作：链接解析、评论回复、用户资料、用户作品、视频搜索、用户搜索、搜索建议、批量视频详情。它们可以形成“关键词 → 视频 → 作者 → 作者作品 → 评论与回复”的完整采集流程。

TikHub 用作能力目录和输入输出设计的参考。Spider 继续独立执行生产请求；引用的 `/api/v1/tiktok/...` 路径属于 TikHub 服务，并非 TikTok 原站路径，不能直接拼到 TikTok 域名。TikHub 文档提供某项能力不等于我们已有可用的独立实现。

## 当前代码实际具备的能力

- `src/core/contracts.ts` 的 `Operation` 仅包含 `video.detail` 和 `video.comments`。
- `src/platforms/tiktok/adapter.ts` 的适配器只处理详情和一级评论；验证详情 ID、评论 ID、业务状态和分页结构。
- `normalizeVideo` 接受作品 ID 与完整 `/@用户名/video/ID` 链接，没有分享短链、图片作品或主页解析。
- `apps/worker/src/runner.ts` 只对评论执行多页累计，按 `cid` 去重；其他操作默认单页。
- 服务端 JSON Schema 强制要求 `video`，UI、研究样本采集和路由也围绕两个操作构建。
- 当前已有账号会话池、独立 Worker、代理线路、任务取消与恢复、加密证据和诊断时间线，可以复用。

现有双账号详情与三页评论的成功结果来自此前验收，见 `docs/validation.md`；本次未重复跑真实 TikTok 回归。

## 第一批：八个业务操作

以下是拟定的 Spider 操作名，不是已经发布的接口。开发复杂度属于相对估计，必须由实际网页成功样本和独立请求验证。

| 操作 | 用途及输入 | TikHub 对照 | 依赖与验收重点 |
| --- | --- | --- | --- |
| `video.resolve` | 分享文本、短链接或完整链接 → 规范 ID/链接 | [作品 ID](https://docs.tikhub.io/186826079e0)、[分享链接详情](https://docs.tikhub.io/186826105e0) | 长链接本地解析；短链限制跳转域、次数与目标地址，禁止任意 URL 代理；失效链接单独分类 |
| `comment.replies` | `videoId`、`commentId` → 回复分页 | [Web 评论回复](https://docs.tikhub.io/186826064e0) | 区分根评论和回复 ID；每个根评论独立游标、预算与终止状态；覆盖零回复、重复页和被删除评论 |
| `user.profile` | 用户名、主页链接或 `secUid` → 用户资料 | [Web 用户资料](https://docs.tikhub.io/186826057e0) | 统一 `userId`/`secUid`/用户名；用户名会变，持久身份不能只依赖用户名；缺失指标不能填成 0 |
| `user.posts` | 用户标识 → 作品分页 | [Web 用户作品](https://docs.tikhub.io/186826058e0) | 先做用户标识解析；按作品 ID 去重；保留置顶与时间字段，不假定所有上游始终按时间有序 |
| `search.videos` | `keyword` → 视频搜索分页 | [Web 视频搜索](https://docs.tikhub.io/186826070e0) | 必须保留搜索上下文；地区、排序、时间筛选只开放已验证项，不承诺跨账号搜索结果完全一致 |
| `search.users` | `keyword` → 用户搜索分页 | [Web 用户搜索](https://docs.tikhub.io/186826069e0) | 用户稳定 ID 去重；与资料接口衔接；独立确认分页和返回上限 |
| `search.suggestions` | `keyword` → 联想词 | [Web 搜索建议](https://docs.tikhub.io/186826068e0) | 适合关键词拓展；明确语言、账号环境与采样时间，不将联想词排序冒充搜索量 |
| `video.batch_detail` | 多个作品 ID/链接 → 每项详情或错误 | [TikHub App V3 批量详情](https://docs.tikhub.io/258124428e0) | 首版可由 Spider 编排现有详情操作；它是批量任务，不能宣称上游一次请求完成。支持部分成功、逐项 requestId 和预算 |

推荐实施顺序：先改通用契约与分页，再做 `comment.replies`，随后 `user.profile` → `user.posts`；第二组做搜索三项；链接解析与批量编排作为产品入口补齐。评论回复最接近现有数据模型，用户资料是多个后续接口的基础，视频搜索则能让系统从“知道链接才采集”变为“按主题发现内容”。

## 第二批：内容发现和公开关联数据

| 能力 | 拟定操作 | 文档对应与边界 |
| --- | --- | --- |
| 话题详情、话题作品 | `hashtag.detail`、`hashtag.posts` | Web `fetch_tag_detail` / `fetch_tag_post`，适合专题采集；需验证标签文本与 ID 的映射 |
| 每日趋势词、探索内容 | `trend.searchwords`、`feed.explore` | Web `fetch_trending_searchwords` / `fetch_explore_post`；保存地区和采样时间，不能当作全平台完整榜单 |
| 综合搜索、图片搜索 | `search.general`、`search.photos` | Web `fetch_general_search` / `fetch_search_photo`；结果模型要支持混合实体与图文作品 |
| 播放列表、合集及合集作品 | `user.playlists`、`playlist.items` | Web `fetch_user_play_list` / `fetch_user_mix`；逐项确认“列表元数据”和“列表内作品”的真实返回语义 |
| 转发作品、公开喜欢列表 | `user.reposts`、`user.likes` | Web 目录均有；可见性受账号设置影响，私密与空列表必须区分 |
| 粉丝、关注 | `user.followers`、`user.following` | Web 目录均有；不承诺穷尽所有关系，需验证可见性、上限和分页稳定性 |
| 音乐详情、音乐作品 | `music.detail`、`music.posts` | 本次目录见 App V3 `fetch_music_detail` / `fetch_music_video_list`；网页等价能力需另行验证，不能直接迁移移动端实现 |
| 内容资源描述 | `video.assets` | 封面、图片、音频或已有字幕的可用描述与来源；先确认实际字段与资源权限，不承诺所有作品都有字幕或永久可下载 URL |

收藏列表不作为“任意用户公开数据”默认开放；若后续支持本人收藏，应是单独的授权账号能力。

## 第三批：直播、电商、广告和账号分析

| 模块 | 建议从什么开始 | 额外工程成本 |
| --- | --- | --- |
| 直播 | `live.status`、`live.detail`、`live.search`，然后推荐与礼物目录 | 先区分未开播、结束、不可见和请求失败。实时弹幕/礼物事件是持续订阅，不应塞进普通分页任务；需要连接生命周期、断线记录、去重、背压和订阅计量 |
| TikTok Shop | 商品详情、商品评价、店铺商品、商品搜索、分类与分类商品 | 单独适配器和国家站点模型；商品/店铺/用户 ID 分开；价格需带币种和观测时间，SKU/库存不是稳定常量 |
| Ads / Creative Center | 广告搜索、广告详情、热门内容、趋势标签 | 单独请求契约；筛选国家、行业与时间窗按具体文档和平台结果验证，不能沿用普通视频搜索的假设 |
| Creator | 授权账号概览、视频/直播分析、受众、带货关联 | 数据来自授权账号后台；本次核实的账号概览仅适用于已开通 TikTok Shop 的创作者，不是任意账号公开资料 |
| Analytics | 内容指标快照、评论关键词、趋势聚合 | 区分上游返回指标和 Spider 自己计算的派生结果；趋势需要时间序列，不能凭单次抓取恢复历史；“虚假流量检测”不能作为无依据的确定结论 |

这些模块有商用价值，但不应抢在基础内容发现链路之前。用户地区查询、相似作者、Creator Search Insights 等目前主要出现在 App V3 目录，列入研究候选，不算已有 Web 能力。

## 从详细文档核实的设计约束

1. **搜索游标不是一个整数。** Web 视频搜索文档要求后续页携带 `offset` 与 `search_id`；必须保存完整分页上下文。不能把 `cursor + count` 当成通用分页方式。
2. **用户作品有跨页重复。** 详细文档明确需要按作品 ID 去重；该 TikHub 接口 `count` 最大 15，旧排序参数已废弃。此限制属于 TikHub 已公布契约，我们独立实现的上限仍需实测。
3. **回复是第二层分页。** 评论回复需要作品 ID 和评论 ID；每个评论自己的游标不能共享。
4. **营销页可能滞后。** 官网仍展示 Shop 热卖列表，但[详细接口页](https://docs.tikhub.io/347819644e0)已明确弃用，应采用商品搜索或分类商品候选。官网部分 Ads 示例与当前文档目录也不一致，不能机械照抄路径。
5. **Creator 不是普通用户接口。** [账号概览](https://docs.tikhub.io/289437013e0)为 POST，要求账号 Cookie、日期参数，且限定 Shop 创作者。Spider 应由内部会话池提供凭据，未来外部业务调用方仍不能直接注入 Cookie 或代理。
6. **Web、App、Shop 的字段与网络依赖不同。** TikHub 推荐 App V3 是其服务建议，不证明我们的 Web 执行器应该或能够直接切到移动端。
7. **通用示例不等于响应实测。** 本次阅读的多个页面只有 `data: null` 的通用成功示例，因此只能确认文档声明，不能据此编写通过验收的实际解析器。

## 扩展之前需要改的底层

- **操作注册表与分类型参数。** 将全局 `video` 必填改为每个操作自己的 JSON Schema；注册操作的输入、输出实体、分页策略、去重键、单页上限和支持状态。现有接口保留兼容。
- **通用分页状态。** Worker 处理统一的“条目、继续状态、结束标记”，适配器负责解析；去重键按视频、评论、用户、商品分别定义。分页恢复状态绑定操作、查询条件、账号/会话版本、适配器版本，避免跨查询或跨账号复用。可对外返回不透明的 continuation token，对内加密持久化完整状态。
- **实体模型。** `Video`、`User`、`Comment`、`LiveRoom`、`Product` 分开；所有大整数 ID 用字符串。保留原始证据关联和规范字段，不随意把缺失值补成 0。
- **复合任务。** “搜视频后采评论”等流程用父任务和子任务连接，每层设置最大作品数、页数、条目数、时间和请求预算；失败保留已完成部分，取消向下传播。
- **按能力管理会话。** 普通内容、Creator、Shop 的权限与域名范围分别验证；现有账号池与线路绑定继续保留，生产 Worker 仍无浏览器依赖。
- **诊断范围。** 每个请求关联 operation、参数摘要、页序号、分页状态摘要、accountVersion、routeId、adapterVersion、HTTP/业务状态、耗时和原始证据 ID。明确 `empty`、`private`、`not_found`、`rate_limited`、`challenge`、`schema_changed` 等语义，区分已确认原因和待验证假设。
- **未来 Go 网关。** 对外继续暴露业务操作；请求记录增加条目数、上游请求数、缓存命中、部分成功和计量事件。先定义计费单元与去重键，再决定按请求、条目或订阅计费。

## 验收建议

每个操作分别标记：`catalogued`（文档候选）、`sampled`（真实成功样本）、`implemented`（独立实现）、`live_verified`（关闭研究浏览器后真实验证）。状态按版本和账号条件记录，不允许用离线 Mock 测试替代真实验证。

分页操作至少覆盖两账号、连续三页、空结果、终止页、重复条目和中断恢复。搜索额外覆盖换关键词后旧分页状态被拒绝；回复覆盖不同根评论隔离；用户资料覆盖更名、不存在和私密状态；批量操作覆盖部分成功和取消。持续性能仍按受控基准与真实平台限速验证分开报告。

## 来源与留档

- [TikHub TikTok 产品页](https://tikhub.io/tiktok-api)
- [API 分类页](https://tikhub.io/api-reference)
- [实时文档目录](https://docs.tikhub.io)
- 本地目录快照：`artifacts/tikhub/catalog.json`；本次抓取到六组共 165 个目录条目（Web 58、App V3 58、Creator 14、Analytics 4、Ads 16、Shop 15）。该数量包括版本、辅助工具及弃用项目，绝非 165 个已验证可用业务接口。
- 八个重点接口的详细文档 HTML/文本保存在 `artifacts/tikhub/`，便于后续复核。

这份方案不依赖其他项目过去保存的旧 OpenAPI；能力与限制以上述本次在线读取为准。未实测 TikHub 的数据服务成功率、费用或延迟。
