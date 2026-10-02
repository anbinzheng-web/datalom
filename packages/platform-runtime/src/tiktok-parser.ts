export type DataRow = Record<string, unknown>;
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
export const normalized = (v: string) =>
  v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export type ParsedPage = { kind: 'videos' | 'comments'; records: DataRow[]; ended: boolean | null };

function endedOf(more: unknown): boolean | null {
  return more === false || more === 0 ? true : more === true || more === 1 ? false : null;
}

function pick(row: DataRow, ...keys: string[]) {
  return keys.reduce<unknown>((found, key) => found ?? row[key], undefined);
}

export function regionCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.toUpperCase() : null;
}

export function languageCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLocaleLowerCase('en-US');
  return text || null;
}

export function mediaUrl(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value.length) return String(value[0]);
  const row = obj(value);
  const list = row.url_list ?? row.urlList;
  if (Array.isArray(list) && list.length) return String(list[0]);
  const uri = row.url ?? row.uri;
  return typeof uri === 'string' && uri ? uri : null;
}

function videoTags(row: DataRow, description: string) {
  const tags = [...description.matchAll(/#([^\s#.,!?，。！？:：;；]+)/gu)].map((m) => m[1]);
  for (const key of ['text_extra', 'textExtra', 'cha_list', 'challenges', 'hashtags']) {
    const value = row[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === 'string') tags.push(item.replace(/^#+/u, ''));
      else {
        const tag = pick(obj(item), 'hashtag_name', 'hashtagName', 'cha_name', 'title', 'name');
        if (typeof tag === 'string' && tag) tags.push(tag.replace(/^#+/u, ''));
      }
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

function asVideo(item: unknown): DataRow | null {
  const wrapped = obj(item);
  const nested = obj(wrapped.item);
  const row = id(nested.id ?? nested.aweme_id) ? nested : wrapped;
  return id(row.id ?? row.aweme_id) ? row : null;
}

function mapVideos(list: unknown[], observedAt: string, skipMissing: boolean): DataRow[] {
  const records: DataRow[] = [];
  for (const item of list) {
    const row = asVideo(item);
    if (!row) {
      if (skipMissing) continue;
      throw new Error('VIDEO_ID_MISSING');
    }
    const stats = { ...obj(row.stats ?? row.statistics), ...obj(row.statsV2) },
      author = obj(row.author);
    const video = id(row.id ?? row.aweme_id);
    if (!video) {
      if (skipMissing) continue;
      throw new Error('VIDEO_ID_MISSING');
    }
    const handle = id(author.uniqueId ?? author.unique_id);
    const description = typeof row.desc === 'string' ? row.desc : '';
    const videoFile = obj(row.video);
    const imagePost = obj(row.imagePost ?? row.image_post_info);
    const contentType =
      Array.isArray(imagePost.images) && imagePost.images.length > 0 ? 'photo' : 'video';
    records.push({
      videoId: video,
      url: handle
        ? `https://www.tiktok.com/@${encodeURIComponent(handle)}/${contentType}/${video}`
        : null,
      contentType,
      description,
      authorId: id(author.id ?? author.uid),
      authorHandle: handle,
      authorName: author.nickname ?? null,
      createdAt: number(row.createTime ?? row.create_time),
      likes: number(stats.diggCount ?? stats.digg_count),
      commentsCount: number(stats.commentCount ?? stats.comment_count),
      plays: number(stats.playCount ?? stats.play_count),
      shares: number(stats.shareCount ?? stats.share_count),
      favorites: number(stats.collectCount ?? stats.collect_count),
      pinned: row.isPinnedItem === true,
      coverUrl: mediaUrl(
        pick(videoFile, 'cover', 'origin_cover', 'dynamic_cover') ?? pick(row, 'cover'),
      ),
      tags: videoTags(row, description),
      rank: records.length + 1,
      observedAt,
      raw: item,
    });
  }
  return records;
}

// Shape-based parsing of browser responses. Unrecognized shapes fail calibration, never become empty success.
export function parseTikTok(
  value: unknown,
  observedAt: string,
  videoId?: string,
): ParsedPage | null {
  const root = obj(value);
  const candidates = [root, obj(root.data)];
  if (!videoId) {
    for (const data of candidates) {
      const list = data.itemList ?? data.item_list ?? data.aweme_list;
      if (!Array.isArray(list)) continue;
      const records = mapVideos(list, observedAt, false);
      if (
        !records.length &&
        !(
          endedOf(data.hasMore ?? data.has_more) === true &&
          (root.statusCode === 0 || root.status_code === 0)
        )
      )
        continue;
      return {
        kind: 'videos',
        ended: endedOf(data.hasMore ?? data.has_more ?? root.has_more ?? root.hasMore),
        records,
      };
    }
    // /api/search/general/full/ returns { data: [{ type, item }, ...], has_more }.
    if (Array.isArray(root.data)) {
      const records = mapVideos(root.data, observedAt, true);
      if (records.length)
        return { kind: 'videos', ended: endedOf(root.has_more ?? root.hasMore), records };
    }
  }
  for (const data of candidates) {
    const commentList = data.comments ?? data.comment_list ?? data.commentList;
    if (Array.isArray(commentList) && videoId) {
      const records = commentList.flatMap((item) => {
        const wrapped = obj(item),
          nested = obj(wrapped.comment),
          row = id(nested.cid ?? nested.id ?? nested.comment_id) ? nested : wrapped,
          comment = id(row.cid ?? row.id ?? row.comment_id);
        if (!comment) return [];
        const returnedVideo = id(row.aweme_id);
        // Stale/other-video comment XHRs must not fail the run (0357d602).
        if (returnedVideo && returnedVideo !== videoId) return [];
        const user = obj(row.user ?? row.user_info),
          uid = id(user.uid ?? user.id ?? user.user_id),
          secUid = id(user.sec_uid ?? user.secUid),
          handle = id(user.unique_id ?? user.uniqueId ?? user.username);
        const text =
          typeof (row.text ?? row.content) === 'string' ? String(row.text ?? row.content) : '';
        return [
          {
            commentId: comment,
            videoId,
            text,
            contentType: text ? 'text' : 'non-text',
            likes: number(row.digg_count ?? row.diggCount ?? row.likes ?? row.like_count),
            replyCount: number(row.reply_comment_total ?? row.reply_count ?? row.replyCount),
            createdAt: number(row.create_time ?? row.createTime),
            userKey: uid
              ? `uid:${uid}`
              : secUid
                ? `secUid:${secUid}`
                : handle
                  ? `handle:${handle}`
                  : null,
            userId: uid,
            secUid,
            handle,
            nickname:
              typeof user.nickname === 'string'
                ? user.nickname
                : typeof user.nick_name === 'string'
                  ? user.nick_name
                  : null,
            commentLanguage: languageCode(row.comment_language ?? row.commentLanguage),
            region: regionCode(user.region),
            accountRegion: regionCode(user.account_region ?? user.accountRegion),
            signature:
              typeof (user.signature ?? user.desc) === 'string'
                ? String(user.signature ?? user.desc)
                : null,
            avatarUrl: mediaUrl(
              pick(user, 'avatar_thumb', 'avatar_medium', 'avatarMedium', 'avatar'),
            ),
            observedAt,
            raw: item,
          },
        ];
      });
      if (
        records.length ||
        (commentList.length === 0 &&
          (root.statusCode === 0 || root.status_code === 0) &&
          endedOf(data.hasMore ?? data.has_more) === true)
      )
        return {
          kind: 'comments',
          ended: endedOf(data.hasMore ?? data.has_more ?? root.has_more ?? root.hasMore),
          records,
        };
    }
  }
  return null;
}
export function aggregate(videos: DataRow[], comments: DataRow[]) {
  const users = new Map<string, DataRow>(),
    tags = new Map<string, DataRow>(),
    keywords = new Map<string, DataRow>();
  for (const row of comments)
    if (typeof row.userKey === 'string') {
      const user = users.get(row.userKey) ?? {
        userKey: row.userKey,
        userId: row.userId,
        secUid: row.secUid,
        handle: row.handle,
        nickname: row.nickname,
        region: null,
        accountRegion: null,
        commentLanguage: null,
        signature: null,
        avatarUrl: null,
        commentCount: 0,
      };
      user.commentCount = Number(user.commentCount) + 1;
      for (const field of [
        'userId',
        'secUid',
        'handle',
        'nickname',
        'region',
        'accountRegion',
        'commentLanguage',
        'signature',
        'avatarUrl',
      ] as const)
        if (row[field]) user[field] = row[field];
      users.set(row.userKey, user);
    }
  for (const video of videos) {
    const names = Array.isArray(video.tags)
      ? video.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
      : [];
    for (const tag of new Set(names.map(normalized))) {
      const keyword = keywords.get(tag) ?? {
        keyword: tag,
        source: 'tag',
        videoCount: 0,
        totalLikes: 0,
        videoIds: [],
      };
      keyword.videoCount = Number(keyword.videoCount) + 1;
      keyword.totalLikes = Number(keyword.totalLikes) + Number(video.likes ?? 0);
      (keyword.videoIds as string[]).push(video.videoId as string);
      keywords.set(tag, keyword);
      if (video.qualifies === true) {
        const stat = tags.get(tag) ?? { tag, videoCount: 0, totalLikes: 0 };
        stat.videoCount = Number(stat.videoCount) + 1;
        stat.totalLikes = Number(stat.totalLikes) + Number(video.likes ?? 0);
        tags.set(tag, stat);
      }
    }
  }
  return {
    users: [...users.values()],
    tags: [...tags.values()],
    keywords: [...keywords.values()]
      .sort(
        (a, b) =>
          Number(b.videoCount) - Number(a.videoCount) ||
          Number(b.totalLikes) - Number(a.totalLikes),
      )
      .map((item, index): DataRow => ({ ...item, rank: index + 1 })),
  };
}
