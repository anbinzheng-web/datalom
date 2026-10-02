import type { FacebookCapture } from './facebook-native.ts';
import { buildFacebookRequest, validateFacebookResult } from './facebook-native.ts';
import { NativeError } from '@datalom/platform-runtime/reverse-core';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';

// Read-only queries captured from the Facebook Reel comments UI on 2026-09-23.
// Session tokens come from the current document; cursors/expansion tokens come
// only from the matching video/comment response, never from another subject.
const flags = {
  __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'AUTO_TRANSLATE',
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
};
export type FacebookCommentTarget = {
  videoId: string;
  feedbackId: string;
  parentCommentId: string | null;
  expansionToken?: string;
  intentToken?: string;
  replyAncestors?: Set<string>;
};
export function facebookCommentRequest(
  session: FacebookCapture,
  target: FacebookCommentTarget,
  cursor: string | null,
  counter: number,
  detail = false,
) {
  const replies = target.parentCommentId !== null;
  const operation: 'reel.detail' | 'post.comments' | 'comment.replies' = detail
    ? 'reel.detail'
    : replies
      ? 'comment.replies'
      : 'post.comments';
  const name = detail
    ? 'FBUnifiedVideoFeedbackRightRailWithCommentPreloadingQuery'
    : replies
      ? 'Depth1CommentsListPaginationQuery'
      : 'CommentsListComponentsPaginationQuery';
  const docId = detail ? '28225895527106568' : replies ? '28480913708256035' : '28874791392118765';
  if (!/^\d+$/.test(target.videoId)) throw new NativeError('INVALID_INPUT', '视频 ID 无效');
  if (!detail && !target.feedbackId) throw new NativeError('SCHEMA_CHANGED', '缺少评论反馈 ID');
  if (replies && !target.expansionToken)
    throw new NativeError('SCHEMA_CHANGED', '缺少回复展开上下文');
  const variables = detail
    ? {
        feedbackSource: 65,
        feedLocation: 'COMET_MEDIA_VIEWER',
        focusCommentID: null,
        initial_node_id: target.videoId,
        scale: 1,
        __relay_internal__pv__FBUnifiedVideoDescriptionWithEntities_comet_translations_revamp_sync_caption_with_audio_gkrelayprovider: false,
        ...flags,
      }
    : {
        ...(replies
          ? {
              clientKey: null,
              expansionToken: target.expansionToken,
              repliesAfterCount: cursor ? -1 : null,
              repliesAfterCursor: cursor,
              repliesBeforeCount: null,
              repliesBeforeCursor: null,
            }
          : {
              commentsAfterCount: -1,
              commentsAfterCursor: cursor,
              commentsBeforeCount: null,
              commentsBeforeCursor: null,
              commentsIntentToken: target.intentToken ?? null,
              targetDialect: null,
            }),
        feedLocation: 'COMET_MEDIA_VIEWER',
        focusCommentID: null,
        scale: 1,
        useDefaultActor: false,
        id: target.feedbackId,
        ...flags,
      };
  const form = new URLSearchParams(session.requestBody);
  form.set('doc_id', docId);
  form.set('fb_api_req_friendly_name', name);
  form.set('variables', JSON.stringify(variables));
  const capture = { ...session, name, docId, requestBody: form.toString() };
  return { ...buildFacebookRequest(operation, capture, {}, counter), operation };
}
const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;

