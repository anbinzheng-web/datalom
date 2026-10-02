# 接口、运行时与本机数据

本文补充 [项目架构](../AGENTS.md) 的实现细节，修改相关模块时按需阅读。

## API 与契约

server 是接口定义来源：本机 Fastify 路由、`src/openapi/schemas.ts` 及公开平台 endpoint registries 共同生成契约。修改定义后运行 `pnpm contracts:generate`，用 `pnpm contracts:check` 检查漂移。`packages/shared/openapi.json`、`packages/shared/src/api/generated.ts`、`packages/shared/src/api/schema.ts` 是提交到 Git 的生成产物，不手改，也不作为 server 行为的来源。

本机管理认证与公开 API Key 分离。controller 负责协议适配，平台服务负责业务编排，平台包负责原站协议。新增接口应同时核对路由、参数校验和生成文档；未接入生成器的路由不能宣称已被契约覆盖。

## 会话、网络与证据

账号会话和原始研究证据由 storage 加密保存，普通响应只返回脱敏信息。保留 Cookie 域、路径、过期和分区语义；不得用字符串拼接绕过隔离。更新会话需遵守版本与租约约束，不跨账号复用连接或签名上下文。

账号请求最后一跳始终是账号代理。GOST 路径可在前面接系统或环境代理；发现上游代理但连接失败时不静默直连。旧会话的手动上游配置不再决定出口。不同平台可能使用不同 HTTP 实现，修改时沿用其现有 transport，不另建绕过账号线路的 fetch 分支。

HTTP 200 不是业务成功：校验错误码、对象归属、数据结构、分页推进和流结束状态。未知签名版本、挑战和限流应明确报告；不能通过轮换账号或无限重试掩盖失败。原始失败证据保留，报告区分观测、推断与未验证。

## 构建与本机数据

Node 及 pnpm 版本以根 `package.json` 为准。`pnpm -r build` 按 workspace 依赖构建；源码通过 `datalom-source` 条件导出，默认导出使用编译 JS。研究包输出保留 `dist/src`、`dist/tools` 层级，避免破坏 CLI 相对导入和子进程入口。

配置位于 Git 跟踪的 `scripts/config/roxy.json`。本机数据库和证据默认位于 `.datalom`；`DATALOM_DATA_DIR`、兼容的 `SPIDER_DATA_DIR` 和旧 `.spider` 选择逻辑由 `@datalom/shared/runtime/paths` 统一处理。截图与报告使用 `artifactPath()`，不依赖当前工作目录、不提交 Git，也不作为永久能力证明。

