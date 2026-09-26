# TikTok 原站接口状态与复现记录

更新：2026-09-16。本阶段只实现内部原站协议模块和研究 CLI，没有新增对外 HTTP 路由、Go 网关或商业 API。

## 当前结果

本轮新增 **22 个不同原站 GET 路径**，均在 TikTok1 账号完成浏览器关闭后的独立真实请求。原有视频详情和一级评论两条路径保持既有实现；其此前双账号验收不是本轮重新验证。

“成功”限定为记录的账号、样本与版本，不代表所有地区、所有输入、长期有效性或全部 TikHub 能力已经覆盖。本轮新增能力尚未完成第二账号验证。

Web 请求原点为 `https://www.tiktok.com`；`live.*` 原点为实际捕获的 `https://webcast.us.tiktok.com`。不会根据地区猜测其他域名。

| 内部操作 | 原站路径 | 单次运行各页结果 | 独立运行 requestId |
| --- | --- | --- | --- |
| `live.feed` | `/webcast/feed/` | 1 条 | `44e2b4a6-dba0-484e-8dd6-4286904bb5e2` |
| `live.alive` | `/webcast/room/check_alive/` | 3 条 | `f25c1007-067f-4251-9212-2c7ae9bef222` |
| `live.audience` | `/webcast/ranklist/online_audience/` | 99 条 | `5d3d4048-3f62-41fc-8320-79d322f09442` |
| `live.gifts` | `/webcast/gift/list/` | 759 条 | `0f39cac5-c9b0-4674-9c47-5787fd52377b` |
| `feed.explore` | `/api/explore/item_list/` | 8 条 | `c95d5fdb-de58-4b6c-ab89-898cd727787b` |
| `music.detail` | `/api/music/detail/` | 详情对象 | `c6cb5b04-8aca-440e-8ded-8418963c17a9` |
| `music.posts` | `/api/music/item_list/` | 30 / 29 / 30 条 | `0f495050-46cb-484c-82bd-a1eff51ae859` |
| `user.playlists` | `/api/user/playlist/` | 9 条 | `deaa6c7c-7448-48e7-a0ea-0647e2d65997` |
| `user.reposts` | `/api/repost/item_list/` | 30 / 30 / 28 条 | `6e951f52-06c7-449d-a355-d4c9d2daf08e` |
| `playlist.detail` | `/api/mix/detail/` | 详情对象 | `8036d64c-833b-45b2-b35d-c5bb8bea7ce6` |
| `playlist.posts` | `/api/mix/item_list/` | 7 条 | `74dc0031-077f-4059-91a3-61d1229a5f1b` |
| `user.followers` | `/api/user/list/` | 30 条 | `aaf8254e-1f44-40a8-a364-21b4bbdbdd67` |
| `comment.replies` | `/api/comment/list/reply/` | 3 / 3 条 | `c9bcaac3-5a19-44e1-b313-0ae4ab4e791a` |
| `user.detail` | `/api/user/detail/` | 详情对象 | `af0480c3-6eb1-49a6-bcf7-30059d765cbc` |
| `user.posts` | `/api/post/item_list/` | 16 / 16 / 16 条 | `efcf7255-917c-42a0-a815-4194bb5bd2dd` |
| `search.general` | `/api/search/general/full/` | 18 条 | `c0d9f19b-3141-4bec-ab5d-b8a4a31bf00f` |
| `search.videos` | `/api/search/item/full/` | 12 条 | `2db20c8f-fef0-4fa2-8d75-57196a736f21` |
| `search.users` | `/api/search/user/full/` | 10 条 | `7a1ae76f-a775-403c-8390-02a1a454328c` |
| `search.photos` | `/api/search/photo/full/` | 12 条 | `df897f3e-2310-4e16-89bb-d8fbaa951f9d` |
| `search.preview` | `/api/search/general/preview/` | 9 条 | `78f4ed46-4775-47ad-bd17-8edc8b06b33f` |
| `hashtag.detail` | `/api/challenge/detail/` | 详情对象 | `83e6d0c3-5057-4e5e-a7a3-7680cc1a3e2f` |
| `hashtag.posts` | `/api/challenge/item_list/` | 30 / 30 / 30 条 | `cc2fa05f-262e-417c-a470-971a40046f5c` |

完整机器清单：`artifacts/tiktok-native/inventory.json`，包含捕获证据 ID、独立请求 ID、签名变化证明、分页和失败记录。每次原始请求与响应保存在本机加密证据库；普通报告不包含 Cookie、完整签名或代理密码。

## 评论回复与子回复

已实现 `GET /api/comment/list/reply/`。参数为 `item_id`（视频）、`comment_id`（根评论）、`cursor`、`count`，不能照搬一级评论的 `aweme_id` 参数。

真实样本：视频 `7683824912389213470`，根评论 `7684401701051630358`。连续两页各 3 条，游标 `0 → 3 → 6`，第二页 `has_more=0`，6 个不同回复 ID。另从游标 6 请求验证了空终止页，requestId 为 `deec2066-f9b3-44da-a34a-0d779eb8c98e`。

保留完整原始响应：`reply_id` 指向根评论，`reply_to_reply_id` 指向具体被回复的子评论，`0` 表示直接回复根评论；`thread_id`、`reply_comment`、`reply_to_userid` 等字段不被裁剪。严格检查视频、根评论、回复 ID、子回复目标和游标。单页重复视为结构异常，跨页重复在报告统计；这里返回原始分页，不构建上层评论树。

## 浏览器独立性及验证边界

