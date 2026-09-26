import { it, expect } from "vitest";
import {
  inspectDoubaoStream,
  parseDoubaoLimit,
  parseDoubaoSSE,
} from "../protocol.ts";

it("classifies the observed HTTP 200 stream as a risk rejection, never successful chat or quota exhaustion", () => {
  const body =
    'id: 0\nevent: SSE_HEARTBEAT\ndata: {}\n\nid: 0\nevent: STREAM_ERROR\ndata: {"error_code":710022002,"error_msg":"当前服务访问频繁，请稍后重试","extra":{"ack":"1"}}\n\nid: 1\nevent: SSE_REPLY_END\ndata: {"end_type":3}\n\n';
  expect(inspectDoubaoStream(200, body)).toMatchObject({
    success: false,
    businessCode: 710022002,
    classification: "risk_control",
    clientErrorName: "SharkBlock",
    causeConfirmed: false,
  });
  expect(
    inspectDoubaoStream(200, body.replace("710022002", "710022004")),
  ).toMatchObject({ classification: "rate_limit" });
  expect(
    inspectDoubaoStream(200, body.replace("710022002", "710022013")),
  ).toMatchObject({ classification: "guest_quota" });
});
it("does not interpret a negative precheck as unlimited or allowed chat", () => {
  const body = JSON.stringify({
    status_code: 0,
    downlink_body: {
      check_message_send_rate_limit_downlink_body: {
        is_limit: false,
        limit_time: 0,
        limit_tips: "",
      },
    },
  });
  expect(parseDoubaoLimit(200, body)).toMatchObject({
    limited: false,
    retryAfterSeconds: 0,
    provesChatAllowed: false,
  });
  expect(() =>
    parseDoubaoLimit(200, body.replace('"status_code":0', '"status_code":1')),
  ).toThrow();
  expect(() => parseDoubaoLimit(200, "{}")).toThrow();
});
it("handles multiline CRLF SSE and refuses to call heartbeat-only or malformed responses successful", () => {
  expect(
    parseDoubaoSSE(
      ': heartbeat\r\nevent: SSE_REPLY_END\r\ndata: {\r\ndata: "end_type":3}\r\n\r\n',
    ),
  ).toEqual([{ event: "SSE_REPLY_END", data: { end_type: 3 }, id: undefined }]);
  expect(
    inspectDoubaoStream(200, "event: SSE_HEARTBEAT\ndata: {}\n\n").success,
  ).toBe(false);
  expect(() =>
    parseDoubaoSSE("event: STREAM_ERROR\ndata: broken\n\n"),
  ).toThrow();
});
it("decodes the observed successful stream across notify, patch, delta and terminal events", () => {
  const body = [
    "event: SSE_HEARTBEAT\ndata: {}",
    'event: SSE_ACK\ndata: {"ack_client_meta":{"conversation_id":"conversation-1"}}',
    'event: STREAM_MSG_NOTIFY\ndata: {"content":{"content_block":[{"content":{"text_block":{"text":"DO"}}}]},"meta":{"message_id":"message-1","conversation_id":"conversation-1"}}',
    'event: STREAM_CHUNK\ndata: {"message_id":"message-1","patch_op":[{"patch_value":{"content_block":[{"content":{"text_block":{"text":"U"}}}]}}]}',
    'event: CHUNK_DELTA\ndata: {"text":"BAO-LIVE-0917"}',
    'event: SSE_REPLY_END\ndata: {"end_type":1,"msg_finish_attr":{"msgid":"message-1","brief":"DOUBAO-LIVE-0917"}}',
    'event: SSE_REPLY_END\ndata: {"end_type":2}',
    'event: SSE_REPLY_END\ndata: {"end_type":3}',
  ].join("\n\n");
  expect(inspectDoubaoStream(200, body)).toMatchObject({
    success: true,
    classification: "success",
    answer: "DOUBAO-LIVE-0917",
    conversationId: "conversation-1",
    messageId: "message-1",
  });
});
