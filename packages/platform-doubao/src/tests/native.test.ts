import { describe, expect, it } from "vitest";
import { CookieJar } from "tough-cookie";
import { fixture } from "../../../../scripts/checks/helpers.ts";
import {
  buildDoubaoMessage,
  conversationFromStream,
  parseDoubaoBootstrap,
  readDoubaoBody,
  createDoubaoFingerprint,
} from "../native.ts";
import { inspectDoubaoStream } from "../protocol.ts";
import { DoubaoSessions, type DoubaoSession } from "../session.ts";
import { DoubaoSigner } from "../signer.ts";

describe("Node message and response contracts", () => {
  it("creates a fresh message for every call and explicitly separates new and continued conversations", () => {
    const a = buildDoubaoMessage("你好");
    const b = buildDoubaoMessage("你好");
    expect(a.option.need_create_conversation).toBe(true);
    expect(a.client_meta.conversation_id).toBe("");
    expect(a.option.unique_key).not.toBe(b.option.unique_key);
    expect(a.messages[0].local_message_id).not.toBe(
      b.messages[0].local_message_id,
    );
    expect(a.messages[0].content_block[0].content.text_block.text).toBe("你好");
    const continued = buildDoubaoMessage("接着说", {
      id: "c1",
      sectionId: "s1",
      lastMessageIndex: 12,
    });
    expect(continued.client_meta).toMatchObject({
      conversation_id: "c1",
      last_section_id: "s1",
      last_message_index: 12,
    });
    expect(continued.option.need_create_conversation).toBe(false);
    expect(continued.option).not.toHaveProperty("conversation_init_option");
    expect(() => buildDoubaoMessage(" ")).toThrow();
  });

  it("parses initialization JSON without executing page code", () => {
    const data = {
      loaderData: {
        chat_layout: {
          chat_layout: {
            aid: 497858,
            pc_version: "3.37.1",
            launchCore: { web_id: "device-id" },
          },
        },
      },
    };
    expect(
      parseDoubaoBootstrap(
        `<script>window._ROUTER_DATA = ${JSON.stringify(data)};</script>`,
      ),
    ).toEqual({ aid: 497858, version: "3.37.1", deviceId: "device-id" });
    expect(() =>
      parseDoubaoBootstrap(
        "<script>window._ROUTER_DATA = (() => { throw 1 })();</script>",
      ),
    ).toThrow();
    expect(() => parseDoubaoBootstrap("<html>challenge</html>")).toThrow();
  });

  it("extracts the acknowledged section and final message position for continuation", () => {
    const body = [
      'event: SSE_ACK\ndata: {"ack_client_meta":{"conversation_id":"c1","section_id":"s1"},"query_list":[{"message_index":11}]}',
      'event: FULL_MSG_NOTIFY\ndata: {"message":{"conversation_id":"c1","section_id":"s1","index_in_conv":11}}',
      'event: SSE_REPLY_END\ndata: {"end_type":1,"msg_finish_attr":{"badge_count":12}}',
      'event: SSE_REPLY_END\ndata: {"end_type":3}',
    ].join("\n\n");
    expect(conversationFromStream(body)).toEqual({
      id: "c1",
      sectionId: "s1",
      lastMessageIndex: 12,
    });
    expect(
      conversationFromStream('event: SSE_REPLY_END\ndata: {"end_type":3}'),
    ).toBeUndefined();
  });

  it("handles UTF-8 and CRLF split at every byte and cancels an open stream at terminal event", async () => {
    const body =
      'event: STREAM_MSG_NOTIFY\r\ndata: {"content":{"content_block":[{"content":{"text_block":{"text":"中文🙂"}}}]}}\r\n\r\nevent: SSE_REPLY_END\r\ndata: {"end_type":3}\r\n\r\n';
    const bytes = new TextEncoder().encode(body);
    let index = 0,
      cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (index < bytes.length)
            controller.enqueue(bytes.slice(index, ++index));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    const events: string[] = [];
    const result = await readDoubaoBody(response, (e) => events.push(e.event));
    expect(inspectDoubaoStream(200, result)).toMatchObject({
      success: true,
      answer: "中文🙂",
    });
    expect(events).toEqual(["STREAM_MSG_NOTIFY", "SSE_REPLY_END"]);
    expect(cancelled).toBe(true);
  });

  it("preserves the partial body when the network stream fails", async () => {
    let sent = false;
    const response = new Response(
      new ReadableStream({
        pull(c) {
          if (!sent) {
            sent = true;
            c.enqueue(
              new TextEncoder().encode("event: SSE_HEARTBEAT\ndata: {}\n\n"),
            );
          } else c.error(new Error("connection interrupted"));
        },
      }),
    );
    await expect(readDoubaoBody(response)).rejects.toMatchObject({
      cause: { body: "event: SSE_HEARTBEAT\ndata: {}\n\n" },
    });
  });

  it("refuses an unpinned SDK before running its code", () => {
    expect(
      () =>
        new DoubaoSigner(
          "throw new Error('executed')",
          "test-agent",
          new CookieJar(),
        ),
    ).toThrow(/哈希不匹配/);
  });

  it("uses the observed fingerprint layout", () => {
    expect(createDoubaoFingerprint()).toMatch(
      /^verify_[0-9a-z]+_[0-9A-Za-z]{8}_[0-9A-Za-z]{4}_4[0-9A-Za-z]{3}_[89AB][0-9A-Za-z]{3}_[0-9A-Za-z]{12}$/,
    );
  });
});

describe("encrypted guest session persistence", () => {
  it("serializes concurrent use, survives reacquisition, and rejects stale lease writes", () => {
    const f = fixture();
    try {
      const sessions = new DoubaoSessions(f.store);
      const jar = new CookieJar();
      jar.setCookieSync(
        "ttwid=secret-guest-cookie; Secure; Path=/",
        "https://www.doubao.com",
      );
      const session: DoubaoSession = {
        id: "guest",
        createdAt: Date.now(),
        provenance: "captured-guest",
        userAgent: "test",
        cookieJar: jar.serializeSync()!,
        params: { msToken: "secret-token" },
      };
      sessions.create(session);
      expect(() => sessions.create(session)).toThrow(/已存在/);
      const a = sessions.acquire("guest");
      expect(() => sessions.acquire("guest")).toThrow(/正在执行/);
      a.session.conversation = {
        id: "c1",
        sectionId: "s1",
        lastMessageIndex: 2,
      };
      sessions.save(a.session, a.lease);
      sessions.release("guest", a.lease);
      const b = sessions.acquire("guest");
      expect(b.session.conversation).toEqual(a.session.conversation);
      expect(() => sessions.save(a.session, a.lease)).toThrow(/租约/);
      const row = f.store.sql
        .prepare("SELECT payload FROM doubao_sessions WHERE id=?")
        .get("guest") as any;
      expect(row.payload).not.toMatch(/secret-token|secret-guest-cookie/);
      sessions.release("guest", b.lease);
    } finally {
      f.cleanup();
    }
  });
});
