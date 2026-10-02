import {
  DatalomError,
  type ExecutionContext,
  type RequestTemplate,
} from "@datalom/shared/runtime/contracts";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import { cookieJar } from "@datalom/network-node/cookies";
import { signInProcess } from "./signer-process.ts";
import { parseApi } from "./adapter.ts";

// Internal original-endpoint interface. No public HTTP routes or browser dependency.
// Every entry below is backed by an encrypted successful browser capture.
export const nativeEndpoints = {
  "video.detail": {
    path: "/api/item/detail/", fields: ["itemId"], required: ["itemId"], object: "itemInfo",
  },
  "video.comments": {
    path: "/api/comment/list/", fields: ["aweme_id", "cursor", "count"], required: ["aweme_id"],
    list: "comments", cursor: "cursor", more: "has_more",
  },
  "live.feed": {
    origin: "https://webcast.us.tiktok.com",
    path: "/webcast/feed/",
    fields: ["channel_id", "content_type", "max_time", "req_from"],
    required: ["channel_id"],
    list: "data",
  },
  "live.alive": {
    origin: "https://webcast.us.tiktok.com",
    path: "/webcast/room/check_alive/",
    fields: ["room_ids"],
    required: ["room_ids"],
    list: "data",
  },
  "live.audience": {
    origin: "https://webcast.us.tiktok.com",
    path: "/webcast/ranklist/online_audience/",
    fields: ["room_id", "anchor_id", "source"],
    required: ["room_id", "anchor_id"],
    object: "data",
  },
  "live.gifts": {
    origin: "https://webcast.us.tiktok.com",
    path: "/webcast/gift/list/",
    fields: ["room_id"],
    required: ["room_id"],
    object: "data",
  },
  "feed.explore": {
    path: "/api/explore/item_list/",
    fields: ["categoryType", "count", "pullType"],
    required: ["categoryType"],
    list: "itemList",
  },
  "music.detail": {
    path: "/api/music/detail/",
    fields: ["musicId"],
    required: ["musicId"],
    object: "musicInfo",
  },
  "music.posts": {
    path: "/api/music/item_list/",
    fields: ["musicID", "cursor", "count"],
    required: ["musicID"],
    list: "itemList",
    cursor: "cursor",
    more: "hasMore",
  },
  "user.playlists": {
    path: "/api/user/playlist/",
    fields: ["secUid", "cursor", "count"],
    required: ["secUid"],
    list: "playList",
    cursor: "cursor",
    more: "hasMore",
  },
  "user.reposts": {
    path: "/api/repost/item_list/",
    fields: ["secUid", "cursor", "count"],
    required: ["secUid"],
    list: "itemList",
    cursor: "cursor",
    more: "hasMore",
  },
  "playlist.detail": {
    path: "/api/mix/detail/",
    fields: ["mixId"],
    required: ["mixId"],
    object: "mixInfo",
  },
  "playlist.posts": {
    path: "/api/mix/item_list/",
    fields: ["mixId", "cursor", "count"],
    required: ["mixId"],
    list: "itemList",
    cursor: "cursor",
    more: "hasMore",
  },
  "user.followers": {
    path: "/api/user/list/",
    fields: ["secUid", "minCursor", "maxCursor", "count"],
    required: ["secUid"],
    list: "userList",
  },
  "comment.replies": {
    path: "/api/comment/list/reply/",
    fields: ["item_id", "comment_id", "cursor", "count"],
    required: ["item_id", "comment_id"],
    list: "comments",
    cursor: "cursor",
    more: "has_more",
  },
  "user.detail": {
    path: "/api/user/detail/",
    fields: ["uniqueId", "secUid"],
    required: [],
    object: "userInfo",
  },
  "user.posts": {
    path: "/api/post/item_list/",
    fields: ["secUid", "cursor", "count"],
    required: ["secUid"],
    list: "itemList",
    cursor: "cursor",
    more: "hasMore",
  },
  "search.general": {
    path: "/api/search/general/full/",
    fields: ["keyword", "cursor", "offset", "count"],
    required: ["keyword"],
    list: "data",
    cursor: "cursor",
    more: "has_more",
  },
  "search.videos": {
    path: "/api/search/item/full/",
    fields: ["keyword", "cursor", "offset", "count"],
    required: ["keyword"],
    list: "item_list",
    cursor: "cursor",
    more: "has_more",
  },
  "search.users": {
    path: "/api/search/user/full/",
    fields: ["keyword", "cursor", "offset", "count"],
    required: ["keyword"],
    list: "user_list",
    cursor: "cursor",
    more: "has_more",
  },
  "search.photos": {
    path: "/api/search/photo/full/",
    fields: ["keyword", "cursor", "offset", "count"],
    required: ["keyword"],
    list: "item_list",
    cursor: "cursor",
    more: "has_more",
  },
  "search.preview": {
    path: "/api/search/general/preview/",
    fields: ["keyword"],
    required: ["keyword"],
    list: "sug_list",
  },
  "hashtag.detail": {
    path: "/api/challenge/detail/",
    fields: ["challengeName"],
    required: ["challengeName"],
    object: "challengeInfo",
  },
  "hashtag.posts": {
    path: "/api/challenge/item_list/",
    fields: ["challengeID", "cursor", "count"],
    required: ["challengeID"],
    list: "itemList",
    cursor: "cursor",
    more: "hasMore",
  },
} as const;
export type NativeOperation = keyof typeof nativeEndpoints;
interface Definition {
  origin?: string;
  path: string;
  fields: readonly string[];
  required: readonly string[];
  list?: string;
  object?: string;
  cursor?: string;
  more?: string;
}
export interface NativeInput {
  operation: NativeOperation;
  parameters: Record<string, string>;
}
export interface NativeResult {
  raw: Record<string, any>;
  count?: number;
  cursor?: string;
  hasMore?: boolean;
  adapterVersion: string;
}

