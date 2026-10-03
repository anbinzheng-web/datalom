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

Profile 清单位于 Git 跟踪的 `scripts/config/roxy.json`，连接配置使用环境变量。业务数据使用 PostgreSQL，证据默认位于 `.datalom`；`DATALOM_DATA_DIR`、兼容的 `SPIDER_DATA_DIR` 和旧 `.spider` 选择逻辑由 `@datalom/shared/runtime/paths` 统一处理。截图与报告使用 `artifactPath()`，不依赖当前工作目录、不提交 Git，也不作为永久能力证明。



## PostgreSQL 与 Prisma

本地和部署环境统一使用 PostgreSQL；Prisma CLI、Client 与 PostgreSQL adapter 固定使用 7.10.0 稳定版。`DATABASE_URL` 默认 `postgresql://当前系统用户名@localhost:5432/datalom`。本机已有 PostgreSQL 时创建 `datalom` 与 `datalom_test` 数据库；另一种方式是 `pnpm db:up` 启动 Compose 的 PostgreSQL 17，此时使用 `.env.example` 中的 Docker 用户密码组成连接地址。环境变量需导出给 pnpm 进程。

安装后执行 `pnpm db:generate`，部署表结构执行 `pnpm db:push`；开发模型变更使用 `pnpm db:push`。生成 Client 不提交 Git，shared 构建会重新生成并编译。Compose 通过数据库健康检查和独立 schema 服务排序启动。应用不会在构造平台服务时建表。

所有 Store 与平台会话方法现在是异步接口；必须等待租约、保存、诊断与关闭完成。复杂条件更新保留参数化 PostgreSQL SQL，经 Prisma 执行；简单账号 CRUD 使用生成 Client。事务通过异步上下文共享同一连接，嵌套业务操作不会脱离事务。多步状态变更仅对对应账号、平台会话或用户身份加锁；租约及版本更新保留 CAS 条件。无全局事务锁。

数据库毫秒时间使用 BIGINT，返回应用与公开 API 时转换为安全 JavaScript number，避免改变现有 JSON 契约。会话、配置及证据继续使用原 Vault 加密与记录绑定；PostgreSQL 备份与系统凭据库主密钥需要一起保管。`.datalom` 继续保存报告、代理运行文件和紧急加密日志。

### 平台会话

各平台统一使用 `platform_sessions`，通过 `(platform, key)` 区分身份。账号会话关联 `accountId`，浏览器 Profile 和游客会话分别使用 profile/guest 键。版本、租约与冷却时间独立成列以支持原子条件更新；平台差异数据序列化为 JSON 后加密，JSONB payload 仅保存密文。账号状态与租约位于 platform_accounts，用户登录使用 JWT，撤销版本位于 users.authVersion。

旧 SQLite 导入工具与依赖已移除。开发阶段直接使用 Prisma db push 同步当前模型，不维护历史迁移；平台数据可通过现有研究提取入口重新生成。

测试使用 `DATALOM_TEST_DATABASE_URL`（默认 `postgresql://当前系统用户名@localhost:5432/datalom_test`），每个 fixture 创建独立随机 schema，并在清理时仅删除自己的 schema。测试需要创建 schema 权限，不对业务 schema 执行清空。


### 配置与运行状态的存储边界

