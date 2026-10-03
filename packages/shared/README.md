# @datalom/shared

一个 workspace 包，内部按用途分区，不提供聚合根入口。

| 子路径 | 用途 |
| --- | --- |
| `@datalom/shared/api` | server 生成的接口类型、schema 和浏览器兼容客户端 |
| `@datalom/shared/runtime/*` | 内部类型、错误、诊断与本机路径 |
| `@datalom/shared/storage/*` | PostgreSQL / Prisma、加密、Keyring 和证据存储，仅 Node 使用 |
| `@datalom/shared/brand/*` | 共享品牌资产 |

修改 API 定义后运行 `pnpm contracts:generate`，不手改 openapi.json 或生成文件。前端只导入 api/brand；api 不依赖 runtime/storage。包内使用相对引用，避免依赖方向不清。品牌图标由 scripts/sync-brand.mjs 同步到前端。
