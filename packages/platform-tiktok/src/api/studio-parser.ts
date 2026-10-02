import type { DataRow } from '@datalom/platform-runtime/tiktok-parser';

export const studioUserPath = '/tiktokstudio/api/web/user';
export const studioListPath = '/tiktok/creator/manage/item_list/v1/';
export const studioInsightPath = '/aweme/v2/data/insight/';
export const studioInsightTypes = [
  'video_info',
  'video_total_duration_realtime',
  'video_per_duration_realtime',
  'video_finish_rate_realtime',
  'video_new_followers',
  'video_retention_rate_realtime',
  'video_traffic_source_percent_realtime',
  'item_search_terms',
  'video_vv_history_7d',
  'video_vv_history_48_hours',
  'total_video_uv',
  'video_uv',
  'video_viewer_new_viewer_percent',
  'video_viewer_return_viewer_percent',
  'video_viewer_follower_percent',
  'video_viewer_non_follower_percent',
  'video_viewer_follower_percent_realtime',
  'video_viewer_nonfollower_percent_realtime',
  'video_viewer_age_percent_realtime',
  'video_viewer_gender_percent_realtime',
  'video_viewer_location_percent_realtime',
  'video_age_distribution',
  'video_gender_percent',
  'video_region_percent',
  'video_city_percent',
];
export function studioListBody(cursor: number, recentPosts = false) {
  return {
    cursor,
    size: 50,
    query: {
      conditions: [],
      sort_orders: [{ field_name: 'post_time', order: 2 }],
      is_recent_posts: recentPosts,
    },
  };
}

type ObjectRow = Record<string, unknown>;
export function studioObject(value: unknown): ObjectRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('STUDIO_RESPONSE_NOT_RECOGNIZED');
  return value as ObjectRow;
}
export function studioNumber(value: unknown): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim()) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  )
    throw new Error('STUDIO_METRIC_MISSING');
  return Number(value);
}
function counter(value: unknown) {
  const number = studioNumber(value);
  if (!Number.isSafeInteger(number)) throw new Error('STUDIO_METRIC_INVALID');
  return number;
}
export function studioStatus(body: ObjectRow) {
  if (body.status_code !== 0) throw new Error(`STUDIO_API_ERROR:${body.status_code ?? 'missing'}`);
}
export function parseStudioIdentity(value: unknown) {
  const body = studioObject(value);
  let user = body;
  try {
    user = studioObject(studioObject(studioObject(body.userBaseInfo).UserProfile).UserBase);
  } catch {
    user = body;
  }
  const status = body.statusCode ?? body.status_code;
  const id = body.userId ?? body.user_id ?? user.uid;
  const handle = body.handle ?? user.UniqId ?? user.unique_id;
  if (status !== 0 || typeof id !== 'string' || !id) throw new Error('LOGIN_REQUIRED');
  if (typeof handle !== 'string' || !/^[\w.]+$/.test(handle))
    throw new Error('STUDIO_ACCOUNT_MISSING');
  return { id, handle, name: body.name ?? user.NickName ?? user.nickname };
}
export function parseStudioList(value: unknown, observedAt: string) {
  const body = studioObject(value);
  studioStatus(body);
  if (body.is_limited !== false) throw new Error('STUDIO_LIST_LIMITED');
  if (typeof body.has_more !== 'boolean') throw new Error('STUDIO_PAGINATION_MISSING');
  // The live empty account response omits item_list, with has_more=false.
  const items = body.item_list === undefined && body.has_more === false ? [] : body.item_list;
  if (!Array.isArray(items)) throw new Error('STUDIO_ITEMS_MISSING');
  const records: DataRow[] = items.map((value) => {
    const item = studioObject(value);
    if (typeof item.item_id !== 'string' || !/^\d+$/.test(item.item_id))
      throw new Error('VIDEO_ID_MISSING');
    return {
      videoId: item.item_id,
      description: item.desc,
      createdAt: counter(item.create_time),
      plays: counter(item.play_count),
      likes: counter(item.like_count),
      commentsCount: counter(item.comment_count),
      favorites: counter(item.favorite_count),
      shares: counter(item.share_count),
      durationSeconds: studioNumber(item.duration) / 1000,
      visibility: item.visibility,
      pinned: item.is_pinned,
      inReview: item.in_review,
      coverUrl: Array.isArray(item.cover_url) ? item.cover_url[0] : null,
      analyticsUrl: `https://www.tiktok.com/tiktokstudio/analytics/${item.item_id}`,
      observedAt,
      raw: item,
    };
  });
  return { records, ended: !body.has_more, cursor: counter(body.cursor) };
}