- 系统配置由环境变量提供：可选 DATALOM_MANAGEMENT_TOKEN（至少 32 字符）、ROXY_HOST、ROXY_WORKSPACE_ID、ROXY_API_KEY。未配置本机令牌时不启用机器 Bearer 登录，管理员 JWT 登录仍可用。JWT 签名仍使用系统凭据库中的主密钥派生值。
- settings、rate_limits、metrics、workers、tasks、diagnostic_events、evidence、incidents 表均移除。旧异步入队接口不再注册；Worker 仅记录启停，不维护数据库心跳。
- 限流通过内存同步操作进行窗口计数和账号/代理/操作预约，有容量上限并回收过期项。进程重启会清空，多进程与多实例不共享额度；需要整体额度时应由网关或共享限流服务协调，不能将本实现视为分布式限流。
- 账号状态、凭证版本及租约仍由 PostgreSQL 保证原子性；限流计数不再读写数据库。请求读取单个账号，不再扫描全部账号。
- 诊断事件和原始证据写入 .datalom/diagnostics/records 下的加密 JSONL。异步批量写入，待写缓冲最多 8 MiB，按 UTC 日期或 32 MiB 轮转；单条记录不得超过缓冲上限，满载与写入失败明确报错，不静默丢弃。正常写入等待操作系统写入完成，不逐条 fsync；进程正常关闭排空缓冲，断电仍可能丢失系统未刷盘数据。致命错误的 emergency.jsonl 使用同步 fsync。
- 故障跟踪改为本地追加修订，保留版本冲突检测及成功事件回归校验。每条故障使用目录锁，崩溃残留锁需确认无写入进程后人工清理。普通导出只含元数据；原始事件和故障内容分别由 diagnose raw、diagnose incident 显式导出到本机。
- 日志读取流式扫描，模板查询缓存 30 秒并合并并发冷加载；原始记录缓存上限 16 MiB。最近事件查询返回 200 条，研究查询默认最多 10000 条；完整历史保留在文件中；读取进行中的末尾不完整行会留待下次扫描，完整但损坏的行明确报错。日志当前没有自动删除策略，应由部署环境定期归档并监控磁盘空间。
- metrics 保留功能：按路由模板、HTTP 状态聚合次数、总耗时、最大耗时及平均耗时，每 10 秒保存进程累计快照到 .datalom/metrics，关闭时刷新。没有逐请求数据库插入；最多 1000 个常规指标组合，额外组合并入 other。各进程快照独立，重启归零，历史文件保留；快照不可直接相加当作增量。
- platform_cache 保留加密 SDK 缓存与研究报告；platform_sessions 中 seed/research 命名空间仍保存草稿，guest/profile 保存可用会话。


### 平台账号精简

研究缓存、游客会话和临时数据均不进入 PostgreSQL，保存在本机 `.datalom`。

platform_accounts 不保存 label、notes、reason、minIntervalMs、rateStrikes、lease、leaseUntil、nextAllowedAt，也不绑定 RoxyBrowser 字段。账号来源统一保存在 source JSON 中：可记录 roxybrowser 的来源标识，也可记录平台接口登录等其他来源；展示层的旧 profileId、workspaceId、browserNumber 仅从 source 派生。状态原因写本地 account-status 事件。请求间隔统一由 DATALOM_ACCOUNT_INTERVAL_MS 配置，默认 3000 毫秒，允许 0，启动时校验并读取；修改后需重启。逐账号间隔修改接口和后台编辑入口已移除。

租约、有效期及冷却时间复用 platform_sessions 的 lease、leaseUntil、nextAt，保证跨进程独占与过期校验。它们属于运行状态，不是逐账号配置。会话重新导入和凭证保存使用同一账号锁及版本条件；连续限流退避次数仅存在进程内存，重启清空。

代理池 `proxies` 保存 protocol、host、port、username、passwordEncrypted、checkResult 与创建/更新时间，只有 passwordEncrypted 加密。platform_accounts.proxyId 关联代理，账号表不再存 proxyCheck。相同端点、用户名和密码复用代理；密码不同创建独立记录，不覆盖其他账号配置。账号读取时注入代理给 transport，保存会话时移除 route.account 和 configured.proxyInfo，代理配置只保留一份。代理关联使用外键，仍被账号使用的代理不可删除。

代理检测使用 ipify，记录 provider、httpStatus、checkedAt、durationMs、available、data、error；data 保留渠道完整 JSON（认证字段或回显代理密码会脱敏），失败分类包括线路、网络、HTTP、无效响应和清理失败。旧检测记录原样保留，不补造历史渠道或返回数据。ipify 只验证出口地址和可达性，不能证明匿名性或代理质量。检测经关联代理执行，不直连兜底。当前没有代理池管理页面、自动轮换或第三方质量检测服务。


账号表不再保存重复的 version；现有账号读取结果中的 version 从关联的 platform_sessions 读取，用于保持会话保存接口兼容。会话重新导入只递增会话表版本。

存储加密已取消：账号 payload、代理密码及本地诊断记录使用明文 JSON/文本；历史密文仅保留兼容解码，不再产生新密文。用户登录密码继续使用随机 16 字节盐的 scrypt（32 字节派生值），JWT 签名和验证令牌/API Key 摘要保持不变。签名密钥仍保存在系统凭据库。本地历史诊断兼容读取不等于已全部转写。
