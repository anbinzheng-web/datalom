import { createHash, randomUUID } from "node:crypto";
import { parseHTML } from "linkedom";
import { CookieJar } from "tough-cookie";
import { DatalomError } from "@datalom/runtime-node/contracts";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import type { Store } from "@datalom/storage-node/store";
import {
  inspectDoubaoStream,
  parseDoubaoSSE,
  type DoubaoEvent,
} from "./protocol.ts";
import {
  DoubaoSigner,
  DOUBAO_SDK_URL,
  DOUBAO_SDK_SHA256,
  DOUBAO_USER_AGENT,
  verifyDoubaoSDK,
} from "./signer.ts";
import {
  assertGuestJar,
  type DoubaoConversation,
  type DoubaoSession,
} from "./session.ts";

export const DOUBAO_ORIGIN = "https://www.doubao.com";
const PAGE = `${DOUBAO_ORIGIN}/chat/`;
export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

export async function loadDoubaoSDK(store: Store): Promise<string> {
  const cached = store.getSetting<{ source: string }>(
    `doubao-sdk:${DOUBAO_SDK_SHA256}`,
  );
  if (cached) {
    verifyDoubaoSDK(cached.source);
    return cached.source;
  }
  const response = await fetch(DOUBAO_SDK_URL, {
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok)
    throw new DatalomError("NETWORK", `BDMS 下载失败 HTTP ${response.status}`);
  const source = await response.text();
  verifyDoubaoSDK(source);
  store.setSetting(`doubao-sdk:${DOUBAO_SDK_SHA256}`, {
    url: DOUBAO_SDK_URL,
    source,
    downloadedAt: Date.now(),
  });
  return source;
}

// Exact character layout observed in s2-security-verify.a34be21a.js. Created
// once per saved guest; not regenerated on rejection or quota exhaustion.
export function createDoubaoFingerprint() {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const chars = Array.from({ length: 36 }, (_, i) => {
    if ([8, 13, 18, 23].includes(i)) return "_";
    if (i === 14) return "4";
    const value = Math.floor(Math.random() * alphabet.length);
    return alphabet[i === 19 ? (value & 3) | 8 : value];
  });
  return `verify_${Date.now().toString(36)}_${chars.join("")}`;
}

export function parseDoubaoBootstrap(html: string) {
  const { document } = parseHTML(html);
  const script = [...document.querySelectorAll("script")].find((s) =>
    /^window\._ROUTER_DATA\s*=/.test(s.textContent ?? ""),
  );
  if (!script?.textContent)
    throw new DatalomError("SCHEMA_CHANGED", "豆包页面缺少初始化数据");
  // Parse data only: never execute page scripts or an inline assignment.
  let data: any;
  try {
    data = JSON.parse(
      script.textContent
        .replace(/^window\._ROUTER_DATA\s*=\s*/, "")
        .replace(/;\s*$/, ""),
    );
  } catch {
    throw new DatalomError("SCHEMA_CHANGED", "豆包初始化数据不是预期 JSON");
  }
  const layout = data?.loaderData?.chat_layout?.chat_layout;
  if (
    layout?.aid !== 497858 ||
    typeof layout?.pc_version !== "string" ||
    typeof layout?.launchCore?.web_id !== "string"
  )
    throw new DatalomError("SCHEMA_CHANGED", "豆包初始化字段发生变化");
  return {
    aid: layout.aid as number,
    version: layout.pc_version as string,
    deviceId: layout.launchCore.web_id as string,
  };
}

export function buildDoubaoMessage(
  prompt: string,
  conversation?: DoubaoConversation,
) {
  if (!prompt.trim()) throw new DatalomError("INVALID_INPUT", "消息不能为空");
  const now = Date.now();
  const init = { need_ack_conversation: true };
  const task = {
    runtime_type: 0,
    agent_task_param: {},
    agent_task_param_change: {
      runtime_changed: false,
      device_changed: false,
      sandbox_auth_type_changed: false,
    },
    project_id: "",
    need_modify_conversation: false,
  };
  return {
    client_meta: {
      ...(!conversation
        ? {
            local_conversation_id: `local_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          }
        : {}),
      conversation_id: conversation?.id ?? "",
      bot_id: "7338286299411103781",
      last_section_id: conversation?.sectionId ?? "",
      last_message_index: conversation?.lastMessageIndex ?? null,
      local_permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
      ].map((permission_name) => ({ permission_name, status: 3 })),
    },
    messages: [
      {
        local_message_id: randomUUID(),
        content_block: [
          {
            block_type: 10000,
            content: {
              text_block: {
                text: prompt,
                icon_url: "",
                icon_url_dark: "",
                summary: "",
              },
              pc_event_block: "",
            },
            block_id: randomUUID(),
            parent_id: "",
            meta_info: [],
            append_fields: [],
          },
        ],
        message_status: 0,
      },
    ],
    option: {
      send_message_scene: "",
      create_time_ms: now,
      collect_id: "",
      is_audio: false,
      answer_with_suggest: false,
      agent_mode: 2,
      tts_switch: false,
      need_deep_think: 0,
      click_clear_context: false,
      from_suggest: false,
      is_regen: false,
      is_replace: false,
      is_from_click_option: false,
      is_from_click_softlink: false,
      disable_sse_cache: false,
      select_text_action: "",
      is_select_text: false,
      resend_for_regen: false,
      scene_type: 0,
      unique_key: randomUUID(),
      start_seq: 0,
      need_create_conversation: !conversation,
      ...(!conversation
        ? {
            conversation_init_option: init,
            conversation_init_ext: {
              model_item_key: "0",
              reasoning_effort: "3",
              mode_id: "1",
            },
          }
        : {}),
      regen_query_id: [],
      edit_query_id: [],
      regen_instruction: "",
      no_replace_for_regen: false,
      message_from: 0,
      shared_app_name: "",
      shared_app_id: "",
      sse_recv_event_options: { support_chunk_delta: true },
      support_lazy_fetch_stream: true,
      is_ai_playground: false,
      is_old_user: false,
      general_task_param: task,
      recovery_option: {
        is_recovery: false,
        req_create_time_sec: Math.floor(now / 1000),
        append_sse_event_scene: 0,
      },
      message_storage_type: 0,
      related_deleted_message_ids: {},
      connector_info_list: [],
      model_config: {
        model_item_key: "0",
        model_extra_params: {},
        reasoning_effort: 3,
      },
      aggregate_params: {
        mention_skill_list: "[]",
        mention_plugin_list: "[]",
        mention_ext: "[{}]",
        conversation_mode: "",
        mode_id: "1",
        model_item_key: "0",
        agent_mode: "2",
        reasoning_effort: "3",
        provider_id: "",
      },
    },
    user_context: [],
    ext: {
      agent_mode: "2",
      use_deep_think: "0",
      general_task_param: JSON.stringify(task),
      collection_id: "",
      is_finish: "1",
      commerce_credit_config_enable: "0",
      ...(!conversation
        ? { conversation_init_option: JSON.stringify(init) }
        : {}),
    },
  };
}

export function conversationFromStream(
  body: string,
): DoubaoConversation | undefined {
  let id = "",
    sectionId = "",
    lastMessageIndex = 0;
  for (const event of parseDoubaoSSE(body)) {
    const d = event.data as any;
    if (event.event === "SSE_ACK") {
      id = d?.ack_client_meta?.conversation_id ?? id;
      sectionId = d?.ack_client_meta?.section_id ?? sectionId;
      for (const q of d?.query_list ?? [])
        if (Number.isSafeInteger(q.message_index))
          lastMessageIndex = Math.max(lastMessageIndex, q.message_index);
    }
    if (event.event === "FULL_MSG_NOTIFY") {
      id = d?.message?.conversation_id ?? id;
      sectionId = d?.message?.section_id ?? sectionId;
      if (Number.isSafeInteger(d?.message?.index_in_conv))
        lastMessageIndex = Math.max(lastMessageIndex, d.message.index_in_conv);
    }
    if (
      event.event === "SSE_REPLY_END" &&
      Number.isSafeInteger(d?.msg_finish_attr?.badge_count)
    )
      lastMessageIndex = Math.max(
        lastMessageIndex,
        d.msg_finish_attr.badge_count,
      );
  }
  return id && sectionId && lastMessageIndex > 0
    ? { id, sectionId, lastMessageIndex }
    : undefined;
}

// Stops on a complete end_type=3 event rather than waiting for the TCP socket
// to close. UTF-8 and SSE separators can span arbitrary network chunks.
export async function readDoubaoBody(
  response: Response,
  onEvent?: (event: DoubaoEvent) => void,
) {
  if (!response.body)
    throw new DatalomError("SCHEMA_CHANGED", "豆包响应没有正文");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "",
    pending = "",
    bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        body += decoder.decode();
        return body;
      }
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024)
        throw new DatalomError("SCHEMA_CHANGED", "豆包响应超过 8 MiB 限制");
      const text = decoder.decode(value, { stream: true });
      body += text;
      pending += text;
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(pending))) {
        const block = pending.slice(0, separator.index);
        pending = pending.slice(separator.index + separator[0].length);
        for (const event of parseDoubaoSSE(block)) {
          onEvent?.(event);
          if (
            event.event === "SSE_REPLY_END" &&
            (event.data as any)?.end_type === 3
          ) {
            await reader.cancel();
            return body;
          }
        }
      }
    }
  } catch (error) {
    throw new DatalomError(
      error instanceof DatalomError ? error.code : "NETWORK",
      "豆包流读取未完成，已保留部分正文",
      { cause: { body, bytes, error: errorRecord(error) } },
    );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class DoubaoNative {
  readonly jar: CookieJar;
  readonly signer: DoubaoSigner;
  constructor(
    private store: Store,
    readonly session: DoubaoSession,
    private source: string,
    private save: () => void,
  ) {
    this.jar = CookieJar.deserializeSync(session.cookieJar);
    assertGuestJar(this.jar);
    this.signer = new DoubaoSigner(
      source,
      session.userAgent,
      this.jar,
      session.params.msToken,
    );
  }
  private persist() {
    this.session.cookieJar = this.jar.serializeSync()!;
    this.save();
  }
  private headers(url: string) {
    return {
      "user-agent": this.session.userAgent,
      "content-type": "application/json",
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      origin: DOUBAO_ORIGIN,
      referer: PAGE,
      "agw-js-conv": "str",
      cookie: this.jar.getCookieStringSync(url),
    };
  }
  private async request(
    stage: string,
    url: string,
    body?: string,
    onEvent?: (event: DoubaoEvent) => void,
    signal?: AbortSignal,
  ) {
    const runId = randomUUID();
    const headers = this.headers(url);
    const deadline = AbortSignal.timeout(90000);
    this.store.diagnostics.event({ requestId: runId }, stage, "started", {
      url,
      method: body === undefined ? "GET" : "POST",
      headers,
      requestBody: body,
      browserUsed: false,
      transport: "node-fetch",
      sdkSha256: DOUBAO_SDK_SHA256,
      sessionOrigin: this.session.provenance,
    });
    try {
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body,
        redirect: "error",
        signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
      });
      const setCookies = response.headers.getSetCookie();
      for (const cookie of setCookies) this.jar.setCookieSync(cookie, url);
      const token = response.headers.get("x-ms-token");
      if (token) {
        this.session.candidateMsToken = token;
        this.session.candidateTokenAt = Date.now();
        this.session.candidateTokenResult = "unverified";
      }
      this.persist();
      const text = response.headers
        .get("content-type")
        ?.includes("text/event-stream")
        ? await readDoubaoBody(response, onEvent)
        : await response.text();
      const evidenceId = this.store.diagnostics.event(
        { requestId: runId },
        stage,
        "received",
        {
          url,
          requestBody: body,
          status: response.status,
          responseHeaders: Object.fromEntries(response.headers),
          setCookies,
          body: text,
          browserUsed: false,
          transport: "node-fetch",
        },
      );
      assertGuestJar(this.jar);
      return { response, text, evidenceId, runId };
    } catch (error) {
      const evidenceId = this.store.diagnostics.event(
        { requestId: runId },
        stage,
        "failed",
        errorRecord(error),
      );
      throw new DatalomError(
        signal?.aborted
          ? "CANCELLED"
          : deadline.aborted
            ? "DEADLINE"
            : error instanceof DatalomError
              ? error.code
              : "NETWORK",
        `豆包 Node 请求失败，证据 ${evidenceId}`,
        { cause: error },
      );
    }
  }
  async refreshToken() {
    // Use a fresh SDK context for the one explicit token request; no background
    // reporting loop, no automatic replay of failed chat requests.
    const request = await new DoubaoSigner(
      this.source,
      this.session.userAgent,
      this.jar,
      this.session.params.msToken,
    ).tokenRequest();
    const result = await this.request(
      "doubao-node-token",
      request.url,
      request.body,
    );
    if (
      result.response.status !== 200 ||
      !result.response.headers.get("x-ms-token")
    )
      throw new DatalomError(
        "RESEARCH_REQUIRED",
        `豆包 Token 刷新未成功，证据 ${result.evidenceId}`,
      );
    return {
      evidenceId: result.evidenceId,
      candidateTokenReceived: true,
      tokenUsabilityVerified: false,
    };
  }
  async chat(
    prompt: string,
    options: {
      newConversation?: boolean;
      candidateToken?: boolean;
      onEvent?: (event: DoubaoEvent) => void;
      signal?: AbortSignal;
    } = {},
  ) {
    assertGuestJar(this.jar);
    if (options.signal?.aborted)
      throw new DatalomError("CANCELLED", "请求已取消");
    const body = JSON.stringify(
      buildDoubaoMessage(
        prompt,
        options.newConversation ? undefined : this.session.conversation,
      ),
    );
    const query = new URLSearchParams(this.session.params);
    query.delete("a_bogus");
    if (options.candidateToken) {
      if (!this.session.candidateMsToken)
        throw new DatalomError(
          "INVALID_INPUT",
          "没有待验证 Token，请先 refresh-token",
        );
      query.set("msToken", this.session.candidateMsToken);
    }
    const url = await this.signer.sign(
      `${DOUBAO_ORIGIN}/chat/completion?${query}`,
      body,
    );
    const response = await this.request(
      "doubao-node-chat",
      url,
      body,
      options.onEvent,
      options.signal,
    );
    const result = inspectDoubaoStream(response.response.status, response.text);
    this.session.lastResult = result.classification;
    if (options.candidateToken)
      this.session.candidateTokenResult = result.classification;
    if (result.success) {
      if (options.candidateToken) {
        this.session.params.msToken = query.get("msToken")!;
        this.session.tokenUpdatedAt = Date.now();
      }
      this.session.lastSuccessAt = Date.now();
      const conversation = conversationFromStream(response.text);
      // A missing cursor must not silently continue an unrelated old chat.
      this.session.conversation = conversation;
    }
    this.persist();
    const report = {
      runId: response.runId,
      evidenceId: response.evidenceId,
      session: this.session.id,
      sessionOrigin: this.session.provenance,
      candidateTokenUsed: !!options.candidateToken,
      browserUsed: false,
      transport: "node-fetch",
      sdkSha256: DOUBAO_SDK_SHA256,
      signatureSha256: sha256(new URL(url).searchParams.get("a_bogus")!),
      requestBodySha256: sha256(body),
      httpStatus: response.response.status,
      success: result.success,
      classification: result.classification,
      businessCode: "businessCode" in result ? result.businessCode : undefined,
      eventCount: result.events?.length ?? 0,
      answerLength: result.success ? result.answer.length : 0,
      answerSha256: result.success ? sha256(result.answer) : undefined,
      continuationReady: result.success && !!this.session.conversation,
    };
    this.store.diagnostics.event(
      { requestId: response.runId },
      "doubao-node-result",
      result.success ? "succeeded" : "rejected",
      report,
    );
    return { report, answer: result.success ? result.answer : undefined };
  }
}

export async function createNodeGuest(
  store: Store,
  id: string,
): Promise<DoubaoSession> {
  // A partial seed is persisted before subsequent requests, so an interrupted
  // bootstrap resumes the same identity instead of creating another guest.
  const key = `doubao-node-seed:${id}`;
  let session = store.getSetting<DoubaoSession>(key);
  if (!session) {
    const response = await fetch(PAGE, {
      headers: { "user-agent": DOUBAO_USER_AGENT },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    const seedEvidenceId = store.diagnostics.event(
      { requestId: randomUUID() },
      "doubao-node-bootstrap",
      "page",
      {
        status: response.status,
        body,
        setCookies: response.headers.getSetCookie(),
      },
    );
    if (!response.ok)
      throw new DatalomError("NETWORK", `页面初始化 HTTP ${response.status}`);
    const layout = parseDoubaoBootstrap(body);
    const jar = new CookieJar();
    for (const cookie of response.headers.getSetCookie())
      jar.setCookieSync(cookie, PAGE);
    const fp = createDoubaoFingerprint();
    jar.setCookieSync(`s_v_web_id=${fp}; Path=/; Secure`, PAGE);
    session = {
      id,
      provenance: "node-bootstrap",
      createdAt: Date.now(),
      seedEvidenceId,
      userAgent: DOUBAO_USER_AGENT,
      cookieJar: jar.serializeSync()!,
      params: {
        version_code: "20800",
        language: "zh",
        device_platform: "web",
        doubao_device_platform: "web",
        aid: String(layout.aid),
        real_aid: String(layout.aid),
        pkg_type: "release_version",
        device_id: layout.deviceId,
        pc_version: layout.version,
        doubao_pc_version: layout.version,
        region: "CN",
        sys_region: "CN",
        samantha_web: "1",
        web_platform: "browser",
        "use-olympus-account": "1",
        web_tab_id: randomUUID(),
        tz_name: "Asia/Shanghai",
        fp,
      },
    };
    store.setSetting(key, session);
  }
  if (!session.params.web_id) {
    const url = "https://mcs.doubao.com/webid";
    const body = JSON.stringify({
      app_id: 497858,
      url: PAGE,
      user_agent: session.userAgent,
      referer: "",
      user_unique_id: "",
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: DOUBAO_ORIGIN },
      body,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const text = await response.text();
    store.diagnostics.event(
      { requestId: randomUUID() },
      "doubao-node-bootstrap",
      "analytics",
      { url, requestBody: body, status: response.status, body: text },
    );
    const data = JSON.parse(text);
    if (!response.ok || data.e !== 0 || typeof data.web_id !== "string")
      throw new DatalomError("SCHEMA_CHANGED", "Tea Web ID 初始化失败");
    session.params.web_id = data.web_id;
    session.params.tea_uuid = data.web_id;
    store.setSetting(key, session);
  }
  const jar = CookieJar.deserializeSync(session.cookieJar);
  const url = `${DOUBAO_ORIGIN}/alice/user/get_web_anon_id?${new URLSearchParams(session.params)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "user-agent": session.userAgent,
      "content-type": "application/json",
      "agw-js-conv": "str",
      origin: DOUBAO_ORIGIN,
      referer: PAGE,
      cookie: jar.getCookieStringSync(url),
    },
    body: "{}",
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  const text = await response.text();
  for (const cookie of response.headers.getSetCookie())
    jar.setCookieSync(cookie, url);
  session.cookieJar = jar.serializeSync()!;
  store.setSetting(key, session);
  store.diagnostics.event(
    { requestId: randomUUID() },
    "doubao-node-bootstrap",
    "anonymous",
    {
      url,
      status: response.status,
      body: text,
      setCookies: response.headers.getSetCookie(),
    },
  );
  const data = JSON.parse(text);
  if (
    !response.ok ||
    data.code !== 0 ||
    typeof data.uid !== "string" ||
    data.uid === "0"
  )
    throw new DatalomError("RESEARCH_REQUIRED", "游客 UID 初始化失败");
  assertGuestJar(jar);
  return session;
}
