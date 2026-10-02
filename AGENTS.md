# 项目架构与开发约定

本文件是项目架构的总入口。修改前读取相关应用/包源码和 package.json；专题细节按需查阅 [docs](docs/architecture.md)。平台研究先读对应 `packages/platform-*/research/README.md`。以当前代码为事实来源，不把历史成功、设计方向或存储模型当成已上线功能。

官网视觉规范见 [docs/visual-guidelines.md](docs/visual-guidelines.md)。修改官网、组件或营销文案前必须遵守该文档；特别是链接文案不得擅自添加 `↗`、`↖` 等外链箭头符号。

## 架构总览

项目使用 Node.js / TypeScript 与 pnpm workspace。API、官网、管理后台和 Worker 保持独立应用边界；平台实现通过共享包复用。

| 位置                           | 职责                                                                    |
| ------------------------------ | ----------------------------------------------------------------------- |
| `apps/server`                  | NestJS API、认证、账号管理与平台请求；旧 Fastify 路由由 legacy 模块接入 |
| `apps/web`                     | Next.js 官网、文档展示和用户入口                                        |
| `apps/admin-web`               | React + Ant Design 内部管理后台                                         |
| `apps/worker`                  | 独立进程边界；当前仅心跳，不领取或执行任务                              |
| `packages/platform-*/src`      | 平台协议、签名、解析和独立 HTTP 实现                                    |
| `packages/platform-*/research` | 独立 `@datalom/research-*` workspace，浏览器采样、分析及研究 CLI        |
| `packages/platform-runtime`    | 多平台执行中复用的传输、账号及协议基础能力                              |
| `packages/shared`              | 共享资产、生成 API、内部 runtime 和 storage；按子路径分区               |
| `packages/network-node`        | 账号代理线路、Cookie 和网络检测                                         |
| `scripts`                      | 构建、自动化、配置和跨包检查                                            |

研究包依赖平台实现；平台生产入口不依赖研究包、Playwright、Roxy SDK 或 CDP。目录放在一起不改变依赖方向。平台能力由 server 的模块和具体执行器决定，账号能保存不代表该平台全部接口已接通。存储层存在旧队列模型也不代表 Worker 已执行这些任务。

shared 不提供聚合根入口：前端仅引用 `@datalom/shared/api` 和品牌资源；Node 实现引用 `@datalom/shared/runtime/*`、`@datalom/shared/storage/*`。API 模块不得导入 storage/runtime，避免把原生依赖带入浏览器。合包后依赖统一安装，运行时仍按子路径加载。

跨包使用声明了 `workspace:*` 依赖的 `@datalom/...` 导出，包内使用相对路径。通用能力在已有基础包中复用；不要把平台特有逻辑放进通用包，也不要为未使用的语言或服务预建空框架。

server 拥有 API 定义，shared/api 只接收生成产物；controller 负责协议适配，服务负责业务编排，平台包负责原站协议。本机管理认证与公开 API Key 分离。

本机会话和证据由 storage 管理；网络请求沿用账号代理和平台 transport。配置位于 Git 跟踪的 `scripts/config/roxy.json`；本机数据默认 `.datalom`，报告通过 `artifactPath()` 定位，禁止依赖当前工作目录。共享资源放 packages，构建与自动化放 scripts。

平台研究包保持 `@datalom/research-*` 导出兼容。web 使用 Next.js + React + TypeScript + Tailwind CSS，复用现有组件和设计 token；普通样式直接写在 JSX 的 Tailwind 工具类中，不以原生 CSS 或成组 `@apply` 选择器代替。原生 CSS 仅用于复杂动画、复杂视觉效果和必要的全局基础定义，详细边界见官网视觉规范。admin-web 复用 Ant Design；共享品牌资产只改 packages/shared/brand。

## 实现要求

- server 拥有接口定义；更新接口后生成 shared/api，不手改生成产物。核对实现路由和 OpenAPI 一致。
- 沿用平台的账号、会话、代理和 transport 边界，不增加直连兜底。保留 Cookie 语义、会话版本及租约校验。
- 签名输入保持原始字节及参数顺序。原站协议变化先采样对照；未知版本、业务错误和分页异常明确失败，不伪造空成功。
- 保留失败证据；日志和普通报告不输出 Cookie、Token、代理密码或原始认证请求。第三方代码保留许可证与来源。
- 保留工作区已有改动；不为目录整理改写无关业务，不新增未经需要的抽象或平台空壳。

## 验证与交付

- 按影响运行相关包的 check/build；目录、导出或依赖调整须验证源码与编译后入口。生产依赖变化运行 `scripts/checks/architecture.test.ts`。
- 接口变化运行契约一致性与对应 server 验收。选择能发现实际回归的检查，不为简单移动或复刻实现增加单元测试。
- 离线解析、模拟响应通过不等于真实平台成功。真实账号请求、聊天和浏览器关闭/恢复须在用户授权范围内执行。
- 报告说明改动、验证和未解决问题；不能把已有失败写成通过。

## 文档边界

`AGENTS.md` 维护架构总览、依赖方向和 coding agent 必须遵守的开发约定。`docs` 按需记录细分设计、决策理由、专题说明及其他长期有用的资料，不重复维护总览；专题入口见 [文档索引](docs/architecture.md)。

平台协议经验放对应 research/README.md；应用局部约定放应用 README。文档以帮助理解、实现和维护为目的，不要求每次改动都新增文档。避免逐次运行流水账、测试数量、截图清单和重复接口表；机器产物放本机数据目录，当前接口清单由 server 生成。规划须明确标注尚未实现，架构变化时更新本文件及受影响专题。
