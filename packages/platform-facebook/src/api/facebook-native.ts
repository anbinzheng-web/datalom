import { NativeError } from '@datalom/platform-runtime/reverse-core';
import { parseGraphQL, parseConnection } from '@datalom/platform-runtime/graphql-protocol';
import { marketplaceOperations, validateMarketplace } from './facebook-marketplace.ts';

export const facebookOperations = {
  ...marketplaceOperations,
  'reel.detail': {
    name: 'FBUnifiedVideoFeedbackRightRailWithCommentPreloadingQuery',
    fields: ['initial_node_id'],
    idKey: 'initial_node_id',
    root: 'video',
  },
  'post.comments': {
    name: 'CommentsListComponentsPaginationQuery',
    fields: ['id', 'commentsAfterCursor', 'commentsAfterCount'],
    idKey: 'id',
    root: 'node',
  },
  'comment.replies': {
    name: 'Depth1CommentsListPaginationQuery',
    fields: ['id', 'repliesAfterCursor', 'repliesAfterCount'],
    idKey: 'id',
    root: 'node',
  },
  'page.header': {
    name: 'ProfileCometHeaderQuery',
    fields: ['userID'],
    idKey: 'userID',
    root: 'user',
  },
  'page.about': {
    name: 'ProfileCometAboutAppSectionQuery',
    fields: ['userID'],
    idKey: 'userID',
    root: 'user',
  },
  'page.reels': {
    name: 'ProfileCometTopAppSectionQuery',
    fields: ['userID'],
    idKey: 'userID',
    root: 'user',
  },
  'page.photos': {
    name: 'ProfileCometAppCollectionPhotosRendererPaginationQuery',
    fields: ['id', 'count', 'cursor', 'created_time_start', 'created_time_end'],
    idKey: 'id',
    root: 'node',
    connection: 'pageItems',
  },
} as const;

export type FacebookOperation = keyof typeof facebookOperations;

export interface FacebookCapture {
  profileId?: string;
  url: string;
  name: string;
  docId: string;
  requestBody: string;
  requestHeaders: Record<string, string>;
  body?: string;
  status?: number;
}

export function buildFacebookRequest(
  operation: FacebookOperation,
  capture: FacebookCapture,
  updates: Record<string, unknown>,
  counter: number,
) {
  if (!Object.hasOwn(facebookOperations, operation))
    throw new NativeError('INVALID_INPUT', '未知 Facebook 操作');
  const def = facebookOperations[operation],
    u = new URL(capture.url);
  if (
    u.origin !== 'https://www.facebook.com' ||
    !/^\/api\/graphql\/?$/.test(u.pathname) ||
    u.search ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new NativeError('INVALID_INPUT', 'GraphQL 原站地址不匹配');
  const form = new URLSearchParams(capture.requestBody);
  if (
    capture.name !== def.name ||
    form.get('fb_api_req_friendly_name') !== def.name ||
    !/^\d+$/.test(capture.docId) ||
    form.get('doc_id') !== capture.docId
  )
    throw new NativeError('INVALID_INPUT', '请求必须来自匹配的只读查询证据');
  let variables: Record<string, any>;
  try {
    variables = JSON.parse(form.get('variables')!);
  } catch {
    throw new NativeError('INVALID_INPUT', '样本变量损坏');
  }
  if (!variables || typeof variables !== 'object' || Array.isArray(variables))
    throw new NativeError('INVALID_INPUT', '样本变量不是对象');
  for (const [key, value] of Object.entries(updates)) {
    if (!(def.fields as readonly string[]).includes(key))
      throw new NativeError('INVALID_INPUT', `不允许的查询变量 ${key}`);
    if (key === 'query') {
      if (typeof value !== 'string' || !value.trim() || value.length > 100)
        throw new NativeError('INVALID_INPUT', '关键词无效');
    } else if (key.endsWith('Count') || key === 'count') {
      if (!Number.isInteger(value) || Number(value) < -1 || Number(value) > 50)
        throw new NativeError('INVALID_INPUT', '分页数量无效');
    } else if (key.endsWith('Cursor') || key === 'cursor') {
      if (value !== null && (typeof value !== 'string' || value.length > 8192))
        throw new NativeError('INVALID_INPUT', '游标类型无效');
    } else if (typeof value !== 'string' || !/^[A-Za-z0-9+/=_:-]{1,256}$/.test(value))
      throw new NativeError('INVALID_INPUT', '节点 ID 无效');
  }
  // Pagination contexts/section tokens are opaque and tied to the observed subject.
  // Only reel detail has been observed with a simple independently replaceable ID.
  if (
    !['reel.detail', 'marketplace.detail', 'marketplace.media'].includes(operation) &&
    updates[def.idKey] !== undefined &&
    updates[def.idKey] !== variables[def.idKey]
  )
    throw new NativeError(
      'RESEARCH_REQUIRED',
      '更换对象前需要其页面上下文样本，不能沿用其他对象的分页令牌',
    );
  Object.assign(
    variables,
    Object.fromEntries(Object.entries(updates).filter(([k]) => k !== 'query')),
  );
  if (operation === 'marketplace.search' && updates.query !== undefined) {
    variables.params.bqf.query = updates.query;
    variables.savedSearchQuery = updates.query;
    if (updates.cursor) throw new NativeError('INVALID_INPUT', '更换关键词不能沿用游标');
    variables.cursor = null;
  }
  if (typeof variables[def.idKey] !== 'string' || !variables[def.idKey])
    throw new NativeError('INVALID_INPUT', '缺少查询对象 ID');
  if (operation === 'reel.detail' && !/^\d{1,25}$/.test(variables.initial_node_id))
    throw new NativeError('INVALID_INPUT', 'Reel ID 无效');
  if (!form.get('fb_dtsg') || !form.get('lsd'))
    throw new NativeError('LOGIN_REQUIRED', '缺少当前会话的请求令牌');
  const base = parseInt(form.get('__req') ?? '0', 36);
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(counter) || counter < 1)
    throw new NativeError('INVALID_INPUT', '请求计数器异常');
  form.set('__req', (base + counter).toString(36));
  form.set('variables', JSON.stringify(variables));
  const headers = Object.fromEntries(
    Object.entries(capture.requestHeaders).filter(([k]) =>
      [
        'accept',
        'accept-language',
        'content-type',
        'origin',
        'referer',
        'x-fb-friendly-name',
        'x-fb-lsd',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-dest',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'priority',
      ].includes(k),
    ),
  );
  headers['x-fb-friendly-name'] = def.name;
  headers['content-type'] = 'application/x-www-form-urlencoded';
  return { url: u.toString(), body: form.toString(), headers, variables };
}

