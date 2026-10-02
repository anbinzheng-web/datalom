import {
  aggregate,
  languageCode,
  mediaUrl as mediaAssetUrl,
  normalized,
  regionCode,
  type DataRow,
  type ParsedPage,
} from '@datalom/platform-runtime/tiktok-parser';
import { mediaUrl } from './instagram-api.ts';

export { aggregate };
export type { DataRow, ParsedPage };

const obj = (v: unknown): DataRow =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as DataRow) : {};
const id = (v: unknown): string | null =>
  typeof v === 'string' && v
    ? v
    : typeof v === 'number' && Number.isSafeInteger(v)
      ? String(v)
      : null;
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
    ? v
    : typeof v === 'string' && /^\d+$/.test(v) && Number.isSafeInteger(Number(v))
      ? Number(v)
      : null;

function endedOf(more: unknown): boolean | null {
  return more === false || more === 0 ? true : more === true || more === 1 ? false : null;
}

function captionText(row: DataRow): string {
  const caption = obj(row.caption);
  if (typeof caption.text === 'string') return caption.text;
  if (typeof row.caption === 'string') return row.caption;
  const first = Array.isArray(row.edge_media_to_caption)
    ? row.edge_media_to_caption[0]
    : Array.isArray(obj(row.edge_media_to_caption).edges)
      ? (obj(row.edge_media_to_caption).edges as unknown[])[0]
      : undefined;
  const node = obj(obj(first).node);
  return typeof node.text === 'string' ? node.text : '';
}

function countOf(value: unknown): number | null {
  if (typeof value === 'number') return number(value);
  return number(obj(value).count);
}

function isPrivateMedia(row: DataRow): boolean {
  const code = id(row.code ?? row.shortcode);
  const pk = id(row.pk ?? row.pk_id ?? row.id);
  if (!pk && !code) return false;
  return (
    row.media_type != null ||
    row.product_type != null ||
    !!row.image_versions2 ||
    !!row.video_versions ||
    !!row.carousel_media ||
    typeof obj(row.caption).text === 'string' ||
    row.like_count != null
  );
}

function isGraphqlMedia(row: DataRow): boolean {
  const shortcode = id(row.shortcode ?? row.code);
  if (!shortcode && !id(row.id)) return false;
  return (
    row.edge_liked_by != null ||
    row.edge_media_to_caption != null ||
    row.edge_media_to_comment != null ||
    (typeof row.__typename === 'string' && /Graph(Video|Image|Sidecar)/i.test(row.__typename))
  );
}

function collectMedia(value: unknown, out: unknown[], depth = 0) {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectMedia(item, out, depth + 1);
    return;
  }
  const row = obj(value);
  const nested = obj(row.media);
  if (isPrivateMedia(nested) || isGraphqlMedia(nested)) out.push(nested);
  else if (isPrivateMedia(row) || isGraphqlMedia(row)) out.push(row);
  else {
    for (const key of [
      'media_grid',
      'sections',
      'layout_content',
      'medias',
      'fill_items',
      'items',
      'clips',
      'data',
      'xdt_api__v1__fbsearch__top_serp',
      'xdt_api__v1__fbsearch__reels_serp',
      'xdt_fbsearch__top_serp_graphql',
      'xdt_fbsearch__reels_serp_graphql',
      'xdt_location_to_media',
      'media_or_ad',
      'search_results',
      'keyword_results',
      'edge_hashtag_to_media',
      'edge_hashtag_to_top_posts',
      'edges',
      'node',
    ])
      if (row[key] != null) collectMedia(row[key], out, depth + 1);
  }
}

