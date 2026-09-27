# 多语言 monorepo

仓库按应用与能力组织。JavaScript/TypeScript 使用 pnpm workspace；其他语言按实际需求引入自己的工具链，不通过 package.json 伪装成 Node 包。

## 开发与验证

```sh
pnpm install --frozen-lockfile
pnpm dev                         # 源码启动管理服务及 Worker
pnpm web:dev                     # Vite 页面热更新
pnpm check                       # 契约生成检查与全部模块类型检查
pnpm test                        # 离线单元、集成及架构检查
pnpm build                       # 所有模块及前端构建
pnpm test:built                  # 构建产物、签名子进程、路径冒烟
pnpm test:ui                     # 本机 Chrome UI 冒烟
pnpm start                       # 使用 JS 构建产物启动

docker compose up --build        # 使用 /data 持久化运行 API 与 Worker
```

Node 24.11.0 与 pnpm 10.11.0 由 `.npmrc`、`mise.toml` 和 `packageManager` 固定。安装了 mise 时可使用 `mise run dev/check/test/build`。直接执行研究脚本需要 `pnpm exec tsx --conditions=datalom-source research/<platform>/tools/<entry>.ts`。

`pnpm --filter @datalom/server dev` 与根目录开发命令共享同一数据目录。默认 `.datalom` 和相对 `DATALOM_DATA_DIR` 均相对于仓库根目录；绝对路径不变。沿用现有数据库文件与 Keyring 记录，不迁移、复制或重建用户凭据。

## 模块与依赖方向

- `apps/admin-web`：管理后台（包名 `@datalom/admin-web`），包含运营管理、RoxyBrowser 提取、接口研究和执行诊断；官网与客户用户后台使用 Next.js。
- `apps/server`：使用官方 Nest CLI 的管理 API，负责鉴权和任务入队。旧 Fastify 路由通过兼容模块接入；Worker 由根目录开发命令或 Docker Compose 独立启动。
- `apps/worker`：任务调度与执行；不依赖浏览器 SDK 或研究包。
- `Dockerfile` / `compose.yaml`：生产镜像和持久化数据卷；容器内通过 `DATALOM_DATA_DIR=/data` 保存在线 SQLite。
- `packages/contracts-ts`：由 OpenAPI 生成的类型与校验 schema，以及类型安全 HTTP 客户端。
- `packages/runtime-node`：Node 内部执行接口、错误、纯诊断函数、固定路径。
- `packages/storage-node`：SQLite、加密、持久化诊断和会话。
- `packages/network-node`：Cookie、GOST、HTTP。
- `packages/platform-*`：平台执行实现和专属测试；禁止依赖研究包。
- `research/*`：浏览器连接、采集、分析、独立 CLI 和实验。当前保留各平台连接器，不在本次迁移中强行统一不同平台行为。
- `tests`：跨包集成与架构测试；`tools`：仓库级开发和安装工具。

跨模块通过 `@datalom/<package>/<module>` 引用，依赖显式使用 `workspace:*`。包内使用相对路径。纯错误/Trace 定义在 runtime，数据库 Diagnostics 在 storage，避免循环引用。

各包的 `datalom-source` 导出条件指向源码，默认导出指向 `dist/*.js`；TypeScript 使用源码类型。构建保留文件结构与子进程入口，不打包原生依赖。当前交付单位为整个 workspace，尚不是可独立发布到 npm 的包或可任意搬移的单目录部署包。生产启动不需要 tsx。

架构测试同时检查生产源码传递引用和 package.json 依赖。新增生产包时应将入口加入检查。真实平台、真实账号的研究回归不在默认测试中自动运行。

## 跨语言契约

唯一编辑源是 `contracts/openapi/datalom.json`，覆盖健康、任务提交/列表/详情/取消、TikTok 版本化任务入口。管理、浏览器、诊断 API 仍由服务的 `/api/openapi.json` 描述，尚不承诺为外部网关稳定接口。

```sh
pnpm contracts:generate
pnpm contracts:check
```

生成文件提交到 Git。Fastify 任务输入校验和成功响应使用同一份生成 schema，测试使用生成客户端执行提交、幂等冲突、查询和取消，检查响应结构。ID 与游标是字符串；时间为 Unix 毫秒；result 为平台相关 JSON；取消保留部分结果。Cookie、密钥、Transport、AbortSignal 不属于公共契约。

后端不再规划 Go 网关：平台签名和逆向逻辑主要是 JavaScript，Node 可以直接复用，Go 改写会增加复杂度，而当前性能瓶颈在代理、限流和网络往返。若未来确实需要外部网关，应通过 OpenAPI 调用 Node 任务接口，不直接读写 SQLite。Python 研究模块用 uv/pyproject.toml，Rust 模块用 Cargo；工具版本与检查命令加入 mise 和 CI。不要为未使用语言预先建空应用。

本次保持 TikTok 通用 Worker 与其他平台独立 CLI 的原有能力边界。多平台统一调度、PostgreSQL、集中队列及多节点部署应作为后续独立变更。

## Datalom 品牌迁移兼容

新包使用 `@datalom/*`，开发导出条件为 `datalom-source`，配置使用 `DATALOM_DATA_DIR` / `DATALOM_GOST_BIN`。旧 `SPIDER_DATA_DIR` / `SPIDER_GOST_BIN` 仍可读取，新变量优先。存在旧 `.spider` 目录时默认继续使用它；新安装默认 `.datalom`。已有 `spider.sqlite` 与其 Keyring 服务名保持不变，新数据库使用 `datalom.sqlite`。浏览器会话 Cookie 改名后需重新登录。
