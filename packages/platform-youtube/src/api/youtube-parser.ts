import {
  aggregate,
  languageCode,
  mediaUrl as mediaAssetUrl,
  regionCode,
  type DataRow,
  type ParsedPage,
} from '@datalom/platform-runtime/tiktok-parser';
import { watchUrl } from './youtube-api.ts';

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

/** YouTube search often uses "1.2K views" / "1,234" / missing entirely. */
export function compactCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    return Number.isInteger(value) ? value : Math.floor(value);
  if (typeof value !== 'string') return null;
  const text = value.replace(/,/g, '').trim();
  const match = /^([\d.]+)\s*([kKmM万亿bB]?)/.exec(text);
  if (!match) return /^\d+$/.test(text) ? Number(text) : null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = match[2];
  const scaled =
    unit === 'k' || unit === 'K'
      ? n * 1_000
      : unit === 'm' || unit === 'M' || unit === '万'
        ? n * (unit === '万' ? 10_000 : 1_000_000)
        : unit === '亿' || unit === 'b' || unit === 'B'
          ? n * (unit === '亿' ? 100_000_000 : 1_000_000_000)
          : n;
  return Math.floor(scaled);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const row = obj(value);
  if (typeof row.simpleText === 'string') return row.simpleText;
  if (typeof row.content === 'string') return row.content;
  if (Array.isArray(row.runs))
    return row.runs
      .map((run) => obj(run).text)
      .filter((part) => typeof part === 'string')
      .join('');
  if (typeof row.label === 'string') return row.label;
  const accessible = obj(obj(row.accessibility).accessibilityData).label;
  if (typeof accessible === 'string') return accessible;
  return '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);
    if (text) return text;
  }
  return '';
}

function accessibilityLabel(row: DataRow): string {
  return textOf(obj(row.accessibility).accessibilityData) || textOf(row.accessibility);
}