function videoTags(description: string, row: DataRow) {
  const tags = [...description.matchAll(/#([^\s#.,!?，。！？:：;；]+)/gu)].map((m) => m[1]);
  const extra = row.usertags ?? obj(row.usertags).in;
  if (Array.isArray(extra)) {
    for (const item of extra) {
      const tag = obj(obj(item).user).username;
      if (typeof tag === 'string' && tag) tags.push(tag);
    }
  }
  const seen = new Set<string>(),
    unique: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim();
    const key = normalized(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }
  return unique;
}

function mapMedia(item: unknown, observedAt: string): DataRow | null {
  const wrapped = obj(item);
  const row = isPrivateMedia(obj(wrapped.media))
    ? obj(wrapped.media)
    : isPrivateMedia(wrapped) || isGraphqlMedia(wrapped)
      ? wrapped
      : obj(wrapped.node);
  if (!isPrivateMedia(row) && !isGraphqlMedia(row)) return null;
  const shortcode = id(row.code ?? row.shortcode);
  const videoId = id(row.pk ?? row.pk_id ?? row.id);
  if (!videoId && !shortcode) return null;
  const author = obj(row.user ?? row.owner);
  const handle = id(author.username ?? author.uniqueId);
  const description = captionText(row);
  const productType =
    typeof row.product_type === 'string' ? row.product_type : row.media_type === 2 ? 'clips' : null;
  const likes = number(row.like_count) ?? countOf(row.edge_liked_by);
  const commentsCount = number(row.comment_count) ?? countOf(row.edge_media_to_comment);
  const plays =
    number(row.play_count ?? row.view_count ?? row.ig_play_count) ??
    countOf(row.video_play_count ?? row.video_view_count);
  return {
    videoId: videoId ?? shortcode,
    shortcode,
    url: shortcode ? mediaUrl(shortcode, productType) : null,
    description,
    authorId: id(author.pk ?? author.pk_id ?? author.id),
    authorHandle: handle,
    authorName: author.full_name ?? author.fullName ?? author.nickname ?? null,
    createdAt: number(row.taken_at ?? row.taken_at_timestamp ?? row.device_timestamp),
    likes,
    commentsCount,
    plays,
    shares: number(row.share_count ?? row.reshare_count),
    favorites: null,
    productType,
    coverUrl: mediaAssetUrl(
      obj(row.image_versions2).candidates ?? row.display_url ?? row.thumbnail_src,
    ),
    tags: videoTags(description, row),
    rank: 0,
    observedAt,
    raw: item,
  };
}

function collectComments(value: unknown, out: unknown[], depth = 0) {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectComments(item, out, depth + 1);
    return;
  }
  const row = obj(value);
  if (Array.isArray(row.comments)) {
    out.push(...row.comments);
    return;
  }
  if (Array.isArray(obj(row.edge_media_to_parent_comment).edges)) {
    out.push(...(obj(row.edge_media_to_parent_comment).edges as unknown[]));
    return;
  }
  if (Array.isArray(obj(row.edge_media_to_comment).edges)) {
    out.push(...(obj(row.edge_media_to_comment).edges as unknown[]));
    return;
  }
  for (const key of ['data', 'xdt_shortcode_media', 'node'])
    if (row[key] != null) collectComments(row[key], out, depth + 1);
}

function mapComment(item: unknown, observedAt: string, videoId: string): DataRow | null {
  const wrapped = obj(item);
  const row = obj(wrapped.node).id || obj(wrapped.node).pk ? obj(wrapped.node) : wrapped;
  const comment = id(row.pk ?? row.id ?? row.comment_id);
  if (!comment) return null;
  const returnedVideo = id(row.media_id ?? row.mediaId);
  if (returnedVideo && returnedVideo !== videoId) return null;
  const user = obj(row.user ?? row.owner ?? row.user_info);
  const uid = id(user.pk ?? user.pk_id ?? user.id ?? user.uid);
  const handle = id(user.username ?? user.unique_id);
  const text = typeof (row.text ?? row.content) === 'string' ? String(row.text ?? row.content) : '';
  return {
    commentId: comment,
    videoId,
    text,
    contentType: text ? 'text' : 'non-text',
    likes: number(row.comment_like_count ?? row.like_count) ?? countOf(row.edge_liked_by),
    replyCount: number(row.child_comment_count ?? row.reply_count),
    createdAt: number(row.created_at ?? row.created_at_utc ?? row.createdAt),
    userKey: uid ? `uid:${uid}` : handle ? `handle:${handle}` : null,
    userId: uid,
    handle,
    nickname: typeof user.full_name === 'string' ? user.full_name : (user.fullName ?? null),
    commentLanguage: languageCode(row.comment_language ?? row.commentLanguage),
    region: regionCode(user.region),
    accountRegion: regionCode(user.account_region ?? user.accountRegion),
    signature: typeof user.biography === 'string' ? user.biography : null,
    avatarUrl: mediaAssetUrl(user.profile_pic_url ?? user.profile_pic_url_hd),
    observedAt,
    raw: item,
  };
}

export function parseInstagram(
  value: unknown,
  observedAt: string,
  videoId?: string,
): ParsedPage | null {
  const root = obj(value);
  if (!videoId) {
    const media: unknown[] = [];
    collectMedia(root, media);
    const records = media
      .map((item) => mapMedia(item, observedAt))
      .filter((row): row is DataRow => !!row);
    if (records.length) {
      const seen = new Set<string>();
      const unique = records.filter((row) => {
        const key = String(row.videoId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      unique.forEach((row, index) => {
        row.rank = index + 1;
      });
      const serp = obj(obj(root.data).xdt_fbsearch__top_serp_graphql);
      return {
        kind: 'videos',
        ended: endedOf(
          root.has_more ??
            root.more_available ??
            obj(root.paging_info).more_available ??
            obj(root.page_info).has_next_page ??
            obj(serp.page_info).has_next_page,
        ),
        records: unique,
      };
    }
    return null;
  }
  const comments: unknown[] = [];
  collectComments(root, comments);
  if (!comments.length && Array.isArray(root.comments)) comments.push(...root.comments);
  const records = comments
    .map((item) => mapComment(item, observedAt, videoId))
    .filter((row): row is DataRow => !!row);
  if (
    records.length ||
    (comments.length === 0 &&
      (root.status === 'ok' || endedOf(root.has_more_headload_comments) === true))
  )
    return {
      kind: 'comments',
      ended: endedOf(
        root.has_more_headload_comments ??
          root.has_more_comments ??
          root.has_more ??
          obj(obj(root.edge_media_to_parent_comment).page_info).has_next_page,
      ),
      records,
    };
  return null;
}
