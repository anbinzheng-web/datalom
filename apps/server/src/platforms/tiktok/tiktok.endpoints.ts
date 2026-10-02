export const endpoints = {
  'user/detail': {
    operation: 'user.detail',
    fields: { username: 'uniqueId', sec_uid: 'secUid' },
    required: [],
    paginated: false,
  },
  'user/posts': {
    operation: 'user.posts',
    fields: { sec_uid: 'secUid', count: 'count' },
    required: ['sec_uid'],
    paginated: true,
  },
  'video/detail': {
    operation: 'video.detail',
    fields: { video_id: 'itemId' },
    required: ['video_id'],
    paginated: false,
  },
  'video/comments': {
    operation: 'video.comments',
    fields: { video_id: 'aweme_id', count: 'count' },
    required: ['video_id'],
    paginated: true,
  },
  'comment/replies': {
    operation: 'comment.replies',
    fields: { video_id: 'item_id', comment_id: 'comment_id', count: 'count' },
    required: ['video_id', 'comment_id'],
    paginated: true,
  },
  'search/videos': {
    operation: 'search.videos',
    fields: { keyword: 'keyword', count: 'count' },
    required: ['keyword'],
    paginated: false,
  },
} as const;
export type Endpoint = keyof typeof endpoints;

