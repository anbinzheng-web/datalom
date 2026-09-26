# Facebook 原始接口研究记录

本目录记录公开页面采集到的 Facebook Comet GraphQL 查询，以及独立 Node.js 请求的验证状态。浏览器只用于研究和提取会话；生产执行器通过固定的本地 GOST 入口发送请求，不连接 CDP。

## 已验证

- `FBUnifiedVideoFeedbackRightRailWithCommentPreloadingQuery` / doc `29509136702019877`：Reel 详情、作者和首屏评论。独立请求返回 HTTP 200，首屏 6 条评论。
- `CommentsListComponentsPaginationQuery` / doc `38793230253624502`：评论分页。独立请求连续两页，每页 10 条，游标和节点去重校验通过。
- `Depth1CommentsListPaginationQuery` / doc `27885623341116045`：一级评论回复分页。独立请求连续两页，每页 10 条，并验证回复的 `comment_direct_parent` 与父反馈 ID 一致。
- `ProfileCometHeaderQuery`、`ProfileCometAboutAppSectionQuery`、`ProfileCometTopAppSectionQuery`：已完成独立请求和响应结构校验（Reels 为首个集合区块）。

每次独立运行的 `artifacts/facebook/independent-*.json` 会记录 requestId、样本证据、页面数、响应大小、游标状态和加密诊断事件。Cookie、CSRF、代理认证和原始响应只在本地加密证据中保存。

## 结构与限制

请求是 `POST https://www.facebook.com/api/graphql/` 的表单，使用当前样本的 `fb_dtsg`、`lsd`、变量上下文和 doc id。响应是换行分隔的增量 JSON，必须合并补丁后再验证业务结构。分页游标和 section token 是对象上下文相关的，不能把一个主页或评论的游标套到另一个对象。

## 未完成和阻塞

主页时间线样本包含服务端 `field_exception`，原始错误和响应已保留，不能把部分数据算作成功。主页 Reels 样本能解析出短视频集合及视频字段，但需要单独捕获分页样本后再实现。搜索、帖子详情、媒体元数据、群组和其他页面区块尚未有成功的公开样本，不能从 TikHub 页面推断已覆盖。

## 证据边界

当前成功证明的是同一会话、同一线路下的独立请求可运行，不等于所有 Facebook 接口都已逆向，也不等于绕过登录、挑战或限流。HTTP 200 仍须通过节点 ID、分页结构、父子关系和业务字段校验；失败会保存阶段、原始错误、异常栈和下一步实验，禁止自动重试掩盖原因。

## 新增主页维度（浏览器捕获）

在同一公开主页切换区块后又捕获：

- `ProfileCometAppCollectionPhotosRendererPaginationQuery` / doc `27028962643386672`：照片集合分页。样本每页 8 项，节点包含 `id`、图片对象、公开 URL、操作渲染器和类型信息。
- `ProfileCometAppCollectionListRendererPaginationQuery` / doc `26157687557261750`：主页列表集合分页（本次由 Followers 区块触发）。样本每页 8 项，包含标题、副标题、公开 URL、隐私范围、节点和操作渲染器。

照片集合已进入执行器并完成两页独立验证；Followers 列表未进入生产 allowlist。照片项中的图片 URL、时间线/集合节点和隐私标签可作为后续字段标准化入口。Followers/Following 需要分别采集样本，不能假设共用同一 section token。

## 独立执行新增结果

已将公开主页照片集合加入 `page.photos` allowlist，并验证连续两页独立请求（每页 8 项，共 16 个唯一节点）。主页 Header、About、Reels 也已完成独立 HTTP 200 和结构验证。Followers/Following 列表虽然捕获过，但按本项目范围排除，不进入生产 allowlist。

## Marketplace（2026-09-16 新增）

| 操作 | 原始查询 / doc ID | 真实独立验证 |
|---|---|---|
| marketplace.detail | MarketplacePDPContainerQuery / 38309511388663877 | 更换商品 ID 后取得标题、价格、描述、状态、属性、交付方式、公开卖家资料 |
| marketplace.media | MarketplacePDPC2CMediaViewerWithImagesQuery / 10059604367394414 | 商品图片与媒体列表 |
| marketplace.feed | MarketplaceCometBrowseFeedLightPaginationQuery / 28036163469355579 | 连续 2 页，41 个不重复商品，广告不作为商品返回 |
| marketplace.seller | MarketplaceSellerProfileDialogQuery / 28482683011328858 | 第三方公开卖家资料、库存量、公开评分 |
| marketplace.inventory | MarketplaceSellerProfileInventoryQuery / 36929885949989832 | 卖家首批 8 个商品，后续分页尚未采集 |
| marketplace.search | CometMarketplaceSearchContentContainerQuery / 27517490627932547 | Electronics 分类搜索连续两页，25 个不重复商品 |

原始响应会同时带有 viewer、订单和消息状态。业务结果使用公开字段 allowlist 投影，不返回这些本账号字段。关键词更新同步修改页面实际使用的嵌套查询字段，保留采样地域和分类条件，不支持调用方注入任意参数或 URL。

搜索最初在浏览器内返回 code 1357038、`marketplace_search.feed_units=null`。保留浏览器失败证据 `c601e603-6c28-4e68-92e0-a2dc15614c74`；随后独立对照实验获取 24 个商品，识别搜索节点类型与推荐列表不同，补齐解析后回归成功。恢复发生于窗口重开之后，但服务端最初错误的根因仍未确认。诊断实验来源和生产样本来源分开标明，未伪造浏览器成功样本。验证后的独立模板证据为 `e99e5481-33e2-4551-a799-5490e3d5e89a`；两页回归请求为 `587b1860-872f-4fd7-a097-b76d24b0c8d5`。

Marketplace 推荐列表采用 Relay `$stream$` 连续数组追加与 `$defer$` 页信息补丁。解析器支持实际观测的顺序追加，仍拒绝数组空洞、丢失对象路径、业务错误和不完整分页。

关闭浏览器证明：`artifacts/facebook/browserless-c481e735-1ae1-476d-89fb-4de7d43bb894.json`，原始商品详情请求期间 Profile 前后均确认为关闭，随后恢复窗口。

```sh
pnpm exec tsx --conditions=datalom-source research/facebook/tools/native-run.ts <profileId> marketplace.search e99e5481-33e2-4551-a799-5490e3d5e89a '{}' 2
```

边界：地域、半径、价格、排序和分类切换尚未逐项独立验收；卖家库存后续分页、商品视频分支和评分明细尚未验证。之前主页时间线的字段错误仍单独保留，不能称 Facebook 所有原始接口均已完成。

关键词变更追加验证：iphone 搜索独立连续两页，24 + 8 = 32 个不重复商品，请求 `f580b682-809d-47dc-a549-b1944abb42df`。
