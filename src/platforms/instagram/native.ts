import { SpiderError } from "../../core/contracts.ts";
import { randomUUID } from "node:crypto";
import { parseGraphQL } from "./protocol.ts";
export const operations = {
  "search.suggestions": {
    name: "PolarisSearchBoxRefetchableQuery",
    root: "xdt_api__v1__fbsearch__topsearch_connection",
  },
  "search.media": {
    name: "PolarisKeywordSearchExplorePageRelayQuery",
    root: "xdt_fbsearch__top_serp_graphql",
  },
  "search.media.page": {
    name: "PolarisKeywordSearchExplorePageRelayPaginationQuery",
    root: "xdt_fbsearch__top_serp_graphql",
  },
  "profile.detail": { name: "PolarisProfilePageContentQuery", root: "user" },
  "profile.posts": {
    name: "PolarisProfilePostsQuery",
    root: "xdt_api__v1__feed__user_timeline_graphql_connection",
  },
  "profile.reels": {
    name: "PolarisProfileReelsTabContentQuery",
    root: "fetch__XDTUserDict",
  },
  "post.comments": {
    name: "PolarisPostCommentsPaginationQuery",
    root: "xdt_api__v1__media__media_id__comments__connection",
  },
  "comment.replies": {
    name: "PolarisPostChildCommentsQuery",
    root: "xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection",
  },
  "media.detail": { name: "media.info", root: "items" },
} as const;
export type InstagramOperation = keyof typeof operations;
export interface Capture {
  profileId: string;
  url: string;
  name: string;
  docId: string | null;
  requestBody: string | null;
  requestHeaders: Record<string, string>;
  body: string;
  status: number;
  method: string;
}
const pick = (o: any, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]),
  );
export const publicUser = (u: any) =>
  pick(u, [
    "pk",
    "id",
    "username",
    "full_name",
    "is_verified",
    "is_private",
    "profile_pic_url",
  ]);
