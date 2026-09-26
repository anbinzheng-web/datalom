import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CookieJar } from "tough-cookie";
import { openStore } from "@datalom/storage-node/runtime";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { DatalomError } from "@datalom/runtime-node/contracts";
import { inspectDoubaoStream } from "@datalom/platform-doubao/protocol";
import {
  DoubaoSessions,
  assertGuestJar,
  type DoubaoSession,
} from "@datalom/platform-doubao/session";
import {
  DoubaoNative,
  createNodeGuest,
  loadDoubaoSDK,
  conversationFromStream,
  sha256,
} from "@datalom/platform-doubao/native";
import { DOUBAO_SDK_SHA256 } from "@datalom/platform-doubao/signer";

const argv = process.argv.slice(2);
if (argv[0] === "--") argv.shift();
const [command, id, ...args] = argv;
const store = openStore();
const sessions = new DoubaoSessions(store);
const abort = new AbortController();
const onInterrupt = () => abort.abort();
process.once("SIGINT", onInterrupt);
let lease: string | undefined;
try {
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    throw new DatalomError(
      "INVALID_INPUT",
      "用法：doubao:node <init|import-session|status|chat|refresh-token|sign-check> <session-id> [参数]",
    );
  if (command === "import-session") {
    const evidenceId = args[0];
    if (!evidenceId)
      throw new DatalomError(
        "INVALID_INPUT",
        "import-session 需要已有成功游客请求的 evidenceId",
      );
    const raw = store.diagnostics.rawEvent(evidenceId) as any;
    const url = new URL(raw.url);
    if (
      url.origin !== "https://www.doubao.com" ||
      url.pathname !== "/chat/completion" ||
      !inspectDoubaoStream(raw.status, raw.body).success
    )
      throw new DatalomError("INVALID_INPUT", "只能导入已有成功豆包对话证据");
    if (!raw.headers?.cookie || !raw.headers?.["user-agent"])
      throw new DatalomError(
        "INVALID_INPUT",
        "证据缺少会话 Cookie 或 User-Agent",
      );
    const jar = new CookieJar();
    for (const pair of raw.headers.cookie.split(/;\s*/))
      jar.setCookieSync(`${pair}; Path=/; Secure`, url.origin);
    assertGuestJar(jar);
    url.searchParams.delete("a_bogus");
    const session: DoubaoSession = {
      id,
      createdAt: Date.now(),
      provenance: "captured-guest",
      seedEvidenceId: evidenceId,
      userAgent: raw.headers["user-agent"],
      params: Object.fromEntries(url.searchParams),
      cookieJar: jar.serializeSync()!,
      conversation: conversationFromStream(raw.body),
    };
    sessions.create(session);
    console.log(
      JSON.stringify({
        status: "imported",
        session: id,
        browserUsed: false,
        sessionOrigin: session.provenance,
        note: "导入历史游客身份；尚未验证此 Node 会话",
      }),
    );
  } else {
    if (command === "init" && !sessions.exists(id))
      sessions.create(await createNodeGuest(store, id));
    const acquired = sessions.acquire(id);
    lease = acquired.lease;
    const { session } = acquired;
    if (command === "status") {
      console.log(
        JSON.stringify({
          session: id,
          sessionOrigin: session.provenance,
          createdAt: session.createdAt,
          lastSuccessAt: session.lastSuccessAt ?? null,
          lastResult: session.lastResult ?? null,
          tokenUpdatedAt: session.tokenUpdatedAt ?? null,
          candidateTokenResult: session.candidateTokenResult ?? null,
          conversationPresent: !!session.conversation,
          browserUsed: false,
          sdkSha256: DOUBAO_SDK_SHA256,
        }),
      );
    } else {
      const client = new DoubaoNative(
        store,
        session,
        await loadDoubaoSDK(store),
        () => sessions.save(session, lease!),
      );
      if (command === "init" || command === "refresh-token") {
        const result = await client.refreshToken();
        console.log(
          JSON.stringify({
            status: "initialized",
            session: id,
            sessionOrigin: session.provenance,
            browserUsed: false,
            chatVerified: !!session.lastSuccessAt,
            ...result,
          }),
        );
      } else if (command === "chat") {
        let newConversation = false,
          candidateToken = false;
        while (args[0]?.startsWith("--")) {
          const option = args.shift();
          if (option === "--new") newConversation = true;
          else if (option === "--candidate-token") candidateToken = true;
          else throw new DatalomError("INVALID_INPUT", "未知聊天选项");
        }
        const prompt = args.join(" ");
        const { report, answer } = await client.chat(prompt, {
          newConversation,
          candidateToken,
          signal: abort.signal,
        });
        mkdirSync("artifacts/doubao-node", { recursive: true });
        writeFileSync(
          `artifacts/doubao-node/${id}-last-run.json`,
          JSON.stringify(report, null, 2),
        );
        console.log(JSON.stringify({ ...report, answer }));
        if (!report.success) process.exitCode = 1;
      } else if (command === "sign-check") {
        const url = `https://www.doubao.com/chat/completion?${new URLSearchParams(session.params)}`;
        const a = new URL(
          await client.signer.sign(url, '{"check":1}'),
        ).searchParams.get("a_bogus")!;
        const b = new URL(
          await client.signer.sign(url, '{"check":2}'),
        ).searchParams.get("a_bogus")!;
        if (a === b)
          throw new DatalomError("RESEARCH_REQUIRED", "签名未随新请求变化");
        console.log(
          JSON.stringify({
            status: "passed",
            browserUsed: false,
            signerNetworkUsed: false,
            chatSent: false,
            source: "official-bdms-in-node-vm",
            signatureLengths: [a.length, b.length],
            signatureHashes: [sha256(a), sha256(b)],
          }),
        );
      } else throw new DatalomError("INVALID_INPUT", "未知豆包 Node 命令");
    }
  }
} catch (error) {
  const evidenceId = store.diagnostics.event(
    { requestId: randomUUID() },
    "doubao-node-cli",
    "failed",
    errorRecord(error),
  );
  console.error(
    JSON.stringify({
      status: "failed",
      evidenceId,
      code: error instanceof DatalomError ? error.code : "INTERNAL",
      message:
        error instanceof DatalomError
          ? error.message
          : "Node 执行失败；详情已保存为加密证据",
    }),
  );
  process.exitCode = 1;
} finally {
  if (lease) sessions.release(id, lease);
  process.removeListener("SIGINT", onInterrupt);
  store.close();
}
