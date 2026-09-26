# Datalom

本地优先的网页 API 逆向与执行平台。Node.js + TypeScript；RoxyBrowser 只用于登录、提取和研究，生产 Worker 使用独立 HTTP 与独立签名进程。

当前实现 TikTok 视频详情和分页评论，支持已观测的 `5.3.2 / webmssdk 2.0.0.561` 签名布局。2026-09-16 已通过两个真实账号、关闭两个 Profile 后的独立请求验证：每个账号成功取得视频详情及连续三页评论。证据与限制见 [验证记录](docs/validation.md)。

## 启动

```sh
pnpm install
pnpm gost:install
pnpm build
pnpm start
```

打开 <http://127.0.0.1:4317>，在另一个终端运行 `pnpm auth` 获取本机访问令牌。令牌只需粘贴到登录页；网页不把密钥存入 localStorage。

Node.js 要求 `>=24.11 <25`。GOST 安装器固定 `3.3.0`，校验发布包 SHA-256；可用 `DATALOM_GOST_BIN` 指定已有 GOST v3。下载需要代理时，可给**安装命令**设置 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897`。平台生产请求始终使用显式账号代理链。

`pnpm start` 同时启动本地服务和独立 Worker。开发页面可另外运行 `pnpm web:dev`。数据目录默认仓库根目录下的 `.datalom`，用 `DATALOM_DATA_DIR` 指定其他目录；每个目录对应独立的系统凭据库主密钥。

## 第一个账号

1. 在 RoxyBrowser 中打开 Profile，登录 TikTok，并打开公开视频页面。
2. Datalom「连接设置」填写本机 OpenAPI 地址、工作区和 Clash 端口，必要时填写 API Key。
3. 「账号与会话」读取 Profiles，点击「提取会话」。已打开的 Profiles 排在前面。
4. 打开账号详情，点击「验证代理线路」。账号代理来自 Profile；出口必须与 Profile 的记录一致。
5. 「接口研究」选择账号和公开视频链接，点击「采集接口样本」。此操作使用浏览器，只在研究和重新采样时发生。
6. 「请求与任务」提交视频详情或分页评论。生产请求独立运行，浏览器可关闭。

账号代理变更在 RoxyBrowser 中完成后重新提取，并重新验证线路。重提取会创建新会话版本并清除旧签名样本，防止跨身份复用；进行中的任务持有租约时会拒绝覆盖。

## 本地 API

OpenAPI 文档：登录后访问 <http://127.0.0.1:4317/api/openapi.json>。

API 使用 `Authorization: Bearer <本机令牌>`。目前业务请求统一异步返回 `202` 与任务 ID，Go 网关可以直接复用同一契约。

```http
POST /api/v1/tiktok/comments
Content-Type: application/json
Authorization: Bearer <本机令牌>

{
  "requestId": "your-unique-request-id",
  "accountId": "账号 ID",
  "video": "https://www.tiktok.com/@account/video/1234567890123456789",
  "cursor": "0",
  "count": 20,
  "maxPages": 3
}
```

详情使用 `/api/v1/tiktok/video`；任务状态和结果使用 `GET /api/tasks/:id`；取消使用 `POST /api/tasks/:id/cancel`。相同 `requestId` 和相同输入返回原任务，不同输入返回冲突。`deadline` 为毫秒 Unix 时间戳，默认五分钟，最大一小时。

评论结果包含去重后的 `data`、下一页 `cursor`、`hasMore` 和 `adapterVersion`。达到 `maxPages` 时保留真实 `hasMore`，可使用返回游标继续提交。失败保留已完成页和错误分类。

## 工程结构

```text
apps/server                 Node 管理 API、静态页面、Worker 启动
apps/web                    React 管理页面
apps/worker                 队列、账号租约、HTTP 执行、分页与取消
packages/contracts-ts       OpenAPI 生成类型、schema 与 HTTP 客户端
packages/runtime-node       Node 执行接口、错误、纯诊断函数
packages/storage-node       SQLite/Drizzle、加密、会话和持久化诊断
packages/network-node       Cookie Jar、GOST 两跳线路、HTTP Transport
packages/platform-*/src     各平台执行实现、专属测试与第三方参考
research/*/src              平台浏览器连接与研究模块
research/*/tools            采集、分析、独立验证和 CLI
contracts/openapi           跨语言任务 API 契约
tools                      通用鉴权、诊断、安装和验证
tests                      跨包集成与架构边界测试
```

所有 TypeScript 应用、共享库和研究工具均为独立 pnpm workspace 包，跨包引用使用 `@datalom/...`。`pnpm build` 构建全部包，`pnpm start` 执行 JS 产物；开发使用 `pnpm dev`，无需预构建。生产 Worker 不依赖浏览器或研究包，架构测试检查源码图和包依赖图。

完整开发、包边界、跨语言接入与路径兼容说明见 [monorepo 指南](docs/monorepo.md)。运行架构见 [架构说明](docs/architecture.md)，第三方来源见 [来源与许可证](docs/third-party.md)。

问题排查入口：任务列表「结果与排查」，查看执行时间线、保存排查结论并导出报告。完整流程、原始证据读取和故障恢复见 [问题排查手册](docs/troubleshooting.md)。

豆包新增纯 Node 执行器：固定哈希的官方 BDMS 在 Node VM 中生成新 `a_bogus`，Node 内置 `fetch` 发送消息；不连接浏览器，不依赖 impit/外部签名服务。已有游客身份下的新建对话、跨进程续聊、Token 延续刷新均有真实成功记录。初始身份目前导入历史游客证据；全新游客冷启动仍被风控拒绝，尚未接入通用 Worker/API。见 [Node 使用与边界](docs/doubao-node.md) 和 [研究记录](docs/doubao-research.md)。

## 验证与研究命令

```sh
pnpm check
pnpm test
pnpm build
pnpm test:ui
pnpm benchmark
pnpm research profiles
pnpm research extract <profileId>
pnpm research capture <profileId> <observedVideoUrl>
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/inspect-scripts.ts <profileId>
pnpm exec tsx --conditions=datalom-source research/tiktok/tools/analyze-script.ts [evidenceId]
```

`pnpm test:ui` 使用独立临时数据库和真实 Chromium，不调用 TikTok。`pnpm benchmark` 是本机双代理 HTTP/1.1 转发基准，不能当成 TikTok 吞吐。

`research/tiktok/tools/live-regression.ts --close-profiles` 是开发验收工具：**会临时关闭已准备的两个测试 Profile，再恢复打开**；默认不自动运行。证据原文存入加密数据库，普通页面只返回摘要。

## 当前限制

- 管理页面与通用 Worker 的首期范围为 TikTok；独立平台 CLI 的能力及验证状态分别见 [TikTok](docs/tiktok-native-interface-map.md)、[Facebook](docs/facebook-native-interface-map.md)、[Instagram](docs/instagram-native-interface-map.md)、[X](docs/x-native-interface-map.md)。不包含自动登录或付费网关。
- 使用观测到的签名版本与会话中的环境字段，新版本需要重新采样和回归；不宣称复制全部浏览器特征。
- 原始 Cookie 属性完整保存；公共 Cookie Jar 遇到分区 Cookie 明确停止。X 执行器单独实现并测试固定 X 顶层同源上下文的分区隔离，不代表通用 CHIPS 已完成。
- 本地凭据库在 macOS 已验证；Linux Secret Service / Windows Credential Manager 尚未实测。不要在丢失主密钥后覆盖原数据库。
- 长期稳定性、Token 全生命周期、动态代理换 IP、100+ 账号和商用容量尚未完成长期验证。