export function publicMedia(m: any): any {
  if (!m || !(typeof m.pk === "string" || typeof m.id === "string") || !m.code)
    throw new SpiderError("SCHEMA_CHANGED", "媒体 ID 或 shortcode 缺失");
  if (m.user?.is_private === true)
    throw new SpiderError("INVALID_INPUT", "不采集私密账号媒体");
  const out = pick(m, [
    "pk",
    "id",
    "code",
    "taken_at",
    "media_type",
    "product_type",
    "like_count",
    "comment_count",
    "play_count",
    "view_count",
    "original_height",
    "original_width",
    "video_versions",
    "image_versions2",
    "accessibility_caption",
    "video_duration",
    "carousel_media_count",
  ]);
  out.id = String(m.pk ?? m.id);
  out.user = publicUser(m.user);
  out.caption = pick(m.caption, ["text", "created_at", "pk"]);
  if (m.carousel_media)
    out.carousel_media = m.carousel_media.map((x: any) =>
      pick(x, [
        "id",
        "pk",
        "media_type",
        "image_versions2",
        "video_versions",
        "original_height",
        "original_width",
      ]),
    );
  if (m.location)
    out.location = pick(m.location, [
      "pk",
      "name",
      "short_name",
      "city",
      "lng",
      "lat",
    ]);
  return out;
}
export function buildRequest(
  operation: InstagramOperation,
  capture: Capture,
  updates: Record<string, unknown>,
  counter: number,
) {
  if (!Object.hasOwn(operations, operation))
    throw new SpiderError("INVALID_INPUT", "未知 Instagram 操作");
  const u = new URL(capture.url);
  if (
    u.origin !== "https://www.instagram.com" ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new SpiderError("INVALID_INPUT", "Instagram 原站地址不匹配");
  const headers = Object.fromEntries(
    Object.entries(capture.requestHeaders).filter(([k]) =>
      [
        "accept",
        "accept-language",
        "content-type",
        "origin",
        "referer",
        "x-csrftoken",
        "x-ig-app-id",
        "x-asbd-id",
        "x-fb-friendly-name",
        "x-fb-lsd",
        "x-ig-www-claim",
        "sec-fetch-site",
        "sec-fetch-mode",
        "sec-fetch-dest",
        "sec-ch-ua",
        "sec-ch-ua-mobile",
        "sec-ch-ua-platform",
      ].includes(k),
    ),
  );
  if (operation === "media.detail") {
    const match = u.pathname.match(/^\/api\/v1\/media\/(\d+)\/info\/$/);
    if (!match || capture.method !== "GET" || Object.keys(updates).length)
      throw new SpiderError("INVALID_INPUT", "媒体详情仅允许已观测只读 URL");
    return {
      url: u.toString(),
      method: "GET" as const,
      headers,
      body: undefined,
      variables: { media_id: match[1] },
    };
  }
  if (
    !["/api/graphql", "/graphql/query"].includes(u.pathname) ||
    u.search ||
    capture.method !== "POST"
  )
    throw new SpiderError("INVALID_INPUT", "GraphQL 地址不匹配");
  const form = new URLSearchParams(capture.requestBody ?? ""),
    def = operations[operation];
  if (
    capture.name !== def.name ||
    form.get("fb_api_req_friendly_name") !== def.name ||
    !/^\d+$/.test(capture.docId ?? "") ||
    form.get("doc_id") !== capture.docId
  )
    throw new SpiderError("INVALID_INPUT", "查询必须匹配采集证据");
  const variables = JSON.parse(form.get("variables") ?? "null");
  if (!variables || Array.isArray(variables) || typeof variables !== "object")
    throw new SpiderError("INVALID_INPUT", "查询变量损坏");
  for (const [key, value] of Object.entries(updates)) {
    if (operation === "search.media" && key === "query") {
      if (typeof value !== "string" || !value.trim() || value.length > 100)
        throw new SpiderError("INVALID_INPUT", "关键词长度必须为 1–100");
      continue;
    }
    if (
      !["post.comments", "comment.replies", "search.media.page"].includes(
        operation,
      ) ||
      !["after", "first"].includes(key)
    )
      throw new SpiderError("INVALID_INPUT", "尚未验证的更新变量");
    if (
      key === "after" &&
      value !== null &&
      (typeof value !== "string" || value.length > 8192)
    )
      throw new SpiderError("INVALID_INPUT", "游标无效");
    if (
      key === "first" &&
      (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 30)
    )
      throw new SpiderError("INVALID_INPUT", "页大小无效");
  }
  Object.assign(variables, updates);
  if (operation === "search.media" && updates.query !== undefined) {
    variables.search_session_id = randomUUID();
    variables.serp_session_id = randomUUID();
  }
  const base = parseInt(form.get("__req") ?? "0", 36);
  if (
    !Number.isSafeInteger(base) ||
    !Number.isSafeInteger(counter) ||
    counter < 1
  )
    throw new SpiderError("INVALID_INPUT", "请求计数器异常");
  if (!form.get("fb_dtsg") || !form.get("lsd") || !headers["x-csrftoken"])
    throw new SpiderError("LOGIN_REQUIRED", "缺少会话令牌");
  form.set("__req", (base + counter).toString(36));
  form.set("variables", JSON.stringify(variables));
  return {
    url: u.toString(),
    method: "POST" as const,
    headers,
    body: form.toString(),
    variables,
  };
}
export function validateResult(
  operation: InstagramOperation,
  variables: Record<string, any>,
  status: number,
  body: string,
) {
  let data: any, chunks: any[];
  if (operation === "media.detail") {
    if (status !== 200) parseGraphQL(status, body);
    const j = JSON.parse(body);
    if (j.status !== "ok" || !Array.isArray(j.items) || !j.items.length)
      throw new SpiderError("RESEARCH_REQUIRED", "Instagram 媒体业务响应失败", {
        cause: j,
      });
    if (String(j.items[0].pk) !== variables.media_id)
      throw new SpiderError("SCHEMA_CHANGED", "媒体 ID 不匹配");
    return {
      raw: { items: j.items.map(publicMedia) },
      chunks: [{}],
      page: undefined,
    };
  }
  const parsed = parseGraphQL(status, body);
  data = parsed.data;
  chunks = parsed.chunks.map((c) => ({ path: c.path, label: c.label }));
  const root = data[operations[operation].root];
  if (!root)
    throw new SpiderError("SCHEMA_CHANGED", "Instagram 查询根数据缺失");
  if (operation === "search.suggestions") {
    if (
      !Array.isArray(root.users) ||
      !Array.isArray(root.hashtags) ||
      !Array.isArray(root.places)
    )
      throw new SpiderError("SCHEMA_CHANGED", "搜索建议结构变化");
    return {
      raw: {
        users: root.users.map((e: any) => publicUser(e.user)),
        hashtags: root.hashtags.map((e: any) =>
          pick(e.hashtag, ["id", "name", "media_count"]),
        ),
        places: root.places.map((e: any) =>
          pick(e.place?.location, ["pk", "name", "city", "lat", "lng"]),
        ),
      },
      chunks,
      page: undefined,
    };
  }
  if (operation === "profile.detail") {
    if (String(root.pk) !== variables.id || root.is_private !== false)
      throw new SpiderError("INVALID_INPUT", "主页不是匹配的公开账号");
    return {
      raw: {
        ...publicUser(root),
        ...pick(root, [
          "biography",
          "bio_links",
          "external_url",
          "category",
          "follower_count",
          "following_count",
          "media_count",
          "total_clips_count",
        ]),
      },
      chunks,
      page: undefined,
    };
  }
  const c = operation === "profile.reels" ? root.clips_connection : root;
  const p = c?.page_info;
  if (
    !Array.isArray(c?.edges) ||
    typeof p?.has_next_page !== "boolean" ||
    (p.end_cursor !== null && typeof p.end_cursor !== "string") ||
    (p.has_next_page && !p.end_cursor)
  )
    throw new SpiderError("SCHEMA_CHANGED", "Instagram 分页结构异常");
  const comments = ["post.comments", "comment.replies"].includes(operation);
  const items = c.edges.flatMap((e: any) => {
    if (operation === "search.media" || operation === "search.media.page") {
      if (
        ["XDTTopSerpHeaderUnit", "XDTTopSerpAccountsHCMUnit"].includes(
          e.node?.__typename,
        )
      )
        return [];
      if (!Array.isArray(e.node?.items))
        throw new SpiderError("SCHEMA_CHANGED", "关键词搜索媒体行结构变化");
      return e.node.items.map(publicMedia);
    }
    const n = e.node;
    if (comments) {
      if (typeof n?.pk !== "string" || typeof n.text !== "string")
        throw new SpiderError("SCHEMA_CHANGED", "评论 ID/正文缺失");
      if (
        operation === "comment.replies" &&
        String(n.parent_comment_id) !== variables.parent_comment_id
      )
        throw new SpiderError("SCHEMA_CHANGED", "回复父评论不匹配");
      return {
        ...pick(n, [
          "pk",
          "text",
          "created_at",
          "comment_like_count",
          "child_comment_count",
          "parent_comment_id",
        ]),
        id: n.pk,
        user: publicUser(n.user),
      };
    }
    return publicMedia(operation === "profile.reels" ? n.media : n);
  });
  if (new Set(items.map((x: any) => x.id)).size !== items.length)
    throw new SpiderError("SCHEMA_CHANGED", "页内 ID 重复");
  return {
    raw: { items },
    chunks,
    page: {
      items,
      cursor: p.end_cursor as string | null,
      hasMore: p.has_next_page as boolean,
    },
  };
}
