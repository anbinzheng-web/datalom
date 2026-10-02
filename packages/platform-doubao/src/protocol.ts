import { DatalomError } from "@datalom/shared/runtime/contracts";

// Observed in Doubao's chat.42382d60.js on 2026-09-16. These are client
// classifications, not evidence of which server-side risk feature triggered.
export const doubaoErrors: Record<number, { name: string; kind: string }> = {
  710022002: { name: "SharkBlock", kind: "risk_control" },
  710022004: { name: "RateLimit", kind: "rate_limit" },
  710022013: { name: "TouristReachLimit", kind: "guest_quota" },
  710022003: { name: "CountryRestricted", kind: "region" },
  710022017: { name: "CountryNotAvailable", kind: "region" },
  710022019: { name: "TouristPunished", kind: "risk_control" },
  710012001: { name: "LoginInvalid", kind: "session" },
};

export interface DoubaoEvent {
  event: string;
  id?: string;
  data: unknown;
}
export function parseDoubaoSSE(body: string): DoubaoEvent[] {
  const events: DoubaoEvent[] = [];
  for (const block of body
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n\n")) {
    let event = "message",
      id: string | undefined;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const index = line.indexOf(":"),
        key = index < 0 ? line : line.slice(0, index);
      const value = index < 0 ? "" : line.slice(index + 1).replace(/^ /, "");
      if (key === "event") event = value;
      else if (key === "id" && !value.includes("\0")) id = value;
      else if (key === "data") data.push(value);
    }
    if (data.length) {
      try {
        events.push({ event, id, data: JSON.parse(data.join("\n")) });
      } catch (cause) {
        throw new DatalomError("SCHEMA_CHANGED", "豆包 SSE 数据不是预期 JSON", {
          cause,
        });
      }
    }
  }
  return events;
}

function textBlocks(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((block: any) => block?.content?.text_block?.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
}

function successfulReply(events: DoubaoEvent[]) {
  let streamed = "";
  let brief = "";
  let conversationId: string | undefined;
  let messageId: string | undefined;
  let terminal = false;
  for (const event of events) {
    const data = event.data as any;
    if (event.event === "SSE_ACK")
      conversationId = data?.ack_client_meta?.conversation_id;
    else if (event.event === "STREAM_MSG_NOTIFY") {
      streamed += textBlocks(data?.content?.content_block);
      messageId = data?.meta?.message_id ?? messageId;
      conversationId = data?.meta?.conversation_id ?? conversationId;
    } else if (event.event === "STREAM_CHUNK") {
      messageId = data?.message_id ?? messageId;
      for (const operation of data?.patch_op ?? [])
        streamed += textBlocks(operation?.patch_value?.content_block);
    } else if (event.event === "CHUNK_DELTA") {
      if (typeof data?.text === "string") streamed += data.text;
    } else if (event.event === "SSE_REPLY_END") {
      if (typeof data?.msg_finish_attr?.brief === "string")
        brief = data.msg_finish_attr.brief;
      messageId = data?.msg_finish_attr?.msgid ?? messageId;
      if (data?.end_type === 3) terminal = true;
    }
  }
  const answer = streamed || brief;
  return {
    complete: terminal && answer.length > 0,
    answer,
    conversationId,
    messageId,
  };
}

export function inspectDoubaoStream(status: number, body: string) {
  if (status !== 200)
    return {
      success: false as const,
      httpStatus: status,
      classification: status === 429 ? "rate_limit" : "http_error",
      causeConfirmed: false,
    };
  const events = parseDoubaoSSE(body);
  const failure = events.find((e) =>
    ["STREAM_ERROR", "STREAM_MSG_ERROR"].includes(e.event),
  );
  if (failure) {
    const data = failure.data as any;
    const code = Number(data?.error_code);
    const mapping = doubaoErrors[code];
    return {
      success: false as const,
      httpStatus: status,
      businessCode: code,
      classification: mapping?.kind ?? "unknown",
      clientErrorName: mapping?.name ?? "Unknown",
      rawMessage: String(data?.error_msg ?? ""),
      causeConfirmed: false,
      events: events.map((e) => e.event),
    };
  }
  const reply = successfulReply(events);
  if (reply.complete)
    return {
      success: true as const,
      httpStatus: status,
      classification: "success",
      answer: reply.answer,
      conversationId: reply.conversationId,
      messageId: reply.messageId,
      events: events.map((e) => e.event),
    };
  // A heartbeat/end event alone is never an accepted model answer.
  return {
    success: false as const,
    httpStatus: status,
    classification: "unverified_response",
    causeConfirmed: false,
    events: events.map((e) => e.event),
  };
}

export function parseDoubaoLimit(status: number, body: string) {
  if (status !== 200)
    throw new DatalomError("RESEARCH_REQUIRED", `豆包限流检查 HTTP ${status}`);
  let data: any;
  try {
    data = JSON.parse(body);
  } catch (cause) {
    throw new DatalomError("SCHEMA_CHANGED", "豆包限流检查返回非 JSON", {
      cause,
    });
  }
  const limit =
    data?.downlink_body?.check_message_send_rate_limit_downlink_body;
  if (
    data?.status_code !== 0 ||
    typeof limit?.is_limit !== "boolean" ||
    typeof limit?.limit_time !== "number" ||
    !Number.isFinite(limit.limit_time) ||
    limit.limit_time < 0 ||
    typeof limit?.limit_tips !== "string"
  )
    throw new DatalomError(
      "SCHEMA_CHANGED",
      "豆包限流检查结构或业务状态不符合已观察契约",
    );
  return {
    limited: limit.is_limit,
    retryAfterSeconds: limit.limit_time,
    tips: limit.limit_tips,
    scope: "message-send-precheck" as const,
    provesChatAllowed: false as const,
  };
}
