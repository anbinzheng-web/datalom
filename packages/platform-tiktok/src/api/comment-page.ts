import { parseTikTok, type DataRow } from '@datalom/platform-runtime/tiktok-parser';

export type CommentPage = { records: DataRow[]; ended: boolean; cursor: string };
export function parseCommentPage(
  body: unknown,
  videoId: string,
  parentCommentId: string | null,
): CommentPage {
  const root = body as Record<string, unknown>;
  if (!root || typeof root !== 'object' || (root.status_code ?? root.statusCode) !== 0)
    throw new Error('COMMENT_API_REJECTED');
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const list = data.comments ?? data.comment_list;
  const more = data.has_more ?? data.hasMore;
  if (!Array.isArray(list) || ![0, 1, false, true].includes(more as number))
    throw new Error('COMMENT_PAGE_NOT_RECOGNIZED');
  if (
    list.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        String(item.aweme_id) !== videoId ||
        (parentCommentId !== null && String(item.reply_id) !== parentCommentId),
    )
  )
    throw new Error('COMMENT_PAGE_MISMATCH');
  const parsed = list.length ? parseTikTok(body, new Date().toISOString(), videoId) : null;
  if (list.length && (!parsed || parsed.records.length !== list.length))
    throw new Error('COMMENT_PAGE_MISMATCH');
  const cursor = data.cursor;
  if (
    (more === 1 || more === true) &&
    !(
      (typeof cursor === 'string' && /^\d+$/.test(cursor)) ||
      (Number.isSafeInteger(cursor) && Number(cursor) >= 0)
    )
  )
    throw new Error('COMMENT_CURSOR_MISSING');
  const records = (parsed?.records ?? []).map((row) => ({ ...row, parentCommentId }));
  return { records, ended: more === 0 || more === false, cursor: String(cursor ?? '') };
}

// The observed request supplies session parameters. Credentials and signatures remain in memory.
