import { afterEach, expect, it, vi } from "vitest";
import { CookieJar } from "tough-cookie";
import { fixture } from "../../../../tests/helpers.ts";
import { DoubaoNative, createNodeGuest } from "../native.ts";
import type { DoubaoSession } from "../session.ts";

vi.mock("../signer.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../signer.ts")>();
  return {
    ...actual,
    DoubaoSigner: class {
      async sign(url: string) {
        const u = new URL(url);
        u.searchParams.set("a_bogus", "fixture-signature");
        return u.toString();
      }
      async tokenRequest() {
        return {
          url: "https://mssdk.bytedance.com/web/r/token",
          body: "{}",
          headers: {},
          method: "POST",
        };
      }
    },
  };
});
afterEach(() => vi.unstubAllGlobals());

it("resumes an interrupted HTTP bootstrap with the same saved guest identity", async () => {
  const f = fixture();
  try {
    let pageCalls = 0,
      analyticsCalls = 0;
    const router = {
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
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.endsWith("/chat/")) {
        pageCalls++;
        return new Response(
          `<script>window._ROUTER_DATA = ${JSON.stringify(router)};</script>`,
          {
            headers: {
              "set-cookie": "ttwid=fixed-guest; Path=/; Secure; HttpOnly",
            },
          },
        );
      }
      if (url.endsWith("/webid")) {
        analyticsCalls++;
        if (analyticsCalls === 1)
          throw new Error("offline fixture interruption");
        return Response.json({ e: 0, web_id: "tea-id" });
      }
      const u = new URL(url);
      expect(u.searchParams.get("device_id")).toBe("device-id");
      expect(u.searchParams.get("web_id")).toBe("tea-id");
      expect(u.searchParams.get("tea_uuid")).toBe("tea-id");
      expect(new Headers(init?.headers).get("cookie")).toContain(
        "ttwid=fixed-guest",
      );
      return Response.json({ code: 0, uid: "guest-uid", web_id: "device-id" });
    });
    await expect(createNodeGuest(f.store, "fresh")).rejects.toThrow(
      "interruption",
    );
    const partial = f.store.getSetting<DoubaoSession>(
      "doubao-node-seed:fresh",
    )!;
    const session = await createNodeGuest(f.store, "fresh");
    expect(pageCalls).toBe(1);
    expect(session.params.fp).toBe(partial.params.fp);
    expect(session.params.web_tab_id).toBe(partial.params.web_tab_id);
    expect(session.provenance).toBe("node-bootstrap");
    expect(session.lastSuccessAt).toBeUndefined();
  } finally {
    f.cleanup();
  }
});

it("keeps the working token on a rejected candidate and promotes only a successful candidate", async () => {
  const f = fixture();
  try {
    const session: DoubaoSession = {
      id: "guest",
      createdAt: 1,
      provenance: "captured-guest",
      userAgent: "test",
      cookieJar: new CookieJar().serializeSync()!,
      params: { msToken: "working-token" },
    };
    const client = new DoubaoNative(f.store, session, "mock-source", () => {});
    const requests: string[] = [];
    let accepted = false;
    vi.stubGlobal("fetch", async (url: string) => {
      requests.push(url);
      if (url.includes("/web/r/token"))
        return new Response("{}", {
          headers: { "x-ms-token": "candidate-token" },
        });
      const body = accepted
        ? 'event: CHUNK_DELTA\ndata: {"text":"ok"}\n\nevent: SSE_REPLY_END\ndata: {"end_type":3}\n\n'
        : 'event: STREAM_ERROR\ndata: {"error_code":710022002}\n\nevent: SSE_REPLY_END\ndata: {"end_type":3}\n\n';
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    await client.refreshToken();
    expect(session.params.msToken).toBe("working-token");
    expect(session.candidateMsToken).toBe("candidate-token");
    expect(
      (await client.chat("test", { candidateToken: true })).report.success,
    ).toBe(false);
    expect(session.params.msToken).toBe("working-token");
    expect(new URL(requests.at(-1)!).searchParams.get("msToken")).toBe(
      "candidate-token",
    );
    expect(session.candidateTokenResult).toBe("risk_control");
    accepted = true;
    expect(
      (await client.chat("test", { candidateToken: true })).report.success,
    ).toBe(true);
    expect(session.params.msToken).toBe("candidate-token");
    expect(session.candidateTokenResult).toBe("success");
  } finally {
    f.cleanup();
  }
});

it("does not send a request after cancellation and never retries a rejected chat", async () => {
  const f = fixture();
  try {
    const session: DoubaoSession = {
      id: "guest",
      createdAt: 1,
      provenance: "captured-guest",
      userAgent: "test",
      cookieJar: new CookieJar().serializeSync()!,
      params: {},
    };
    const client = new DoubaoNative(f.store, session, "mock-source", () => {});
    const fetch = vi.fn(
      async () =>
        new Response(
          'event: STREAM_ERROR\ndata: {"error_code":710022013}\n\nevent: SSE_REPLY_END\ndata: {"end_type":3}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      client.chat("test", { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
    const result = await client.chat("test");
    expect(result.report.classification).toBe("guest_quota");
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