const metrics = {
  completionRate: 'video_finish_rate_realtime',
  totalPlayTimeSeconds: 'video_total_duration_realtime',
  averageWatchTimeSeconds: 'video_per_duration_realtime',
} as const;

type Share = { key: string; value: number };

function insightCell(raw: unknown): { status: number | null; value: unknown; delayed: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { status: null, value: null, delayed: false };
  const row = raw as ObjectRow;
  const inner = row.value;
  if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'status' in inner) {
    const cell = inner as ObjectRow;
    return {
      status: Number.isInteger(cell.status) ? (cell.status as number) : null,
      value: cell.value ?? cell.country_percent_list ?? null,
      delayed: row.is_data_delay === true,
    };
  }
  if (Number.isInteger(row.status))
    return { status: row.status as number, value: row.value, delayed: false };
  return { status: null, value: null, delayed: false };
}

function optionalCount(raw: unknown): number | null {
  const cell = insightCell(raw);
  if (cell.status !== 0) return null;
  try {
    return counter(cell.value);
  } catch {
    return null;
  }
}

function optionalRatio(raw: unknown): number | null {
  const cell = insightCell(raw);
  if (cell.status !== 0) return null;
  try {
    return studioNumber(cell.value);
  } catch {
    return null;
  }
}

function shareItems(value: unknown): Share[] | null {
  if (!Array.isArray(value)) return null;
  const items: Share[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as ObjectRow;
    const key =
      typeof row.key === 'string'
        ? row.key
        : typeof row.country_name === 'string'
          ? row.country_name
          : null;
    if (!key) continue;
    try {
      items.push({
        key,
        value: studioNumber(row.value ?? row.country_vv_percent),
      });
    } catch {
      continue;
    }
  }
  return items.length ? items : null;
}

function optionalShares(raw: unknown): Share[] | null {
  const cell = insightCell(raw);
  if (cell.status !== 0 && cell.status !== null) return null;
  return shareItems(cell.value) ?? shareItems(raw);
}

function firstShare(...values: unknown[]): Share[] | null {
  for (const value of values) {
    const items = optionalShares(value);
    if (items) return items;
  }
  return null;
}

function firstRatio(...values: unknown[]): number | null {
  for (const value of values) {
    const ratio = optionalRatio(value);
    if (ratio !== null) return ratio;
  }
  return null;
}

export type RetentionPoint = { second: number; rate: number };

// Live Studio responses store the curve on value.list and the
// "most viewers stopped watching" mark on value.peak_value.
// timestamp and peak_value are milliseconds; one point per second.
export function parseStudioRetention(raw: unknown): {
  curve: RetentionPoint[] | null;
  dropAtSeconds: number | null;
} {
  const empty = { curve: null, dropAtSeconds: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const row = raw as ObjectRow;
  const inner = row.value;
  const cell =
    inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as ObjectRow) : row;
  if (cell.status !== undefined && cell.status !== 0) return empty;
  const curve: RetentionPoint[] = [];
  if (Array.isArray(cell.list)) {
    for (const entry of cell.list) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const point = entry as ObjectRow;
      const stamp = point.timestamp;
      if (
        (typeof stamp !== 'number' && typeof stamp !== 'string') ||
        (typeof stamp === 'string' && !stamp.trim()) ||
        !Number.isFinite(Number(stamp)) ||
        Number(stamp) < 0
      )
        continue;
      let rate: number;
      try {
        rate = studioNumber(point.value);
      } catch {
        continue;
      }
      curve.push({ second: Number(stamp) / 1000, rate });
    }
  }
  const peak = cell.peak_value;
  const dropAtSeconds =
    (typeof peak === 'number' || (typeof peak === 'string' && !!peak.trim())) &&
    Number.isFinite(Number(peak)) &&
    Number(peak) >= 0
      ? Number(peak) / 1000
      : null;
  return { curve: curve.length ? curve : null, dropAtSeconds };
}

