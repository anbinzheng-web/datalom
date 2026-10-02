# Datalom

Node.js / TypeScript 的平台协议研究与独立 HTTP 执行项目，使用 pnpm workspace。官网在 `apps/web`，内部管理后台在 `apps/admin-web`，API 在 `apps/server`。Worker 当前仅保留独立进程与心跳。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

构建使用 `pnpm build`；各应用的启动和检查命令以其 package.json 为准。GOST 安装入口为 `pnpm gost:install`，Roxy 配置位于 `scripts/config/roxy.json`。本机数据及报告默认保存于 `.datalom`。

- [项目架构与开发约定](AGENTS.md)
- [架构专题与文档索引](docs/architecture.md)
- [数据集存储决策](docs/data-storage.md)
- 平台研究经验：[TikTok](packages/platform-tiktok/research/README.md)、[Facebook](packages/platform-facebook/research/README.md)、[Instagram](packages/platform-instagram/research/README.md)、[X](packages/platform-x/research/README.md)、[豆包](packages/platform-doubao/research/README.md)

研究文档记录协议经验和历史验证边界，不承诺当前线上可用性；当前路由和实现以 server 与平台源码为准。
