import { NativeError, LabError } from '@datalom/platform-runtime/reverse-core';
import { parseGraphQL } from '@datalom/platform-runtime/graphql-protocol';
import type { FacebookCapture } from './facebook-native.ts';

export const facebookVideoSearchName = 'SearchCometResultsInitialResultsQuery';

// The preloader and VIDEOS_TAB variables were observed on /search/videos/.
// Read the current document ID and feature flags; never reuse Marketplace templates.
export function facebookVideoSearchTemplate(html: string) {
  const marker = `"queryName":"${facebookVideoSearchName}"`;
  const at = html.indexOf(marker);
  const start = html.lastIndexOf('"queryID":"', at);
  const docId =
    start >= 0 && at - start < 30000
      ? html.slice(start + '"queryID":"'.length).match(/^\d+/)?.[0]
      : undefined;
  const varAt = html.indexOf('"variables":', start);
  if (at < 0 || !docId || varAt < start || varAt > at)
    throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  const index = varAt + '"variables":'.length;
  let end = index;
  while (/\s/.test(html[end] ?? '')) end++;
  if (html[end] !== '{') throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; end < html.length; end++) {
    const ch = html[end];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      end++;
      break;
    }
  }
  let variables: Record<string, any>;
  try {
    variables = JSON.parse(html.slice(index, end));
  } catch {
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  }
  if (variables.args?.experience?.type !== 'VIDEOS_TAB' || typeof variables.args?.text !== 'string')
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  return { docId, variables };
}

export function buildFacebookVideoSearch(
  capture: FacebookCapture,
  keyword: string,
  cursor: string | null,
  counter: number,
) {
  const form = new URLSearchParams(capture.requestBody);
  const variables = JSON.parse(form.get('variables') ?? 'null');
  if (
    capture.url !== 'https://www.facebook.com/api/graphql/' ||
    capture.name !== facebookVideoSearchName ||
    form.get('fb_api_req_friendly_name') !== facebookVideoSearchName ||
    form.get('doc_id') !== capture.docId ||
    !/^\d+$/.test(capture.docId) ||
    variables?.args?.experience?.type !== 'VIDEOS_TAB' ||
    variables.args.text !== keyword
  )
    throw new NativeError('INVALID_INPUT', '视频搜索模板与关键词不匹配');
  if (!form.get('fb_dtsg') || !form.get('lsd')) throw new LabError('LOGIN_REQUIRED');
  if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 65536))
    throw new LabError('INVALID_INPUT');
  variables.cursor = cursor;
  form.set('variables', JSON.stringify(variables));
  const base = Number.parseInt(form.get('__req') ?? '0', 36);
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(counter) || counter < 1)
    throw new LabError('INVALID_INPUT');
  form.set('__req', (base + counter).toString(36));
  return { url: capture.url, headers: capture.requestHeaders, body: form.toString() };
}
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function parseFacebookVideoSearch(status: number, body: string) {
  const parsed = parseGraphQL(status, body);
  const connection = parsed.data.serpResponse?.results;
  const page = connection?.page_info;
  if (
    !Array.isArray(connection?.edges) ||
    typeof page?.has_next_page !== 'boolean' ||
    !(page.end_cursor === null || typeof page.end_cursor === 'string') ||
    (page.has_next_page && !page.end_cursor)
  )
    throw new NativeError('SCHEMA_CHANGED', 'Facebook 视频搜索分页结构变化');
  const items: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (const edge of connection.edges) {
    if (
      !['SearchVideoPostRenderingStrategy', 'SearchVideoRenderingStrategy'].includes(
        edge.rendering_strategy?.__typename,
      )
    )
      continue;
    const story = edge.rendering_strategy.view_model?.story;
    const media = story?.attachments?.[0]?.media;
    const id = media?.id;
    if (!media) continue;
    if (
      media?.__typename !== 'Video' ||
      typeof id !== 'string' ||
      !/^\d+$/.test(id) ||
      seen.has(id)
    )
      throw new NativeError('SCHEMA_CHANGED', '视频 ID 缺失或页内重复');
    seen.add(id);
    const message = story.comet_sections?.content?.story?.comet_sections?.message?.story?.message;
    const target =
      story.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context
        ?.feedback_target_with_context;
    const actions =
      target?.comet_ufi_summary_and_actions_renderer?.feedback?.adaptive_ufi_action_renderers;
    const actor = story.actors?.[0];
    const likes = actions?.find((a: any) => a.feedback?.reaction_count)?.feedback.reaction_count
      .count;
    const shares = actions?.find((a: any) => a.feedback?.share_count)?.feedback.share_count.count;
    if (typeof actor?.id !== 'string' || typeof actor.name !== 'string')
      throw new NativeError('SCHEMA_CHANGED', '视频作者缺失');
    items.push({
      videoId: id,
      url: `https://www.facebook.com/reel/${id}/`,
      postId: story.post_id,
      description: typeof message?.text === 'string' ? message.text : '',
      authorId: actor.id,
      authorName: actor.name,
      authorHandle: actor.name,
      authorUrl: `https://www.facebook.com/profile.php?id=${encodeURIComponent(actor.id)}`,
      likes: number(likes),
      commentsCount: number(target?.comment_rendering_instance?.comments?.total_count),
      shares: number(shares),
      plays: null,
      createdAt:
        number(story.creation_time) === null
          ? null
          : new Date(story.creation_time * 1000).toISOString(),
      durationSeconds: number(story.attachments[0].styles?.attachment?.media?.length_in_second),
      tags: (message?.ranges ?? []).flatMap((r: any) => {
        const url = r.entity?.url;
        return typeof url === 'string' && url.startsWith('https://www.facebook.com/hashtag/')
          ? [decodeURIComponent(new URL(url).pathname.split('/')[2] ?? '')]
          : [];
      }),
    });
  }
  return {
    items,
    cursor: page.end_cursor as string | null,
    hasMore: page.has_next_page as boolean,
  };
}
