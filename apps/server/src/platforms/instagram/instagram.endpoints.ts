import type { EndpointDefinition } from '../../public-api/platform-endpoint.js';
export const endpoints: Record<string, EndpointDefinition> = {
  'profile/detail': {
    operation: 'profile.detail',
    fields: {
      user_id: 'id',
    },
    required: ['user_id'],
    selectors: ['id'],
  },
  'profile/posts': {
    operation: 'profile.posts',
    fields: {
      user_id: 'id',
    },
    required: ['user_id'],
    selectors: ['id'],
  },
  'profile/reels': {
    operation: 'profile.reels',
    fields: {
      user_id: 'id',
    },
    required: ['user_id'],
    selectors: ['id'],
  },
  'search/suggestions': {
    operation: 'search.suggestions',
    fields: {
      keyword: 'query',
    },
    required: ['keyword'],
    selectors: ['query'],
  },
  'search/media': {
    operation: 'search.media',
    fields: {
      keyword: 'query',
    },
    required: ['keyword'],
  },
  'search/media-page': {
    operation: 'search.media.page',
    fields: {
      keyword: 'query',
      count: 'first',
    },
    required: ['keyword'],
    selectors: ['query'],
    cursorKey: 'after',
    numbers: ['count'],
    maxCount: 30,
    defaults: {
      first: 10,
    },
  },
  'media/detail': {
    operation: 'media.detail',
    fields: {
      media_id: 'media_id',
    },
    required: ['media_id'],
    selectors: ['media_id'],
  },
  'post/comments': {
    operation: 'post.comments',
    fields: {
      media_id: 'media_id',
      count: 'first',
    },
    required: ['media_id'],
    selectors: ['media_id'],
    cursorKey: 'after',
    numbers: ['count'],
    maxCount: 30,
    defaults: {
      first: 10,
    },
  },
  'comment/replies': {
    operation: 'comment.replies',
    fields: {
      comment_id: 'parent_comment_id',
      count: 'first',
    },
    required: ['comment_id'],
    selectors: ['parent_comment_id'],
    cursorKey: 'after',
    numbers: ['count'],
    maxCount: 30,
    defaults: {
      first: 10,
    },
  },
};