function videoFromRenderer(row: DataRow): DataRow | null {
  const videoId =
    id(row.videoId) ??
    id(obj(obj(row.navigationEndpoint).watchEndpoint).videoId) ??
    id(obj(obj(row.navigationEndpoint).reelWatchEndpoint).videoId) ??
    id(obj(obj(obj(row.onTap).innertubeCommand).watchEndpoint).videoId) ??
    id(obj(obj(obj(row.onTap).innertubeCommand).reelWatchEndpoint).videoId);
  if (!videoId) return null;
  const title = textOf(row.title) || textOf(row.headline) || accessibilityLabel(row);
  const owner = obj(row.ownerText ?? row.shortBylineText ?? row.longBylineText);
  const ownerRun = Array.isArray(owner.runs) ? obj(owner.runs[0]) : owner;
  const browse = obj(obj(obj(ownerRun.navigationEndpoint).browseEndpoint));
  const handle =
    id(ownerRun.text) ??
    id(row.ownerHandle) ??
    (typeof browse.canonicalBaseUrl === 'string'
      ? browse.canonicalBaseUrl.replace(/^\//, '')
      : null);
  const views =
    compactCount(textOf(row.viewCountText)) ??
    compactCount(textOf(row.shortViewCountText)) ??
    compactCount(row.viewCount);
  const likes =
    compactCount(row.likeCount) ??
    compactCount(textOf(row.likeCountText)) ??
    compactCount(obj(row.likeButton).likeCount);
  const commentsCount =
    compactCount(row.commentCount) ?? compactCount(textOf(row.commentCountText));
  const thumbs = row.thumbnail ?? obj(row.thumbnail).thumbnails;
  const cover = Array.isArray(thumbs) ? thumbs[thumbs.length - 1] : thumbs;
  return {
    videoId,
    url: watchUrl(videoId),
    description: title,
    authorId: id(browse.browseId) ?? id(row.channelId),
    authorHandle: handle,
    authorName: typeof ownerRun.text === 'string' ? ownerRun.text : handle,
    createdAt: null,
    publishedText: textOf(row.publishedTimeText) || null,
    likes,
    commentsCount,
    plays: views,
    shares: null,
    favorites: null,
    coverUrl: mediaAssetUrl(obj(cover).url),
    tags: title ? [...title.matchAll(/#([^\s#.,!?，。！？:：;；]+)/gu)].map((m) => m[1]) : [],
    rank: 0,
    raw: row,
  };
}

function collectVideos(value: unknown, out: unknown[], depth = 0) {
  if (!value || depth > 12) return;
  if (Array.isArray(value)) {
    for (const item of value) collectVideos(item, out, depth + 1);
    return;
  }
  const row = obj(value);
  if (row.videoRenderer) out.push(row.videoRenderer);
  if (row.compactVideoRenderer) out.push(row.compactVideoRenderer);
  if (row.gridVideoRenderer) out.push(row.gridVideoRenderer);
  if (row.reelItemRenderer) out.push(row.reelItemRenderer);
  if (row.shortsLockupViewModel) out.push(row.shortsLockupViewModel);
  if (id(row.videoId) && (row.title || row.headline || row.thumbnail)) out.push(row);
  for (const key of [
    'contents',
    'primaryContents',
    'sectionListRenderer',
    'itemSectionRenderer',
    'richGridRenderer',
    'richItemRenderer',
    'content',
    'continuationContents',
    'appendContinuationItemsAction',
    'continuationItems',
    'onResponseReceivedCommands',
    'onResponseReceivedEndpoints',
    'reloadContinuationItemsCommand',
    'twoColumnSearchResultsRenderer',
    'itemSectionContinuation',
    'items',
  ])
    if (row[key] != null) collectVideos(row[key], out, depth + 1);
}

function commentIdOf(row: DataRow): string | null {
  return (
    id(row.commentId) ??
    id(obj(row.commentId).commentId) ??
    id(row.id) ??
    id(obj(row.properties).commentId) ??
    id(obj(row.key).id)
  );
}

function commentFromRenderer(row: DataRow, videoId: string): DataRow | null {
  const thread = obj(row.comment);
  const inner = obj(
    row.commentRenderer ?? thread.commentRenderer ?? row.comment ?? row.commentEntityPayload ?? row,
  );
  const view = obj(row.commentViewModel ?? thread.commentViewModel);
  const properties = obj(inner.properties ?? view.properties ?? inner);
  const commentId = commentIdOf(inner) ?? commentIdOf(view) ?? commentIdOf(properties);
  const text = firstText(inner.contentText, properties.content, inner.text, view.content);
  if (!commentId && !text) return null;
  if (!commentId) return null;
  const author = obj(inner.authorText ?? inner.author ?? properties.author);
  const authorText = textOf(author) || textOf(inner.authorDisplayName) || textOf(author) || null;
  const handle = authorText;
  const likes =
    compactCount(inner.voteCount) ??
    compactCount(textOf(inner.voteCount)) ??
    compactCount(inner.likeCount) ??
    compactCount(obj(inner.toolbar).likeCountLiked);
  return {
    commentId,
    videoId,
    text,
    contentType: text ? 'text' : 'non-text',
    likes,
    replyCount: compactCount(inner.replyCount) ?? compactCount(textOf(inner.replyCount)),
    createdAt: null,
    publishedText: textOf(inner.publishedTimeText) || null,
    userKey: handle ? `handle:${handle}` : commentId ? `cid:${commentId}` : null,
    userId: id(obj(obj(inner.authorEndpoint).browseEndpoint).browseId),
    handle: typeof handle === 'string' ? handle : authorText,
    nickname: authorText,
    commentLanguage: languageCode(inner.commentLanguage),
    region: regionCode(inner.region),
    accountRegion: null,
    signature: null,
    avatarUrl: mediaAssetUrl(obj(obj(inner.authorThumbnail).thumbnails).url),
    raw: row,
  };
}

function collectComments(value: unknown, out: unknown[], depth = 0) {
  if (!value || depth > 14) return;
  if (Array.isArray(value)) {
    for (const item of value) collectComments(item, out, depth + 1);
    return;
  }
  const row = obj(value);
  if (row.commentThreadRenderer) out.push(row.commentThreadRenderer);
  if (row.commentRenderer) out.push(row.commentRenderer);
  if (row.commentViewModel) out.push(row.commentViewModel);
  if (row.commentEntityPayload) out.push(row.commentEntityPayload);
  for (const key of [
    'contents',
    'continuationContents',
    'itemSectionContinuation',
    'commentThreadRenderer',
    'replies',
    'commentRepliesRenderer',
    'frameworkUpdates',
    'entityBatchUpdate',
    'mutations',
    'payload',
    'engagementPanels',
    'onResponseReceivedEndpoints',
    'reloadContinuationItemsCommand',
    'appendContinuationItemsAction',
    'continuationItems',
    'items',
  ])
    if (row[key] != null) collectComments(row[key], out, depth + 1);
}

function hasContinuation(value: unknown, depth = 0): boolean | null {
  if (!value || depth > 10) return null;
  if (Array.isArray(value)) {
    const hits = value.map((item) => hasContinuation(item, depth + 1)).filter((v) => v !== null);
    if (hits.includes(true)) return true;
    if (hits.length) return false;
    return null;
  }
  const row = obj(value);
  if (row.continuationItemRenderer || row.continuationCommand || row.token) return true;
  for (const key of [
    'contents',
    'primaryContents',
    'sectionListRenderer',
    'itemSectionRenderer',
    'continuationItems',
    'onResponseReceivedEndpoints',
    'reloadContinuationItemsCommand',
    'twoColumnSearchResultsRenderer',
  ])
    if (row[key] != null) {
      const nested = hasContinuation(row[key], depth + 1);
      if (nested !== null) return nested;
    }
  return null;
}

export function parseYouTube(
  value: unknown,
  observedAt: string,
  videoId?: string,
): ParsedPage | null {
  const root = obj(value);
  if (!videoId) {
    const found: unknown[] = [];
    collectVideos(root, found);
    const records = found
      .map((item) => {
        const mapped = videoFromRenderer(obj(item));
        if (!mapped) return null;
        mapped.observedAt = observedAt;
        mapped.raw = item;
        return mapped;
      })
      .filter((row): row is DataRow => !!row);
    if (!records.length) return null;
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
    return {
      kind: 'videos',
      ended: hasContinuation(root) === true ? false : null,
      records: unique,
    };
  }
  const found: unknown[] = [];
  collectComments(root, found);
  const records = found
    .map((item) => commentFromRenderer(obj(item), videoId))
    .filter((row): row is DataRow => !!row)
    .map((row): DataRow => ({ ...row, observedAt }));
  if (!records.length && !found.length) return null;
  const seen = new Set<string>();
  const unique = records.filter((row) => {
    const key = String(row['commentId']);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    kind: 'comments',
    ended: hasContinuation(root) === true ? false : unique.length ? true : null,
    records: unique,
  };
}
