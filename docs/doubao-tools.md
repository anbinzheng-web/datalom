# 豆包工具调用格式实测 · 2026-09-17

目标：当前网页端 `POST https://www.doubao.com/chat/completion`，复用已验证的 `guest-node` 游客身份。请求全部由 Node 内置 fetch 发送，每次重新生成 a_bogus，没有浏览器参与。

| 请求格式                                                      | 真实返回                                                                                    | 工具调用         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| 网页原生请求体 + 标准 `tools`、强制 `tool_choice`             | HTTP 200，完整文本回复“抱歉，当前没有 `spider_lookup_probe` 这个可用工具，无法执行该调用。” | 无结构化工具调用 |
| 完整 OpenAI 请求体：`model/messages/tools/tool_choice/stream` | HTTP 200，SSE `STREAM_ERROR`，错误码 `710020202`，`common invalid param`                    | 请求被拒绝       |

第一项证据：`2da55b9b-f938-4016-9dbb-a5af5b0ab426`。第二项证据：`2fd8a0cf-9d98-49f7-969d-7b8737c514b2`。

完整 OpenAI 请求体使用实验性 `model: "doubao"` 和 `messages: [{role: "user", content: ...}]`；当前尚无已验证的 OpenAI model ID，错误也没有指出具体哪个字段不合法。因此结果能证明本次直接传法不可用，不能把它解读成所有内部工具能力均不存在。

测试工具为无副作用的本地值查询 `spider_lookup_probe`。每次参数包含不同的 probe_key，要求返回结构化调用并等待工具结果。没有执行任何本地工具，没有把模型的普通文本、工具名称或代码示例当作 function calling 成功。

官方缓存前端存在 `generic_tool_block`（10024）、`search_query_result_block`（10025），还存在独立的桌面工具回传路径 `/alice/office/tool_local/upload_tool_call_result`。这些是静态发现，并不证明本次游客聊天请求能注册调用方定义的工具。内置工具和这些回传接口未在本轮实测。

复现入口（每条命令发送一条真实消息）：

```sh
pnpm exec tsx src/platforms/doubao/tools/tool-probe.ts custom-tools guest-node
pnpm exec tsx src/platforms/doubao/tools/tool-probe.ts openai-format guest-node
```

原始请求/响应保存于加密诊断证据，脱敏测试摘要位于 `artifacts/doubao-node/tools-custom-tools.json` 和 `tools-openai-format.json`。测试不会改写正常 CLI 的当前对话游标。