export function validateFacebookResult(
  operation: FacebookOperation,
  variables: Record<string, any>,
  status: number,
  body: string,
  replyAncestors: ReadonlySet<string> = new Set(),
) {
  if (operation.startsWith('marketplace.'))
    return validateMarketplace(operation, variables, status, body);
  const parsed = parseGraphQL(status, body),
    def = facebookOperations[operation],
    root = parsed.data[def.root];
  if (!root || root.id !== variables[def.idKey])
    throw new NativeError('SCHEMA_CHANGED', 'Facebook 响应对象 ID 不匹配');
  let connection: any;
  if (operation === 'post.comments')
    connection = root.comment_rendering_instance_for_feed_location?.comments;
  if (operation === 'comment.replies') connection = root.replies_connection;
  if (operation === 'reel.detail')
    connection =
      root.creation_story?.reels_feedback_renderer?.story?.feedback?.comment_list_renderer?.feedback
        ?.comment_rendering_instance_for_feed_location?.comments;
  if (operation === 'page.photos') {
    connection = root.pageItems;
    if (connection?.page_info && connection.page_info.has_previous_page === undefined)
      connection = {
        ...connection,
        page_info: { ...connection.page_info, has_previous_page: false },
      };
  }
  if (['post.comments', 'comment.replies'].includes(operation) && !connection)
    throw new NativeError('SCHEMA_CHANGED', '缺少评论分页数据');
  if (operation === 'page.header' && !root.profile_header_renderer)
    throw new NativeError('SCHEMA_CHANGED', '缺少主页资料');
  if (operation === 'page.about' && !root.about_app_sections)
    throw new NativeError('SCHEMA_CHANGED', '缺少 About 数据');
  if (operation === 'page.reels' && !root.timeline_nav_app_sections)
    throw new NativeError('SCHEMA_CHANGED', '缺少主页 Reels 区块');
  const page = connection ? parseConnection(connection) : undefined;
  if (operation === 'comment.replies' && page) {
    const decoded = Buffer.from(variables.id, 'base64').toString('utf8');
    if (!/^feedback:\d+_\d+$/.test(decoded))
      throw new NativeError('SCHEMA_CHANGED', '回复父级反馈 ID 格式变化');
    const parent = Buffer.from(decoded.replace(/^feedback:/, 'comment:')).toString('base64');
    // The depth-1 endpoint also returns nested replies. Every chain must reach
    // this thread's root or a reply already validated in an earlier page.
    const connected = new Set([parent, ...replyAncestors]);
    const pending = new Map<string, any>(page.items.map((item: any) => [item.id, item]));
    while (pending.size) {
      let added = 0;
      for (const [id, item] of pending) {
        if (id === parent || !connected.has(item.comment_direct_parent?.id)) continue;
        connected.add(id);
        pending.delete(id);
        added++;
      }
      if (!added) throw new NativeError('SCHEMA_CHANGED', '回复父评论关系不匹配');
    }
  }
  return { raw: parsed.data, chunks: parsed.chunks, page };
}