export function parseStudioAnalytics(value: unknown, videoId: string, ownerId: string) {
  const body = studioObject(value);
  studioStatus(body);
  const info = studioObject(body.video_info);
  if (info.aweme_id !== videoId) throw new Error('STUDIO_VIDEO_MISMATCH');
  if (studioObject(info.author).uid !== ownerId) throw new Error('STUDIO_ACCOUNT_MISMATCH');
  const result: DataRow = {};
  const statuses: ObjectRow = {};
  for (const [field, key] of Object.entries(metrics)) {
    const metric = studioObject(body[key]);
    const cell = studioObject(metric.value);
    if (!Number.isInteger(cell.status)) throw new Error('STUDIO_METRIC_STATUS_MISSING');
    statuses[field] = { status: cell.status, delayed: metric.is_data_delay === true };
    result[field] = cell.status === 0 ? studioNumber(cell.value) : null;
  }
  const followers = studioObject(body.video_new_followers);
  if (!Number.isInteger(followers.status)) throw new Error('STUDIO_METRIC_STATUS_MISSING');
  result.newFollowers = followers.status === 0 ? counter(followers.value) : null;
  statuses.newFollowers = { status: followers.status };
  result.analyticsStatus = Object.values(result).some((v) => v === null)
    ? 'unavailable'
    : 'available';
  result.analyticsMetricStatuses = statuses;
  result.analyticsDelayed = Object.values(statuses).some((v) => studioObject(v).delayed === true);
  const retention = parseStudioRetention(body.video_retention_rate_realtime);
  result.retentionCurve = retention.curve;
  result.retentionDropAtSeconds = retention.dropAtSeconds;
  result.retention = body.video_retention_rate_realtime ?? null;
  result.trafficSources = body.video_traffic_source_percent_realtime ?? null;
  result.searchQueries = body.item_search_terms ?? null;
  result.viewsHistory7d = body.video_vv_history_7d ?? null;
  result.viewsHistory48h = body.video_vv_history_48_hours ?? null;
  result.uniqueViewers = optionalCount(body.total_video_uv) ?? optionalCount(body.video_uv);
  result.newViewerPercent = optionalRatio(body.video_viewer_new_viewer_percent);
  result.returningViewerPercent = optionalRatio(body.video_viewer_return_viewer_percent);
  result.followerViewerPercent = firstRatio(
    body.video_viewer_follower_percent_realtime,
    body.video_viewer_follower_percent,
  );
  result.nonFollowerViewerPercent = firstRatio(
    body.video_viewer_nonfollower_percent_realtime,
    body.video_viewer_non_follower_percent,
  );
  result.viewerGender = firstShare(
    body.video_viewer_gender_percent_realtime,
    body.video_gender_percent,
  );
  result.viewerAge = firstShare(
    body.video_viewer_age_percent_realtime,
    body.video_age_distribution,
  );
  result.viewerCountries = firstShare(
    body.video_viewer_location_percent_realtime,
    body.video_region_percent,
  );
  result.viewerCities = optionalShares(body.video_city_percent);
  return result;
}
export function studioListEvidence(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    status_code: body.status_code ?? null,
    has_more: typeof body.has_more === 'boolean' ? body.has_more : null,
    cursor: body.cursor ?? null,
    is_limited: body.is_limited ?? null,
    items: Array.isArray(body.item_list) ? body.item_list.length : null,
  };
}
export function studioInsightEvidence(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  const finish =
    body.video_finish_rate_realtime &&
    typeof body.video_finish_rate_realtime === 'object' &&
    !Array.isArray(body.video_finish_rate_realtime)
      ? (body.video_finish_rate_realtime as Record<string, unknown>).value
      : null;
  const cell =
    finish && typeof finish === 'object' && !Array.isArray(finish)
      ? (finish as Record<string, unknown>)
      : null;
  const info =
    body.video_info && typeof body.video_info === 'object' && !Array.isArray(body.video_info)
      ? (body.video_info as Record<string, unknown>)
      : null;
  return {
    status_code: body.status_code ?? null,
    aweme_id: typeof info?.aweme_id === 'string' ? info.aweme_id : null,
    finishStatus: cell && Number.isInteger(cell.status) ? cell.status : null,
    finishRate:
      cell && (typeof cell.value === 'number' || typeof cell.value === 'string')
        ? Number(cell.value)
        : null,
  };
}