export function validateNativeInput(
  input: NativeInput,
  template: RequestTemplate,
) {
  if (!Object.hasOwn(nativeEndpoints, input.operation))
    throw new DatalomError("INVALID_INPUT", "未知原站操作");
  const def: Definition = nativeEndpoints[input.operation];
  const u = new URL(template.url);
  if (
    u.origin !== (def.origin ?? "https://www.tiktok.com") ||
    u.pathname !== def.path ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new DatalomError("INVALID_INPUT", "原站模板路径不匹配");
  if (
    input.operation === "user.followers" &&
    u.searchParams.get("scene") !== "67"
  )
    throw new DatalomError(
      "INVALID_INPUT",
      "粉丝接口需要实际观察的 scene=67 样本",
    );
  for (const [key, value] of Object.entries(input.parameters)) {
    if (
      !def.fields.includes(key) ||
      typeof value !== "string" ||
      value.length > 1024
    )
      throw new DatalomError("INVALID_INPUT", `不允许的原站参数：${key}`);
    if (key === "room_ids" && !/^\d{1,25}(,\d{1,25}){0,19}$/.test(value))
      throw new DatalomError("INVALID_INPUT", "开播状态需要 1–20 个房间 ID");
    if (["room_id", "anchor_id"].includes(key) && !/^\d{1,25}$/.test(value))
      throw new DatalomError("INVALID_INPUT", "房间或主播 ID 无效");
    if (
      [
        "cursor",
        "offset",
        "count",
        "minCursor",
        "maxCursor",
        "categoryType",
        "pullType",
      ].includes(key) &&
      !/^\d{1,20}$/.test(value)
    )
      throw new DatalomError("INVALID_INPUT", `分页参数无效：${key}`);
    if (key === "count" && (Number(value) < 1 || Number(value) > 50))
      throw new DatalomError("INVALID_INPUT", "单页条数必须为 1–50");
    if (
      [
        "item_id",
        "itemId",
        "aweme_id",
        "comment_id",
        "challengeID",
        "musicId",
        "musicID",
        "mixId",
      ].includes(key) &&
      !/^\d{1,25}$/.test(value)
    )
      throw new DatalomError("INVALID_INPUT", `无效 ID：${key}`);
  }
  // Explicit identities are mandatory: never silently query a template's old subject.
  for (const key of def.required)
    if (!input.parameters[key]?.trim())
      throw new DatalomError("INVALID_INPUT", `缺少参数：${key}`);
  if (
    input.operation === "user.detail" &&
    !input.parameters.uniqueId &&
    !input.parameters.secUid
  )
    throw new DatalomError("INVALID_INPUT", "需要 uniqueId 或 secUid");
  return def;
}

export function parseNative(
  input: NativeInput,
  status: number,
  body: string,
): NativeResult {
  if (status >= 400 && status < 500 && ![401, 403, 429].includes(status))
    throw new DatalomError(
      "RESEARCH_REQUIRED",
      `原站 HTTP ${status}，需检查契约和响应`,
    );
  const raw = parseApi(status, body);
  const def: Definition = nativeEndpoints[input.operation];
  const fail = (message: string): never => {
    throw new DatalomError("SCHEMA_CHANGED", message);
  };
  if (
    def.object &&
    (!raw[def.object] ||
      typeof raw[def.object] !== "object" ||
      Array.isArray(raw[def.object]))
  )
    fail(`缺少 ${def.object}`);
  if (def.list && !Array.isArray(raw[def.list])) fail(`缺少数组 ${def.list}`);
  const result: NativeResult = { raw, adapterVersion: "tiktok-native@0.1.0" };
  if (def.list) result.count = raw[def.list].length;
  if (def.cursor && def.more) {
    const cursor = raw[def.cursor];
    if (!(
      (typeof cursor === "string" && cursor.length > 0) ||
      (typeof cursor === "number" &&
        Number.isSafeInteger(cursor) &&
        cursor >= 0)
    ))
      fail("游标缺失或精度不可验证");
    if (![true, false, 0, 1].includes(raw[def.more])) fail("分页终止标志缺失");
    result.cursor = String(cursor);
    result.hasMore = !!raw[def.more];
    if (result.hasMore && result.cursor === (input.parameters.cursor ?? "0"))
      fail("游标未推进");
  }
  if (input.operation === "video.detail" && String(raw.itemInfo?.itemStruct?.id) !== input.parameters.itemId)
    fail("视频详情 ID 不匹配");
  if (input.operation === "video.comments" && raw.comments.some((c: any) => !c || typeof c.cid !== "string"))
    fail("评论 ID 缺失");
  if (input.operation === "comment.replies") {
    const ids = new Set<string>();
    for (const c of raw.comments) {
      if (
        !c ||
        typeof c.cid !== "string" ||
        !/^\d+$/.test(c.cid) ||
        ids.has(c.cid)
      )
        fail("回复 ID 缺失或单页重复");
      ids.add(c.cid);
      if (
        c.aweme_id !== input.parameters.item_id ||
        c.reply_id !== input.parameters.comment_id
      )
        fail("回复的视频或根评论关系不匹配");
      if (
        typeof c.reply_to_reply_id !== "string" ||
        !/^\d+$/.test(c.reply_to_reply_id)
      )
        fail("回复目标关系缺失");
    }
  }
  if (input.operation === "user.detail") {
    const user = raw.userInfo.user;
    if (
      !user ||
      typeof user.id !== "string" ||
      (input.parameters.uniqueId &&
        user.uniqueId !== input.parameters.uniqueId) ||
      (input.parameters.secUid && user.secUid !== input.parameters.secUid)
    )
      fail("用户身份不匹配");
  }
  if (
    input.operation === "music.detail" &&
    raw.musicInfo.music?.id !== input.parameters.musicId
  )
    fail("音乐 ID 不匹配");
  if (
    input.operation === "playlist.detail" &&
    raw.mixInfo.id !== input.parameters.mixId
  )
    fail("播放列表 ID 不匹配");
  if (
    input.operation === "hashtag.detail" &&
    raw.challengeInfo.challenge?.title?.toLowerCase() !==
      input.parameters.challengeName.toLowerCase()
  )
    fail("话题名称不匹配");
  if (def.list === "itemList" || def.list === "item_list") {
    if (
      raw[def.list].some(
        (item: any) =>
          !item || typeof item.id !== "string" || !/^\d+$/.test(item.id),
      )
    )
      fail("作品缺少唯一 ID");
  }
  if (input.operation === "user.followers") {
    if (
      ![true, false, 0, 1].includes(raw.hasMore) ||
      typeof raw.minCursor !== "number" ||
      !Number.isSafeInteger(raw.minCursor)
    )
      fail("粉丝列表的分页结构变化");
    if (raw.userList.some((u: any) => typeof u?.user?.id !== "string"))
      fail("粉丝条目缺少用户 ID");
    result.hasMore = !!raw.hasMore;
    // Both original cursors remain in raw. This CLI intentionally does not infer the next query.
  }
  if (input.operation === "live.alive") {
    const requested = new Set(input.parameters.room_ids.split(","));
    const returned = new Set<string>();
    for (const item of raw.data) {
      if (
        typeof item?.room_id_str !== "string" ||
        !requested.has(item.room_id_str) ||
        returned.has(item.room_id_str) ||
        ![true, false, 0, 1].includes(item.alive)
      )
        fail("开播状态缺少准确房间 ID 或布尔状态");
      returned.add(item.room_id_str);
    }
    if (returned.size !== requested.size) fail("部分房间缺少开播状态");
  }
  if (input.operation === "live.audience" || input.operation === "live.gifts") {
    const list =
      raw.data[input.operation === "live.audience" ? "ranks" : "gifts"];
    if (!Array.isArray(list)) fail("直播列表结构变化");
    result.count = list.length;
  }
  if (input.operation === "live.feed") {
    if (!raw.extra || typeof raw.extra !== "object") fail("直播推荐缺少元数据");
    // Suggested-host responses observed independently omit has_more. Absence is
    // unknown, not terminal; raw max_time and channel context remain intact.
    if (Object.hasOwn(raw.extra, "has_more")) {
      if (![true, false, 0, 1].includes(raw.extra.has_more))
        fail("直播推荐后续状态类型变化");
      result.hasMore = !!raw.extra.has_more;
    }
  }
  // Preserve the original response, including root and reply-to-reply relationships.
  return result;
}

export async function executeNative(
  input: NativeInput,
  template: RequestTemplate,
  context: ExecutionContext,
): Promise<NativeResult> {
  let stage = "parameters";
  try {
    validateNativeInput(input, template);
    context.trace?.("native-parameters", "validated", {
      input,
      templateCapturedAt: template.capturedAt,
    });
    stage = "sign";
    context.session.research ??= {};
    const counter = (context.session.research.requestCount ?? 0) + 1;
    context.session.research.requestCount = counter;
    const updates = { ...input.parameters };
    if (input.operation === "user.detail") {
      updates.uniqueId ??= "";
      updates.secUid ??= "";
    }
    const signedUrl = await signInProcess(
      {
        templateUrl: template.url,
        userAgent: context.session.observed.userAgent,
        updates,
        counter,
        msToken: cookieJar(context.session)
          .getCookiesSync(template.url)
          .find((c) => c.key === "msToken")?.value,
      },
      context.signal,
    );
    const headers = Object.fromEntries(
      Object.entries(template.headers).filter(([k]) =>
        [
          "accept",
          "accept-language",
          "priority",
          "sec-ch-ua",
          "sec-ch-ua-mobile",
          "sec-ch-ua-platform",
          "sec-fetch-dest",
          "sec-fetch-mode",
          "sec-fetch-site",
          "referer",
        ].includes(k.toLowerCase()),
      ),
    );
    headers["user-agent"] = context.session.observed.userAgent;
    stage = "http";
    context.trace?.("native-request", "started", {
      signedUrl,
      headers,
      counter,
      browserUsed: false,
    });
    const response = await context.transport.request(signedUrl, {
      signal: context.signal,
      headers,
    });
    context.recordEvidence(
      "native-independent-response",
      `${input.operation} · HTTP ${response.status}`,
      {
        input,
        signedUrl,
        status: response.status,
        body: response.body,
        responseHeaders: Object.fromEntries(response.headers),
        counter,
        browserUsed: false,
      },
    );
    stage = "session-save";
    context.saveSession();
    stage = "parse";
    const result = parseNative(input, response.status, response.body);
    context.trace?.("native-parse", "completed", {
      count: result.count,
      cursor: result.cursor,
      hasMore: result.hasMore,
    });
    return result;
  } catch (error) {
    context.trace?.(
      "native-failure",
      "failed",
      { stage, input, error: errorRecord(error) },
      error instanceof DatalomError ? error.code : "INTERNAL",
    );
    throw error;
  }
}