export function parseFacebookComments(
  operation: 'reel.detail' | 'post.comments' | 'comment.replies',
  variables: Record<string, any>,
  status: number,
  body: string,
  target: FacebookCommentTarget,
) {
  const result = validateFacebookResult(operation, variables, status, body, target.replyAncestors);
  const detail = operation === 'reel.detail';
  const story = detail ? result.raw.video.creation_story : undefined;
  const feedback = detail
    ? story?.reels_feedback_renderer?.story?.feedback?.comment_list_renderer?.feedback
    : result.raw.node;
  if (!result.page || typeof feedback?.id !== 'string')
    throw new NativeError('SCHEMA_CHANGED', '缺少视频评论连接');
  const rows: DataRow[] = [];
  const replyTargets: FacebookCommentTarget[] = [];
  for (const node of result.page.items) {
    const user = node.author;
    if (typeof user?.id !== 'string' || typeof user.name !== 'string')
      throw new NativeError('SCHEMA_CHANGED', '评论作者缺失');
    const url = typeof node.feedback?.url === 'string' ? new URL(node.feedback.url) : null;
    if (
      url &&
      (url.origin !== 'https://www.facebook.com' || url.pathname !== `/reel/${target.videoId}/`)
    )
      throw new NativeError('SCHEMA_CHANGED', '评论与视频不匹配');
    const userUrl = new URL(
      `https://www.facebook.com/profile.php?id=${encodeURIComponent(user.id)}`,
    );
    if (typeof user.url === 'string') {
      const supplied = new URL(user.url);
      if (supplied.origin === 'https://www.facebook.com') {
        userUrl.pathname = supplied.pathname;
        userUrl.search =
          supplied.pathname === '/profile.php' ? `?id=${encodeURIComponent(user.id)}` : '';
      }
    }
    const likes = node.comment_action_links?.find(
      (link: any) => link.comment?.feedback?.unified_reactors,
    )?.comment.feedback.unified_reactors.count;
    const text = typeof node.body?.text === 'string' ? node.body.text : '';
    if (!text && !Array.isArray(node.attachments))
      throw new NativeError('SCHEMA_CHANGED', '评论正文结构变化');
    const replyCount = count(node.feedback?.replies_fields?.total_count);
    rows.push({
      commentId: node.id,
      videoId: target.videoId,
      videoUrl: `https://www.facebook.com/reel/${target.videoId}/`,
      commentUrl: url?.toString() ?? null,
      parentCommentId:
        typeof node.comment_direct_parent?.id === 'string'
          ? node.comment_direct_parent.id
          : target.parentCommentId,
      text,
      contentType: text ? 'text' : 'non-text',
      userId: user.id,
      userKey: user.id,
      handle:
        userUrl.pathname === '/profile.php'
          ? user.id
          : decodeURIComponent(userUrl.pathname.replace(/^\/+|\/+$/g, '')),
      nickname: user.name,
      userUrl: userUrl.toString(),
      avatarUrl: user.profile_picture_depth_0?.uri ?? user.profile_picture_depth_1?.uri ?? null,
      likes: count(likes),
      replyCount,
      createdAt:
        count(node.created_time) === null ? null : new Date(node.created_time * 1000).toISOString(),
      commentLanguage:
        typeof node.translatability_for_viewer?.source_dialect === 'string'
          ? node.translatability_for_viewer.source_dialect.split('_')[0]
          : null,
      observedAt: new Date().toISOString(),
    });
    if (target.parentCommentId === null && replyCount !== null && replyCount > 0) {
      const id = node.feedback?.id,
        expansionToken = node.feedback?.expansion_info?.expansion_token;
      if (typeof id !== 'string' || typeof expansionToken !== 'string' || !expansionToken)
        throw new NativeError('SCHEMA_CHANGED', '回复上下文缺失');
      replyTargets.push({
        replyAncestors: new Set<string>(),
        videoId: target.videoId,
        feedbackId: id,
        parentCommentId: node.id,
        expansionToken,
      });
    }
  }
  if (target.parentCommentId !== null)
    for (const row of rows) target.replyAncestors?.add(String(row.commentId));
  return {
    rows,
    replyTargets,
    cursor: result.page.cursor,
    hasMore: result.page.hasMore,
    feedbackId: feedback.id as string,
    allCommentsIntent:
      feedback.comment_rendering_instance_for_feed_location?.selectable_intents?.find(
        (intent: any) =>
          intent.intent_token === 'RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1',
      )?.intent_token as string | undefined,
    filtering:
      feedback.comment_rendering_instance_for_feed_location?.comments?.filtering_footer_string ??
      null,
  };
}

export function aggregateFacebook(videos: DataRow[], comments: DataRow[]) {
  const derived = aggregate(videos, comments);
  const byUser = new Map(comments.map((row) => [row.userKey, row]));
  return {
    ...derived,
    users: derived.users.map((row) => ({
      ...row,
      userUrl: byUser.get(row.userKey)?.userUrl ?? null,
    })),
  };
}
