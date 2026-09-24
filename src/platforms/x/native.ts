import { SpiderError } from "../../core/contracts.ts";
export const operations = {
  "profile.detail": "UserByScreenName",
  "profile.posts": "UserOriginalsTimeline",
  "profile.replies": "UserRepliesTimeline",
  "profile.reposts": "UserRepostsTimeline",
  "profile.media": "UserVideoTimeline",
  "post.detail": "TweetResultByRestId",
  "post.conversation": "TweetDetail",
  "search.timeline": "SearchTimeline",
  "profile.followers": "Followers",
  "profile.following": "Following",
} as const;
export type XOperation = keyof typeof operations;
export interface Capture {
  profileId: string;
  name: string;
  url: string;
  method: string;
  status: number;
  body: string;
  requestHeaders: Record<string, string>;
}
export function operationUrl(url: string) {
  const u = new URL(url);
  const m = /^\/i\/api\/graphql\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_]+)$/.exec(
    u.pathname,
  );
  if (
    u.origin !== "https://x.com" ||
    u.username ||
    u.password ||
    u.hash ||
    !m ||
    !Object.values(operations).includes(m[2] as any)
  )
    throw new SpiderError(
      "INVALID_INPUT",
      "仅允许已确认的 X 只读 GraphQL 操作",
    );
  return { url: u, name: m[2], queryId: m[1] };
}
const allowed: Record<XOperation, string[]> = {
  "profile.detail": ["screen_name"],
  "profile.posts": ["userId", "count", "cursor"],
  "profile.replies": ["userId", "count", "cursor"],
  "profile.reposts": ["userId", "count", "cursor"],
  "profile.media": ["userId", "count", "cursor"],
  "post.detail": ["tweetId"],
  "post.conversation": ["focalTweetId", "cursor", "rankingMode"],
  "search.timeline": ["rawQuery", "product", "count", "cursor"],
  "profile.followers": ["userId", "count", "cursor"],
  "profile.following": ["userId", "count", "cursor"],
};
export function buildRequest(
  operation: XOperation,
  capture: Capture,
  updates: Record<string, unknown>,
  _counter = 0,
) {
  const { url: u, name } = operationUrl(capture.url);
  if (
    capture.method !== "GET" ||
    name !== operations[operation] ||
    capture.name !== name
  )
    throw new SpiderError("INVALID_INPUT", "样本与操作不匹配");
  if (
    [...u.searchParams.keys()].some(
      (k) => !["variables", "features", "fieldToggles"].includes(k),
    )
  )
    throw new SpiderError("RESEARCH_REQUIRED", "发现未分析的请求参数");
  for (const key of ["variables", "features", "fieldToggles"])
    if (u.searchParams.getAll(key).length > 1)
      throw new SpiderError("INVALID_INPUT", "重复请求参数");
  const variables = JSON.parse(u.searchParams.get("variables") ?? "null");
  if (!variables || typeof variables !== "object" || Array.isArray(variables))
    throw new SpiderError("INVALID_INPUT", "样本缺少 variables");
  for (const [k, v] of Object.entries(updates)) {
    if (!allowed[operation].includes(k))
      throw new SpiderError("INVALID_INPUT", `不可更改变量 ${k}`);
    variables[k] = v;
  }
  for (const k of ["userId", "tweetId", "focalTweetId"])
    if (
      variables[k] !== undefined &&
      (typeof variables[k] !== "string" || !/^\d{1,25}$/.test(variables[k]))
    )
      throw new SpiderError("INVALID_INPUT", `无效 ${k}`);
  if (
    operation === "profile.detail" &&
    (typeof variables.screen_name !== "string" ||
      !/^\w{1,15}$/.test(variables.screen_name))
  )
    throw new SpiderError("INVALID_INPUT", "无效用户名");
  if (
    variables.count !== undefined &&
    (!Number.isInteger(variables.count) ||
      variables.count < 1 ||
      variables.count > 40)
  )
    throw new SpiderError("INVALID_INPUT", "count 应为 1–40");
  if (
    variables.cursor !== undefined &&
    (typeof variables.cursor !== "string" ||
      !variables.cursor ||
      variables.cursor.length > 8192)
  )
    throw new SpiderError("INVALID_INPUT", "无效游标");
  if (
    variables.rankingMode !== undefined &&
    !["Relevance", "Recency", "Likes"].includes(variables.rankingMode)
  )
    throw new SpiderError("INVALID_INPUT", "未知回复排序");
  if (
    operation === "search.timeline" &&
    (typeof variables.rawQuery !== "string" ||
      !variables.rawQuery.trim() ||
      variables.rawQuery.length > 500 ||
      !["Top", "Latest", "People", "Media"].includes(variables.product))
  )
    throw new SpiderError("INVALID_INPUT", "无效搜索条件");
  const identityKeys = ["userId", "focalTweetId", "rawQuery", "product"];
  const original = JSON.parse(u.searchParams.get("variables")!);
  if (
    identityKeys.some(
      (k) => Object.hasOwn(updates, k) && updates[k] !== original[k],
    ) &&
    !Object.hasOwn(updates, "cursor")
  )
    delete variables.cursor;
  u.searchParams.set("variables", JSON.stringify(variables));
  const headers: Record<string, string> = {};
  for (const k of [
    "accept",
    "accept-language",
    "authorization",
    "content-type",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "x-twitter-active-user",
    "x-twitter-auth-type",
    "x-twitter-client-language",
  ])
    if (capture.requestHeaders[k]) headers[k] = capture.requestHeaders[k];
  // Do not replay the captured transaction ID, Cookie, CSRF or transport headers.
  // Transport generates a fresh transaction ID from independently fetched assets.
  headers.referer = "https://x.com/";
  if (!headers.authorization)
    throw new SpiderError("LOGIN_REQUIRED", "样本缺少站点客户端授权字段");
  return { method: "GET" as const, url: u.toString(), headers, variables };
}
const schema = (message: string): never => {
  throw new SpiderError("SCHEMA_CHANGED", message);
};
function requiredString(v: any, label: string) {
  if (typeof v !== "string" || !v) return schema(`缺少 ${label}`);
  return v;
}
export function publicUser(v: any) {
  if (v?.__typename === "UserUnavailable")
    return {
      kind: "unavailable" as const,
      id: String(v.rest_id ?? ""),
      reason: String(v.reason ?? "unavailable"),
    };
  if (v?.__typename !== "User") return schema("未知 User 结构");
  if (v.privacy?.protected || v.legacy?.protected)
    throw new SpiderError("INVALID_INPUT", "不采集受保护账号内容");
  return {
    kind: "user" as const,
    id: requiredString(v.rest_id, "user id"),
    username: requiredString(
      v.core?.screen_name ?? v.legacy?.screen_name,
      "username",
    ),
    name: v.core?.name ?? v.legacy?.name,
    bio: v.profile_bio?.description ?? v.legacy?.description,
    createdAt: v.core?.created_at ?? v.legacy?.created_at,
    location: v.location?.location ?? v.legacy?.location,
    avatar: v.avatar?.image_url ?? v.legacy?.profile_image_url_https,
    banner: v.banner?.image_url ?? v.legacy?.profile_banner_url,
    url: v.website?.url ?? v.legacy?.url,
    verified: v.is_blue_verified === true || v.verification?.verified === true,
    verificationType: v.verification?.verified_type,
    followers: v.relationship_counts?.followers ?? v.legacy?.followers_count,
    following: v.relationship_counts?.following ?? v.legacy?.friends_count,
    posts: v.tweet_counts?.tweets ?? v.legacy?.statuses_count,
    mediaCount: v.tweet_counts?.media_tweets ?? v.legacy?.media_count,
  };
}
export function publicTweet(value: any, depth = 0): any {
  const v =
    value?.__typename === "TweetWithVisibilityResults" ? value.tweet : value;
  if (["TweetTombstone", "TweetUnavailable"].includes(v?.__typename))
    return {
      kind: "unavailable",
      id: String(v.rest_id ?? ""),
      reason: v.__typename,
    };
  if (
    (v?.__typename !== "Tweet" &&
      !(
        value?.__typename === "TweetWithVisibilityResults" &&
        v &&
        v.__typename === undefined
      )) ||
    !v?.legacy
  )
    return schema("未知 Tweet 结构");
  const l = v.legacy;
  if (typeof l.full_text !== "string") return schema("帖子缺少文本");
  return {
    kind: "tweet",
    id: requiredString(v.rest_id, "tweet id"),
    text: v.note_tweet?.note_tweet_results?.result?.text ?? l.full_text,
    createdAt: l.created_at,
    language: l.lang,
    conversationId: l.conversation_id_str,
    replyToPostId: l.in_reply_to_status_id_str ?? null,
    replyToUserId: l.in_reply_to_user_id_str ?? null,
    author: publicUser(v.core?.user_results?.result),
    counts: {
      replies: l.reply_count,
      reposts: l.retweet_count,
      quotes: l.quote_count,
      likes: l.favorite_count,
      bookmarks: l.bookmark_count,
      views: v.views?.count,
    },
    media: (l.extended_entities?.media ?? l.entities?.media ?? []).map(
      (m: any) => ({
        id: m.id_str,
        type: m.type,
        url: m.media_url_https,
        alt: m.ext_alt_text,
        width: m.original_info?.width,
        height: m.original_info?.height,
        durationMs: m.video_info?.duration_millis,
        variants: m.video_info?.variants?.map((r: any) => ({
          url: r.url,
          contentType: r.content_type,
          bitrate: r.bitrate,
        })),
      }),
    ),
    urls: l.entities?.urls?.map((u: any) => ({
      url: u.url,
      expandedUrl: u.expanded_url,
      displayUrl: u.display_url,
    })),
    hashtags: l.entities?.hashtags?.map((h: any) => h.text),
    mentions: l.entities?.user_mentions?.map((m: any) => ({
      id: m.id_str,
      username: m.screen_name,
      name: m.name,
    })),
    quote:
      depth < 2 && v.quoted_status_result?.result
        ? publicTweet(v.quoted_status_result.result, depth + 1)
        : undefined,
    repost:
      depth < 2 && l.retweeted_status_result?.result
        ? publicTweet(l.retweeted_status_result.result, depth + 1)
        : undefined,
  };
}
export function parseTimeline(instructions: any) {
  if (!Array.isArray(instructions)) return schema("缺少 timeline.instructions");
  const items: any[] = [],
    unavailable: any[] = [],
    moduleCursors: any[] = [],
    skipped: Record<string, number> = {};
  let cursor: string | undefined,
    terminated = false;
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  function item(c: any, entryId: string) {
    if (!c) return schema("缺少 itemContent");
    if (c.promotedMetadata) {
      skip("promoted");
      return;
    }
    if (c.itemType === "TimelineTweet") {
      const t = publicTweet(c.tweet_results?.result);
      if (t.kind === "unavailable") unavailable.push({ ...t, entryId });
      else items.push(t);
    } else if (c.itemType === "TimelineUser") {
      if (
        c.user_results?.result?.privacy?.protected ||
        c.user_results?.result?.legacy?.protected
      ) {
        skip("protected-user");
        return;
      }
      const u = publicUser(c.user_results?.result);
      if (u.kind === "unavailable") unavailable.push({ ...u, entryId });
      else items.push(u);
    } else if (c.itemType === "TimelineLabel" && typeof c.text === "string") {
      skip("timeline-label");
    } else if (c.itemType === "TimelineJob") {
      const j = c.job_results?.result;
      if (j?.__typename !== "ApiJob") return schema("未知 job 结构");
      items.push({
        kind: "job",
        id: requiredString(j.rest_id, "job id"),
        title: requiredString(j.core?.title, "job title"),
        url: j.core.job_page_url,
        externalUrl: j.core.external_url,
        location: j.core.location,
        locationType: j.core.location_type,
        organization: {
          id: j.recruiting_organization_results?.result?.rest_id,
          name: j.recruiting_organization_results?.result?.profile?.name,
          username:
            j.recruiting_organization_results?.result?.profile?.screen_name,
        },
      });
    } else if (c.itemType === "TimelineTimelineCursor") {
      moduleCursors.push({
        entryId,
        type: c.cursorType,
        cursor: requiredString(c.value, "module cursor"),
      });
    } else if (
      c.itemType === "TimelinePrompt" &&
      c.content?.contentType === "TimelineRelevancePrompt"
    ) {
      skip("search-relevance-feedback");
    } else if (
      ["TimelineTombstone", "TimelineMessagePrompt"].includes(c.itemType)
    )
      unavailable.push({ entryId, kind: c.itemType });
    else schema(`未知 timeline item: ${c.itemType}`);
  }
  function entry(e: any) {
    const c = e?.content;
    if (!c) return schema("缺少 timeline entry.content");
    if (c.entryType === "TimelineTimelineCursor") {
      if (c.cursorType === "Bottom")
        cursor = requiredString(c.value, "bottom cursor");
      else if (c.cursorType !== "Top")
        moduleCursors.push({
          entryId: e.entryId,
          type: c.cursorType,
          cursor: requiredString(c.value, "cursor"),
        });
    } else if (c.entryType === "TimelineTimelineItem")
      item(c.itemContent, e.entryId);
    else if (c.entryType === "TimelineTimelineModule") {
      if (!Array.isArray(c.items)) return schema("module 缺少 items");
      if (String(e.entryId).startsWith("who-to-follow")) {
        skip("recommendation-module");
        return;
      }
      for (const m of c.items) item(m.item?.itemContent, m.entryId);
    } else schema(`未知 timeline entry: ${c.entryType}`);
  }
  for (const i of instructions) {
    if (i.type === "TimelineAddEntries") {
      if (!Array.isArray(i.entries)) return schema("缺少 entries");
      for (const e of i.entries) entry(e);
    } else if (
      i.type === "TimelineReplaceEntry" ||
      i.type === "TimelinePinEntry"
    )
      entry(i.entry);
    else if (i.type === "TimelineAddToModule") {
      if (!Array.isArray(i.moduleItems)) return schema("缺少 moduleItems");
      for (const m of i.moduleItems) item(m.item?.itemContent, m.entryId);
    } else if (i.type === "TimelineTerminateTimeline") {
      if (i.direction === "Bottom" || i.direction === "TopAndBottom")
        terminated = true;
    } else if (
      ![
        "TimelineClearCache",
        "TimelineShowAlert",
        "TimelineShowCover",
      ].includes(i.type)
    )
      schema(`未知 timeline instruction: ${i.type}`);
  }
  const unique = [
    ...new Map(items.map((v) => [v.kind + ":" + v.id, v])).values(),
  ];
  return {
    items: unique,
    duplicates: items.length - unique.length,
    hasMore: !!cursor && !terminated,
    cursor: terminated ? undefined : cursor,
    moduleCursors,
    unavailable,
    skipped,
  };
}
export function validateResult(
  operation: XOperation,
  variables: Record<string, any>,
  status: number,
  body: string,
) {
  if (status === 429) throw new SpiderError("RATE_LIMIT", "X 限流");
  if (status === 401) throw new SpiderError("LOGIN_REQUIRED", "X 登录失效");
  if (status === 403)
    throw new SpiderError("CHALLENGE", "X 拒绝访问，需对照响应");
  if (status === 404 && body.length === 0)
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "X 空 HTTP 404：服务端未提供原因，不能据此判定接口下线、响应结构变化或限流",
    );
  if (status !== 200)
    throw new SpiderError(
      status >= 500 ? "NETWORK" : "SCHEMA_CHANGED",
      `X HTTP ${status}`,
    );
  let j: any;
  try {
    j = JSON.parse(body);
  } catch {
    throw new SpiderError("SCHEMA_CHANGED", "X 响应不是 JSON");
  }
  if (j.errors !== undefined && !Array.isArray(j.errors))
    return schema("errors 结构变化");
  if (j.errors?.length) {
    const codes = j.errors.map((e: any) => e.code);
    throw new SpiderError(
      codes.includes(88)
        ? "RATE_LIMIT"
        : codes.some((c: number) => [32, 89, 215].includes(c))
          ? "LOGIN_REQUIRED"
          : codes.some((c: number) => [63, 64, 326, 353].includes(c))
            ? "CHALLENGE"
            : "SCHEMA_CHANGED",
      `X 业务错误 ${codes.join(",")}`,
    );
  }
  if (!j.data) return schema("缺少 data");
  if (operation === "profile.detail") {
    const user = publicUser(j.data.user?.result);
    if (
      user.kind !== "user" ||
      user.username.toLowerCase() !== variables.screen_name.toLowerCase()
    )
      return schema("用户返回不匹配");
    return { raw: { items: [user] }, chunks: [j] };
  }
  if (operation === "post.detail") {
    const tweet = publicTweet(j.data.tweetResult?.result);
    if (tweet.kind !== "tweet" || tweet.id !== variables.tweetId)
      return schema("帖子返回不匹配");
    return { raw: { items: [tweet] }, chunks: [j] };
  }
  const instructions =
    operation === "post.conversation"
      ? j.data.threaded_conversation_with_injections_v2?.instructions
      : operation === "search.timeline"
        ? j.data.search_by_raw_query?.search_timeline?.timeline?.instructions
        : j.data.user?.result?.timeline?.timeline?.instructions;
  const page = parseTimeline(instructions);
  if (
    operation === "post.conversation" &&
    !variables.cursor &&
    !page.items.some((t) => t.id === variables.focalTweetId)
  )
    return schema("对话第一页缺少主帖");
  return { raw: { items: page.items }, page, chunks: [j] };
}
