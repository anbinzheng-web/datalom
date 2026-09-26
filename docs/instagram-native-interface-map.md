# Instagram 原始接口

代码、会话、研究工具和测试均在 `packages/platform-instagram/src/`。生产入口 `tools/native-run.ts` 仅使用独立 HTTP、加密会话和 GOST 线路，不导入 Playwright/CDP。页面研究使用用户提供的 Instagram Profile，目标为公开创作者页面和公开内容。

## 本轮真实验证（2026-09-16）

| 操作 | 页面真实查询 / 原始接口 | 结果 |
|---|---|---|
| profile.detail | PolarisProfilePageContentQuery / 28036671149327607 | 公开资料、简介、头像、认证、公开计数 |
| profile.posts | PolarisProfilePostsQuery / 28322872020710458 | 首屏 12 个媒体 |
| profile.reels | PolarisProfileReelsTabContentQuery / 28489923413952431 | 首屏 12 个媒体 |
| media.detail | GET /api/v1/media/{id}/info/ | 媒体 ID、正文、时间、图片/视频、轮播、公开计数 |
| post.comments | PolarisPostCommentsPaginationQuery / 28169471862682868 | 连续 2 页，共 30 个不重复评论 |
| comment.replies | PolarisPostChildCommentsQuery / 28027289793632076 | 2 条子回复，父评论匹配，终止游标 |
| search.suggestions | PolarisSearchBoxRefetchableQuery / 27706427925724183 | 用户建议；标签/地点分支在本样本为空 |
| search.media | PolarisKeywordSearchExplorePageRelayQuery / 37324993597144881 | football、soccer 和 basketball 关键词实测 |
| search.media.page | PolarisKeywordSearchExplorePageRelayPaginationQuery / 28656899673911396 | 连续 2 页，共 34 个不重复媒体 |

GraphQL 使用页面真实的 `/api/graphql` 与 `/graphql/query`。结果只投影公开字段，剔除 viewer、收藏状态、关注关系和本账号状态；私密账号媒体拒绝返回。原始响应和请求认证只存本地加密证据。没有访问收件箱、保存内容、账号设置或发起任何社交写操作。

## 无浏览器验收

`artifacts/instagram/browserless-ed31bbf7-7c94-4787-b84f-1f0db48b8ea6.json`：Roxy 连接列表确认 Profile 关闭，独立进程使用新关键词 basketball 发出请求，结束后再次确认关闭；最后恢复窗口。对应独立请求 `35f237cd-b359-4076-ab3b-2c9660a44a03`。

这证明该请求不依赖运行中的浏览器，但不等于过期会话能自动恢复。样本仍携带提取时的会话令牌、部署版本和查询 doc ID，失效需要明确报错、重新研究/提取。

## 已诊断问题

- 帖子初次执行的 URL 校验失败：页面真实入口为 `/graphql/query`，并非所有请求都走 `/api/graphql`。依据原始 URL 增加精确 allowlist，未放开任意路径。
- 帖子请求返回跨域 Set-Cookie：`i.instagram.com` Cookie 来自 `www.instagram.com` 响应。按域匹配规则拒收并记录事件，其余有效 Cookie 正常更新；修复后 12 个帖子回归成功。原失败 `cf91feee-99d8-46c1-aad0-f7817aebb8c2`，成功 `467d4321-8aec-41fc-b538-b713779b8b31`。
- basketball 首次无浏览器验证在解析阶段失败：响应混有标题与账号占位区块，并非浏览器依赖。只跳过已观测的 `XDTTopSerpHeaderUnit` 和 `XDTTopSerpAccountsHCMUnit`，未知结构仍失败；第二次关闭浏览器验收通过。

## 使用与当前边界

```sh
pnpm exec tsx --conditions=datalom-source research/instagram/tools/native-run.ts <profileId> post.comments <captureEvidenceId> '{}' 2
pnpm exec tsx --conditions=datalom-source research/instagram/tools/native-run.ts <profileId> search.media <captureEvidenceId> '{"query":"soccer"}'
```

详情、主页列表目前绑定已观测对象；评论与搜索分页使用返回游标，不猜测游标。主页帖子/Reels 的继续分页、搜索初页自动衔接分页、标签页、地点页、音频页、Tagged、Stories/Highlights 等尚未完成，不把返回入口或 URL 算作已接通接口。搜索分页上下文应使用对应搜索的样本，不跨关键词重用。当前是本地原始执行器，未接入管理 UI 或 Go 商业网关。
