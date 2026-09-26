# Datalom 架构与边界

## 执行面和研究面

浏览器连接器只由管理服务和研究 CLI 引用。执行代码位于 `packages/platform-*`，浏览器研究代码位于 `research/*`。生产入口 `apps/worker/src/main.ts` 的依赖图不包含 Playwright、RoxyBrowser SDK 或 CDP；架构测试检查该约束。签名在短生命周期 Node 子进程执行，输入经过 IPC，环境只保留 PATH，不传入浏览器地址、API Key 或数据库主密钥。

`PlatformAdapter.execute()` 接收明确业务参数、会话与 `Transport`，返回数据和分页。`Transport.request()` 只接受平台允许的 HTTPS 主机，拒绝自动重定向；签名后的 URL 原样发送，禁止二次 URLSearchParams 规范化。生产不接受调用者提供任意 URL、请求头、Cookie 或脚本。

服务当前使用版本化 JSON/OpenAPI 契约；Go 网关未来承接鉴权、配额、计量、账单，再调用 Datalom 内部任务接口。无须重写平台签名和解析实现。多节点阶段才迁移 PostgreSQL 与集中队列、租约；SQLite 文件不跨机器共享。

## 会话与凭据

账号按平台、工作区、Profile 唯一定位。`SessionSecret` 保存原始 Cookie 属性、平台 origin 下的 localStorage/sessionStorage/IndexedDB、配置快照、实际观测特征、代理和研究样本。浏览器 CDP 上的 Cookie 比字符串 Cookie 头保留更多语义；普通 HTTP 使用 tough-cookie 维护域、路径、hostOnly、过期、Secure 和 HttpOnly。

带 `partitionKey` 的会话及响应中的 `Partitioned` 不会被静默降级。当前返回明确研究错误，原始属性仍保留。HTTP Set-Cookie 持久化到同一会话版本，数据库 CAS 同时验证账号版本、租约 token 和有效期。

所有 SessionSecret、Roxy API Key、服务认证令牌和研究原文使用 AES-256-GCM，加密 AAD 包含记录类别及 ID，防止密文被替换到其他记录。随机主密钥保存到 OS Keyring，数据库已有而主密钥缺失时停止启动。普通 API 仅返回脱敏账号、代理地址和证据摘要；认证 Cookie 为 HttpOnly + SameSite=Strict。

账号别名和备注用于管理，不自动复制 RoxyBrowser windowRemark，避免把其中可能存在的登录凭据泄漏到列表。重新提取会话默认清空接口样本与验证状态；执行租约未释放时拒绝覆盖。

## 代理路径

```text
impit (chrome151, HTTP/3 disabled, TLS verification enabled)
  → 本机账号专属 GOST HTTP listener
  → hop 1: Clash HTTP/SOCKS endpoint
  → hop 2: Profile HTTP/HTTPS/SOCKS5 endpoint + authentication
  → TikTok HTTPS
```

每个执行中的账号租约拥有独立线路进程和连接池，池不跨账号或会话复用。两级代理仅隧道转发，不解密目标 TLS。域名通过目标代理 CONNECT/SOCKS 传递。HTTP/3 关闭，避免 UDP 绕过 TCP 链。

GOST 配置文件以 `0600` 创建，加载完成即删除；父进程通过管道维持线路守护进程，父进程退出或崩溃时管道关闭，守护进程终止 GOST。目标请求没有直连分支。出口验证必须与 Profile lastIp 基准匹配后，生产 Worker 才启用线路；基准缺失或动态 IP 改变需重新核对。

`chrome151` 是本次实验验证过的网络实现，不表示 Roxy Chromium 149/150 的所有特征已逐字节复制。通用 `chrome` preset 在对照中返回 200 空响应；明确版本后成功。真实端点兼容性与完整 TLS 指纹等价是不同结论。

## 调度与恢复

SQLite WAL + `BEGIN IMMEDIATE` 原子领取任务和账号租约。单账号串行，跨进程总租约不超过 20；账号间隔默认至少三秒。代理共享限流为每 100ms 一个起始时隙，同平台同接口为每 50ms 一个时隙，均由数据库持久化预约。实际吞吐还受平台约束，默认值不是额度承诺。

租约 60 秒、执行期间续租。任务状态为 queued/running/succeeded/failed/cancelled，账号状态为 pending/ready/cooldown/login_required/disabled。挑战或登录失效暂停该账号自动领取任务；操作员重新登录提取或明确重新验证后恢复。HTTP 429 冷却 60 秒；临时网络失败最多重试一次；业务失败不重试。

任务每页持久化结果，按评论 cid 去重。检测游标未推进/循环并停止。取消触发 AbortSignal，部分结果保留。崩溃后过期租约的 running 任务标为失败并保留已有结果，不隐藏性地重放整批；调用方可以携带已保存 cursor 继续提交。deadline 到期的排队任务也会终止。

## 签名与证据

当前 Node 实现解析并生成 X-Dynosaur 与 X-Gnarly 5.3.2；X-Bogus 在已观察版本中为标志值 `1`。采样后每个新请求都会生成新随机密钥、时间戳、请求计数、参数摘要和校验值，生产不重放旧签名。

已验证输入顺序：X-Dynosaur 对未包含 msToken/签名的原始 query 摘要；X-Gnarly 对加入 X-Dynosaur 和 msToken 后的原始 query 摘要。字段 8 在该页面会话中是稳定环境字段，不能当成当前时间重新生成。字段 53 保留原始二进制，不尝试有损转码。

签名器首先验证捕获 query 与原签名中的摘要一致，再生成新请求；不认识的版本/字段布局明确返回 RESEARCH_REQUIRED。研究证据包括原始请求响应、脚本来源与 SHA-256、AST 分析和失败下一步，全部加密。

## 首版扩展点

- `PlatformAdapter`：输入规范化、签名、响应解析、分页语义。
- `Transport`：替换 HTTP 库或定制 TLS/HTTP2 实现，不改变业务调用。
- `SessionProvider`：本地加密数据库可替换为集中存储和短期会话租约。
- 任务结果保留 adapterVersion，升级前用真实样本回归；当前代码版本回退同时保留旧证据，不修改历史结果。

未实现云端多租户、计费、自动凭据更新或无限平台适配。后续容量验证需覆盖长期运行、跨网络区域和实际账号限制，再制定可售卖的服务等级。

工程包边界、构建和跨语言接入见 [monorepo 指南](monorepo.md)。
