# 决策：NestJS API、Next.js Web 与独立 Worker

状态：已接受

## 决策

- 管理 API 采用 NestJS，运行时仍使用 Node.js/TypeScript。
- 管理前端采用 Next.js，使用其 App Router、服务端渲染和静态元数据能力改善 SEO。
- `apps/worker` 保持独立进程，不并入 NestJS 请求进程，也不由 Next.js 执行。
- `contracts/openapi/datalom.json` 和现有任务状态契约继续作为 API 与执行面的边界。

## 为什么不采用 Go API

平台签名和逆向得到的实现主要是 JavaScript。Node 可以直接复用这些代码和短生命周期签名子进程；将它们改写为 Go 会增加运行时适配、验证和维护成本。当前瓶颈在代理、平台限流、网络往返和账号状态，不在 API 服务使用的语言，因此 Go 不带来足够收益。

## `apps/worker` 做什么

Worker 是异步任务执行进程。管理 API 只负责鉴权、校验输入、写入任务和返回任务 ID；Worker 定期从 SQLite 队列原子领取任务，取得账号租约，建立账号专属代理线路，调用平台适配器和 JavaScript 签名器，按页保存结果，并处理取消、超时、重试、限流、心跳和崩溃恢复。

Worker 不负责页面渲染、SEO、登录页面或浏览器研究。它也不依赖 Playwright、RoxyBrowser SDK 或 CDP，这个依赖边界由架构测试保护。研究连接器仍由管理 API 和 `research/*` 使用。

## 迁移顺序

1. 保持 `packages/*`、Worker、OpenAPI 和 SQLite 行为不变，先把 Fastify 路由按领域迁入 NestJS modules/controllers/services。
2. 让 NestJS 继续托管 `/api`、OpenAPI、认证和静态资源兼容层，完成 API 回归后再移除 Fastify。
3. 将 `apps/web` 作为 Next.js App Router 应用，保留现有 API 客户端和登录流程；公开页面使用服务端 metadata，用户页面继续要求登录。
4. 最后调整生产启动和构建脚本，确保 NestJS、Next.js 和 Worker 仍可独立启动、停止和诊断。

每一步都必须通过 `pnpm check`、`pnpm test`、`pnpm build` 和构建产物冒烟测试。迁移期间不改动签名、会话加密、任务状态和 Worker 的并发/租约语义。
