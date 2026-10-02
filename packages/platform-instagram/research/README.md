# Instagram 协议经验

历史研究来自 2026-09 的 Polaris/Relay 样本。实现见 `../src/native.ts` 及 `../src/api/`，采样和验证 CLI 在 `tools/`。查询 doc ID 是部署细节，以新样本与代码为准。

- GraphQL 实际入口包括 `/api/graphql` 和 `/graphql/query`；应精确维护 allowlist，不能假定所有查询共用一个路径。
- `www.instagram.com` 响应曾携带 `i.instagram.com` Set-Cookie；按域规则拒收不匹配 Cookie 并记录，不扩大 Cookie 权限。其余有效更新继续保存。
- 搜索结果混有标题和账号占位块。只跳过已观测的 `XDTTopSerpHeaderUnit`、`XDTTopSerpAccountsHCMUnit`，未知块仍报错，避免默默漏数据。
- 评论回复核对父评论；搜索分页上下文绑定关键词和捕获样本。初页成功不等于已实现自动衔接、主页/Reels 全部分页。
- 返回公开字段，剔除 viewer、收藏和本账号关系状态；私密结果不能包装成空成功。

历史独立验证涉及资料、帖子/Reels 首屏、媒体详情、评论/回复和部分搜索分页。关闭浏览器后新关键词请求通过不代表会话过期能自动恢复；令牌、部署版本或 doc ID 失效应重新研究。Stories、地点、音频等能力不能由返回的 URL 推定支持。