- 关闭窗口证据：`572ee1a2-74dd-4056-b5d8-c5302be4196e`、`8e4b515e-2dbc-4e8e-ab9a-42447c39ea1f`，通过成功的 Roxy connection_info 响应确认两个研究账号 Profile 不在运行列表。
- 执行 CLI 及其依赖没有 Playwright、Roxy 连接器或 CDP。架构测试覆盖该依赖图。浏览器关闭工具属于独立研究工具。
- 22 条路径的成功运行均重新生成 X-Gnarly、X-Dynosaur；逐条对比确认不同于捕获值，证明不是固定签名重放。
- 新关键词 `linen trousers` 的视频搜索得到 12 条，requestId `4ad8a0a7-cbd0-4ce7-87cb-01c743f65f16`；同一旧用户模板改查 `revicedenim` 成功，requestId `c4859faf-96a1-4dc6-8766-d94f83cf992b`。
- 用户作品、话题作品、音乐作品、转发作品各验证 3 页。播放列表 9 项、其中一个列表 7 个作品，均自然终止。搜索、粉丝、探索和直播只验证单页；后续上下文未确证，CLI 禁止这些操作自动多页。
- 浏览器实际版本 Chrome 149，传输使用既有 impit/chrome151 配置；成功实测不意味着两者指纹完全一致。
- 独立初始化登录会话、所有异常边界、长期稳定性以及本轮新增接口的双账号验证仍未完成。

## 内部复现入口

`packages/platform-tiktok/src/native.ts` 定义允许的原站操作、参数和响应校验，原始响应保存在 `NativeResult.raw`。CLI 限定同一账号的已捕获 GET 成功证据，拒绝随意传 URL、Cookie、脚本或未经观察的路径。

```sh
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-run.ts TikTok1 comment.replies \
  e07b45de-f83f-4256-a43c-d921f2468a55 \
  '{"item_id":"7683824912389213470","comment_id":"7684401701051630358","cursor":"0","count":"3"}' 3

pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-regression.ts artifacts/tiktok-native/validation-cases.json
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-regression.ts artifacts/tiktok-native/validation-additional.json
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-regression.ts artifacts/tiktok-native/validation-live.json
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-inventory.ts
```

证据库和 artifacts 是本机数据，不提交到 Git。其他环境需重新采集本机账号证据，不能复制上面 ID 就假定存在。回归文件只是顺序限速验证清单，不是对外批量服务。账号租约、版本校验、每次至少 3 秒间隔和代理链复用现有底层；失败不自动重试。

## 排障链路及本轮实际修复

每次请求记录 `requestId → session snapshot → route/proxy → parameter validation → signature → HTTP headers/body → encrypted evidence → session save → business parse → final report`。失败保留阶段、原始异常栈与 cause、HTTP/业务响应、会话版本、计数器和下一项实验；解析前先保存完整响应。采集器将动作标签绑定到请求发起时，关联页面 URL 和请求 ID，避免页面切换后把旧响应归入新动作。

本轮直播推荐失败 `f685a7d3-23d7-4ba3-a1eb-bfa85961c4c9`：HTTP 200、业务 0、1 个房间，但 `extra.has_more` 缺失。原始证据 `652a0c7a-3c5d-4a92-b137-48f6c7f889cc` 证实是建议主播响应分支与初始样本不同，解析器误将该字段设成必填。修复为字段存在时校验类型，缺失时保留未知，绝不补造终止状态。随后新签名回归成功 `44e2b4a6-dba0-484e-8dd6-4286904bb5e2`；根因与修复闭环证据 `2f04dcfd-d644-4347-87f4-d45314c9fe49`。原失败记录没有覆盖或删除。

## 仍需继续的原站能力

| 能力 | 证据/阻塞点 | 下一项实验 |
| --- | --- | --- |
| 搜索连续分页 | 单页成功；offset、cursor、search_id 上下文未完成捕获对照 | 实际滚动搜索结果，保存连续请求差异再迁移继续状态 |
| 粉丝/关注/建议用户 | 粉丝 scene=67 首页成功；关注 scene=21 和建议 scene=151 已有样本，未接入独立模块 | 分别实现参数分支与双游标；保留可见范围与截断字段 |
| 私密关注/喜欢 | Revice 关注列表页面明确显示 private | 记录访问限制；公开账号另取样本，不把私密结果当空成功 |
| 作者侧栏作品 | `/api/creator/item_list/` 已捕获，属于公开作者视频侧栏 | 校验双向游标与作者归属；不等同 Creator 分析后台 |
| 搜索 guide、Story、收藏/合集 | 有样本但部分为空、或签名/结构不同 | 获取非空页面对照；收藏仅处理本账号可见内容 |
| 推荐首页、探索分类/连续加载 | 探索 GET 首批已验证；POST prefetch 样本无作品 | 实际分类切换和下一批；不要把预取计为推荐成功 |
| 直播房间详情/搜索/消息协议 | 已有部分 room/search、room/enter POST 等样本；正文签名、消息协议未移植 | 区分只读详情、进入房间副作用及实时消息，分别建立协议证据 |
| Shop | 尚无当前原站商品/SKU/评价/店铺协议实现 | 从已观察的 Shop 页面入口捕获；不套用 TikHub 已弃用路径 |
| Ads / Creative Center | 尚未捕获对应站点契约 | 独立站点研究趋势与广告读取接口 |
| Creator / App 专有能力 | Web 已打通路径不代表 App 或获授权后台契约 | 获授权账号单独采样；无法映射到网页的 App 能力单列 |

TikHub 的 165 个目录项含版本、辅助和弃用条目，不是 165 个原站接口。来源快照为 `artifacts/tikhub/catalog.json`。本文件取代早期“只发现两条路径”的阶段性盘点，未完成项仍如实保留。
