import { expect, it } from "vitest";
import { CookieJar } from "tough-cookie";
import { applyResponseCookies } from "../response-cookies.ts";
import {
  buildRequest,
  validateResult,
  publicMedia,
  type Capture,
} from "../native.ts";
const root = "xdt_api__v1__media__media_id__comments__connection";
const capture: Capture = {
  profileId: "a".repeat(32),
  url: "https://www.instagram.com/api/graphql",
  name: "PolarisPostCommentsPaginationQuery",
  docId: "123",
  requestBody: new URLSearchParams({
    fb_api_req_friendly_name: "PolarisPostCommentsPaginationQuery",
    doc_id: "123",
    fb_dtsg: "fixture",
    lsd: "fixture",
    __req: "a",
    variables: JSON.stringify({ media_id: "12", after: null, first: 10 }),
  }).toString(),
  requestHeaders: { "x-csrftoken": "fixture", cookie: "must-not-replay" },
  body: "",
  status: 200,
  method: "POST",
};
it("builds new requests with opaque cursors and rejects changing subjects or endpoints", () => {
  const r = buildRequest(
    "post.comments",
    capture,
    { after: '{"cursor":"next"}' },
    2,
  );
  expect(new URLSearchParams(r.body).get("__req")).toBe("c");
  expect(r.headers.cookie).toBeUndefined();
  expect(() =>
    buildRequest("post.comments", capture, { media_id: "13" }, 1),
  ).toThrow();
  expect(() =>
    buildRequest(
      "post.comments",
      { ...capture, url: "https://evil.test/api/graphql" },
      {},
      1,
    ),
  ).toThrow();
  expect(() =>
    buildRequest("post.comments", { ...capture, name: "Mutation" }, {}, 1),
  ).toThrow();
});
it("validates terminal comments and excludes viewer-dependent fields", () => {
  const body = JSON.stringify({
    data: {
      [root]: {
        edges: [
          {
            node: {
              pk: "c1",
              text: "Hi",
              has_liked_comment: true,
              user: {
                pk: "p1",
                username: "author",
                friendship_status: { following: true },
              },
            },
          },
        ],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  });
  const r = validateResult("post.comments", { media_id: "12" }, 200, body);
  expect(r.page).toMatchObject({
    hasMore: false,
    cursor: null,
    items: [{ id: "c1", text: "Hi" }],
  });
  expect(JSON.stringify(r)).not.toMatch(/has_liked_comment|friendship_status/);
  expect(() =>
    validateResult(
      "post.comments",
      {},
      200,
      '{"data":{},"errors":[{"message":"failed"}]}',
    ),
  ).toThrow();
});
it("rejects a mismatched reply parent", () => {
  const k =
    "xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection";
  const body = JSON.stringify({
    data: {
      [k]: {
        edges: [
          { node: { pk: "1", text: "hello", parent_comment_id: "wrong" } },
        ],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  });
  expect(() =>
    validateResult(
      "comment.replies",
      { parent_comment_id: "right" },
      200,
      body,
    ),
  ).toThrow(/父评论/);
});
it("returns public media fields and blocks private accounts", () => {
  const m = {
    pk: "1",
    code: "abc",
    user: { pk: "2", username: "public", is_private: false },
    has_viewer_saved: true,
    saved_collection_ids: ["secret"],
    caption: { text: "Caption", viewer_secret: "secret" },
  };
  expect(JSON.stringify(publicMedia(m))).not.toMatch(/secret|has_viewer_saved/);
  expect(() => publicMedia({ ...m, user: { is_private: true } })).toThrow();
});
it("rejects cross-domain response cookies like a browser without aborting the response", async () => {
  const jar = new CookieJar(),
    events: any[] = [];
  await applyResponseCookies(
    jar,
    [
      "other=secret; Domain=i.instagram.com; Path=/",
      "csrf=new; Domain=.instagram.com; Secure; Path=/",
    ],
    "https://www.instagram.com/graphql/query",
    (...args) => events.push(args),
  );
  expect(await jar.getCookieString("https://www.instagram.com/")).toBe(
    "csrf=new",
  );
  expect(events[0]).toMatchObject([
    "instagram-cookie",
    "rejected",
    { reason: "domain-mismatch" },
  ]);
  expect(JSON.stringify(events)).not.toContain("secret");
});

it("accepts known search header rows but rejects unknown media row layouts", () => {
  const root = "xdt_fbsearch__top_serp_graphql";
  const value = {
    data: {
      [root]: {
        edges: [
          { node: { __typename: "XDTTopSerpHeaderUnit" } },
          { node: { __typename: "XDTTopSerpAccountsHCMUnit" } },
          {
            node: {
              __typename: "XDTTopSerpMediaGridUnit",
              items: [{ pk: "1", code: "abc", user: { is_private: false } }],
            },
          },
        ],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  };
  expect(
    validateResult("search.media", {}, 200, JSON.stringify(value)).page?.items,
  ).toHaveLength(1);
  expect(() =>
    validateResult(
      "search.media",
      {},
      200,
      JSON.stringify({
        data: {
          [root]: {
            edges: [{ node: { __typename: "Unexpected" } }],
            page_info: { end_cursor: null, has_next_page: false },
          },
        },
      }),
    ),
  ).toThrow();
});
