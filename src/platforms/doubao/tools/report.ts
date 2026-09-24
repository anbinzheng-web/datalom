import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { openStore } from "../../../core/runtime.ts";
import {
  doubaoErrors,
  inspectDoubaoStream,
  parseDoubaoLimit,
} from "../protocol.ts";
const store = openStore();
const publicStreamResult = (status: number, body: string) => {
  const result = inspectDoubaoStream(status, body);
  if (!result.success) return result;
  const { answer, conversationId, messageId, ...safe } = result;
  return {
    ...safe,
    answerLength: answer.length,
    answerSha256: createHash("sha256").update(answer).digest("hex"),
    conversationIdPresent: !!conversationId,
    messageIdPresent: !!messageId,
  };
};
try {
  const rows = store.sql
    .prepare(
      "SELECT id,requestId,createdAt,stage FROM diagnostic_events WHERE stage IN ('doubao-http','doubao-reference','doubao-roxy-guest-http','doubao-independent-limit') AND outcome IN ('received','imported') ORDER BY seq DESC",
    )
    .all() as any[];
  let chat: any, successfulBaseline: any, precheck: any;
  for (const row of rows) {
    const raw = store.diagnostics.rawEvent(row.id) as any;
    if (raw.url && new URL(raw.url).pathname === "/chat/completion") {
      const result: any = publicStreamResult(raw.status, raw.body);
      const entry = {
        evidenceId: row.id,
        runId: row.requestId,
        capturedAt: row.createdAt,
        endpoint: "POST https://www.doubao.com/chat/completion",
        queryKeys: [...new URL(raw.url).searchParams.keys()],
        requestKeys: Object.keys(JSON.parse(raw.requestBody)),
        result,
      };
      if (!successfulBaseline && result.success) successfulBaseline = entry;
      if (!chat && !result.success) chat = entry;
      // Chromium decoded this SSE error using Windows-1252 in the observed
      // capture. Keep the original evidence unchanged; mark the display repair.
      if (entry.result.rawMessage) {
        const decode = new TextDecoder("windows-1252");
        const inverse = new Map(
          Array.from({ length: 256 }, (_, byte) => [
            decode.decode(Uint8Array.of(byte)),
            byte,
          ]),
        );
        const bytes = [...entry.result.rawMessage].map((c) => inverse.get(c));
        if (bytes.every((byte) => byte !== undefined)) {
          try {
            entry.result.displayMessage = new TextDecoder("utf-8", {
              fatal: true,
            }).decode(Uint8Array.from(bytes as number[]));
            entry.result.displayRepair =
              "windows-1252-to-utf8; original retained";
          } catch {}
        }
      }
    }
    if (!precheck && row.stage === "doubao-independent-limit")
      precheck = {
        evidenceId: row.id,
        runId: row.requestId,
        capturedAt: row.createdAt,
        browserUsed: false,
        direct: true,
        result: parseDoubaoLimit(raw.status, raw.body),
      };
    if (chat && successfulBaseline && precheck) break;
  }
  if (!chat || !successfulBaseline || !precheck)
    throw new Error("Missing live evidence; report cannot claim verification");
  const source = store.sql
    .prepare(
      "SELECT id FROM diagnostic_events WHERE stage='doubao-script' AND outcome='captured' ORDER BY seq",
    )
    .all() as any[];
  const references = source.flatMap((row) => {
    const raw = store.diagnostics.rawEvent(row.id) as any;
    return /chat\.42382d60\.js|s1-chat-runtime-after-visible\.d35beec7\.js/.test(
      raw.url,
    )
      ? [{ evidenceId: row.id, url: raw.url, sha256: raw.sha256 }]
      : [];
  });
  const nodeResults = (
    store.sql
      .prepare(
        "SELECT id FROM diagnostic_events WHERE stage='doubao-node-result' ORDER BY seq DESC",
      )
      .all() as any[]
  ).map((row) => store.diagnostics.rawEvent(row.id) as any);
  const nodeSuccess = nodeResults.find(
    (r) => r.success && r.browserUsed === false,
  );
  const coldSuccess = nodeResults.find(
    (r) => r.success && r.sessionOrigin === "node-bootstrap",
  );
  const report = {
    platform: "doubao",
    generatedAt: new Date().toISOString(),
    status: nodeSuccess
      ? "node_chat_verified_with_existing_guest"
      : "browser_guest_executor_verified",
    productionReady: false,
    browserBackedGuestReady: true,
    browserlessReady: !!nodeSuccess,
    browserlessSessionBootstrapReady: !!coldSuccess,
    browserlessScope: nodeSuccess
      ? "Node runtime, fresh a_bogus, existing guest seed; cold-start guest not verified"
      : null,
    nodeSuccessfulBaseline: nodeSuccess ?? null,
    nodeLatestResult: nodeResults[0] ?? null,
    nodeColdStart: store.getSetting("doubao-node-cold-start-status") ?? null,
    browserPolicy:
      "headless-default; explicitly requested headed CDP experiments minimize the window",
    chat,
    successfulBaseline,
    precheck,
    errorCodes: doubaoErrors,
    references,
    conclusions: [
      "真实网页对话请求返回 SharkBlock",
      "同一接口已在用户提供的 RoxyBrowser 游客会话中取得完整成功 SSE",
      "游客执行器发送前拒绝账号 Cookie，并验证页面显示游客态登录入口",
      "连续成功请求的 a_bogus 均存在且发生变化，由豆包官方页面动态生成",
      "成功流由 STREAM_MSG_NOTIFY、STREAM_CHUNK、CHUNK_DELTA 和三级 SSE_REPLY_END 组成",
      "独立直连的消息限流预检返回未限流",
      "前端区分风控、频率、游客额度及地区错误",
      "浏览器游客执行器可用，但不等于独立签名或生产对话适配器已经完成",
      ...(nodeSuccess
        ? [
            "新增 Node VM 执行固定哈希的官方 BDMS，动态生成新 a_bogus；通过 Node 内置 fetch 取得完整回答",
            "Node 端新建会话、跨进程续聊和携带原 xmst 的 Token 刷新已经实测",
            "此成功路径的初始身份来自历史游客证据；全新游客冷启动仍未打通",
          ]
        : []),
    ],
    unconfirmed: [
      "具体风控触发因素",
      "是否按 IP、指纹、会话或组合策略计算",
      "游客额度的次数、时间窗口及重置规则",
      ...(nodeSuccess
        ? ["全新游客身份的无浏览器冷启动", "长时间运行和 Token 过期恢复"]
        : ["新动态签名的独立生成与浏览器外成功对话"]),
    ],
    nextExperiment: nodeSuccess
      ? "沿用同一 Node 冷启动身份，检查 BDMS 初始化和设备数据；不轮换身份重试。补充长时间 Token 刷新验证。"
      : "以成功浏览器样本为基线，对照失败会话的 Cookie 集、请求字段和出口，再验证浏览器外的新鲜动态签名",
  };
  store.diagnostics.event(
    { requestId: randomUUID() },
    "doubao-diagnosis",
    nodeSuccess ? "node-runtime-verified" : "browser-guest-verified",
    report,
    "RESEARCH_REQUIRED",
  );
  store.setSetting("doubao-research-status", report);
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/doubao-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      chatError: chat.result.clientErrorName,
      successfulBaseline: true,
      independentPrecheck: true,
      path: "artifacts/doubao-report.json",
    }),
  );
} finally {
  store.close();
}
