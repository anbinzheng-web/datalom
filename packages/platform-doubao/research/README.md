# 豆包协议经验

历史验证基线为 2026-09：已有成功游客身份下，Node 新建对话、跨进程续聊和 Token 延续曾成功；从零建立可聊天游客身份未解决。不要把历史账号、会话名或证据 ID 当作其他环境可用配置。

- `../src/signer.ts` 在 Node VM 执行固定哈希官方 BDMS，由 linkedom 提供 DOM 兼容对象；HTTP 使用 Node fetch。它是受控官方 SDK 运行，不是已完整重写签名算法。
- 每次生成新消息 ID、时间、唯一键和 a_bogus。修改请求参数后须重签，SDK 哈希变化拒绝沿用旧适配。
- HTTP 200、限流预检 `is_limit=false` 均不证明聊天成功。必须解析 SSE 业务错误，并取得非空回答和最终 `SSE_REPLY_END(end_type=3)`；处理任意字节切分和 UTF-8 边界。
- 续聊依赖服务端对话 ID、消息位置和 Token。候选 Token 验证后才替换持久状态；失败保留部分正文和原始错误。
- 从历史 Cookie header 导入无法恢复完整过期属性。已有游客续聊成功不能证明冷启动、自动登录或 Token 全生命周期稳定。
- OpenAI 风格 `model/messages/tools/tool_choice/stream` 请求曾返回 `710020202 common invalid param`；不能声称兼容工具调用或透传 OpenAI 请求。

CLI：`pnpm doubao:node import-session <name> <evidenceId>` 导入已有成功游客证据；`sign-check <name>` 验证签名（缓存缺失可能下载 SDK）；`chat <name> --new <text>` 会实际发送消息。研究和聊天均按用户授权执行，不自动反复发送来探测风控。

## 来源与许可证

- 官方公开脚本：`https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/chat/static/js/async/bdms-sdk.f36aabd9.js`。SHA-256：`ceac08af90a0ad7690473b42c421433756f112bfb8a28f611718e0c32446387c`。首次下载后加密缓存于本机，不把官方混淆源码作为项目源码分发。
- `signer.ts` 在 Node `vm` 内执行该固定版本；`linkedom` 提供 DOM 兼容对象，并截获 SDK 的网络和计时器。它不同于 X 的只解析 HTML 用法。项目未宣称拥有该官方脚本版权或已经逐行重写其算法。
- HTTP 由 Node 内置 `fetch` 发出。Node 运行、新鲜签名、新建对话与续聊已实测，初始身份来源和冷启动限制见上文。
