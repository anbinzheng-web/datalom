import { describe, it, expect } from "vitest";
import {
  buildRequest,
  operationUrl,
  parseTimeline,
  publicTweet,
  publicUser,
  validateResult,
  type Capture,
} from "../native.ts";
const user = (id = "1") => ({
  __typename: "User",
  rest_id: id,
  core: { screen_name: "nasa", name: "NASA" },
  privacy: { protected: false },
  relationship_counts: { followers: 20 },
  relationship_perspectives: { following: true },
  notifications_settings: { notifications_enabled: true },
});
const tweet = (id = "10", parent: string | null = null) => ({
  __typename: "Tweet",
  rest_id: id,
  core: { user_results: { result: user() } },
  legacy: {
    full_text: "public",
    conversation_id_str: "10",
    in_reply_to_status_id_str: parent,
    reply_count: 2,
    favorited: true,
    bookmarked: true,
  },
});
const entry = (id = "10", parent: string | null = null) => ({
  entryId: "tweet-" + id,
  content: {
    entryType: "TimelineTimelineItem",
    itemContent: {
      itemType: "TimelineTweet",
      tweet_results: { result: tweet(id, parent) },
    },
  },
});
const cursor = {
  entryId: "bottom",
  content: {
    entryType: "TimelineTimelineCursor",
    cursorType: "Bottom",
    value: "next-page",
  },
};
const capture: Capture = {
  profileId: "a".repeat(32),
  name: "SearchTimeline",
  method: "GET",
  status: 200,
  body: "{}",
  url:
    "https://x.com/i/api/graphql/abc/SearchTimeline?variables=" +
    encodeURIComponent(
      JSON.stringify({
        rawQuery: "nasa",
        product: "Top",
        count: 20,
        cursor: "old",
      }),
    ) +
    "&features=%7B%7D",
  requestHeaders: {
    authorization: "test-client",
    cookie: "secret",
    "x-csrf-token": "secret",
    "x-client-transaction-id": "old",
    host: "evil.test",
  },
};
describe("X request boundary", () => {
  it("changes search input, drops stale cursor and never replays dynamic credentials", () => {
    const r = buildRequest("search.timeline", capture, {
      rawQuery: "space & moon",
    });
    expect(r.variables.cursor).toBeUndefined();
    expect(
      JSON.parse(new URL(r.url).searchParams.get("variables")!).rawQuery,
    ).toBe("space & moon");
    expect(Object.keys(r.headers)).toEqual(["authorization", "referer"]);
  });
  it("rejects mutations, external targets, duplicate parameters, bad counts and variables", () => {
    for (const u of [
      "https://evil.test/i/api/graphql/abc/SearchTimeline",
      "https://x.com/i/api/graphql/abc/CreateTweet",
      "https://user@x.com/i/api/graphql/abc/SearchTimeline",
    ])
      expect(() => operationUrl(u)).toThrow();
    expect(() =>
      buildRequest("search.timeline", capture, { count: 100 }),
    ).toThrow();
    expect(() =>
      buildRequest("search.timeline", capture, JSON.parse('{"__proto__":{}}')),
    ).toThrow();
    expect(() =>
      buildRequest(
        "search.timeline",
        { ...capture, url: capture.url + "&variables=%7B%7D" },
        {},
      ),
    ).toThrow();
  });
});
describe("X public data and timeline", () => {
  it("keeps an unexplained empty 404 distinct from schema changes and explicit throttling", () => {
    for (const [status, body, code] of [
      [404, "", "RESEARCH_REQUIRED"],
      [429, "", "RATE_LIMIT"],
      [200, "", "SCHEMA_CHANGED"],
    ] as const) {
      expect(() =>
        validateResult("search.timeline", {}, status, body),
      ).toThrowError(expect.objectContaining({ code }));
    }
  });
  it("projects public fields without account perspective", () => {
    expect(publicUser(user())).not.toHaveProperty("relationship_perspectives");
    const t = publicTweet(tweet());
    expect(t).not.toHaveProperty("legacy");
    expect(t).not.toHaveProperty("favorited");
  });
  it("parses visibility wrapper without inner typename and retains reply links", () => {
    const t: any = tweet("11", "10");
    delete t.__typename;
    expect(
      publicTweet({ __typename: "TweetWithVisibilityResults", tweet: t })
        .replyToPostId,
    ).toBe("10");
  });
  it("deduplicates pinned rows, preserves reply modules and bottom cursor", () => {
    const p = parseTimeline([
      { type: "TimelinePinEntry", entry: entry() },
      {
        type: "TimelineAddEntries",
        entries: [
          entry(),
          {
            entryId: "thread",
            content: {
              entryType: "TimelineTimelineModule",
              items: [
                {
                  entryId: "reply",
                  item: { itemContent: entry("11", "10").content.itemContent },
                },
              ],
            },
          },
          cursor,
        ],
      },
    ]);
    expect(p.items.map((x) => x.id)).toEqual(["10", "11"]);
    expect(p.duplicates).toBe(1);
    expect(p.hasMore).toBe(true);
  });
  it("does not confuse top termination with bottom or branch completion", () => {
    const p = parseTimeline([
      {
        type: "TimelineAddEntries",
        entries: [
          cursor,
          {
            ...cursor,
            content: {
              ...cursor.content,
              cursorType: "ShowMoreThreads",
              value: "branch",
            },
          },
        ],
      },
      { type: "TimelineTerminateTimeline", direction: "Top" },
    ]);
    expect(p.hasMore).toBe(true);
    expect(p.moduleCursors[0].cursor).toBe("branch");
    const end = parseTimeline([
      { type: "TimelineAddEntries", entries: [cursor] },
      { type: "TimelineTerminateTimeline", direction: "Bottom" },
    ]);
    expect(end.hasMore).toBe(false);
    expect(end.cursor).toBeUndefined();
  });
  it("accepts empty known timelines but rejects unknown structures", () => {
    expect(
      parseTimeline([{ type: "TimelineAddEntries", entries: [] }]).items,
    ).toEqual([]);
    expect(() => parseTimeline(undefined)).toThrow();
    expect(() => parseTimeline([{ type: "NewInstruction" }])).toThrow();
    expect(() =>
      parseTimeline([
        {
          type: "TimelineAddEntries",
          entries: [{ content: { entryType: "NewType" } }],
        },
      ]),
    ).toThrow();
  });
  it("skips protected users explicitly and rejects protected tweet authors", () => {
    const u = user();
    u.privacy.protected = true;
    const p = parseTimeline([
      {
        type: "TimelineAddEntries",
        entries: [
          {
            content: {
              entryType: "TimelineTimelineItem",
              itemContent: {
                itemType: "TimelineUser",
                user_results: { result: u },
              },
            },
          },
        ],
      },
    ]);
    expect(p.items).toEqual([]);
    expect(p.skipped["protected-user"]).toBe(1);
    const t = tweet();
    t.core.user_results.result = u;
    expect(() => publicTweet(t)).toThrow();
  });
  it("validates HTTP, business errors and focal identity", () => {
    for (const status of [401, 403, 429, 500])
      expect(() => validateResult("post.detail", {}, status, "{}")).toThrow();
    expect(() =>
      validateResult(
        "profile.detail",
        { screen_name: "nasa" },
        200,
        JSON.stringify({
          data: { user: { result: user() } },
          errors: [{ code: 88 }],
        }),
      ),
    ).toThrow();
    expect(() =>
      validateResult(
        "post.detail",
        { tweetId: "99" },
        200,
        JSON.stringify({ data: { tweetResult: { result: tweet() } } }),
      ),
    ).toThrow();
    expect(() =>
      validateResult(
        "post.conversation",
        { focalTweetId: "99" },
        200,
        JSON.stringify({
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [
                { type: "TimelineAddEntries", entries: [entry()] },
              ],
            },
          },
        }),
      ),
    ).toThrow();
  });
});
