import type { EndpointDefinition } from '../../public-api/platform-endpoint.js';
export const endpoints: Record<string, EndpointDefinition> = {
  'profile/detail': {
    operation: 'profile.detail',
    fields: {
      username: 'screen_name',
    },
    required: ['username'],
  },
  'profile/posts': {
    operation: 'profile.posts',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'profile/replies': {
    operation: 'profile.replies',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'profile/reposts': {
    operation: 'profile.reposts',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'profile/media': {
    operation: 'profile.media',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'profile/followers': {
    operation: 'profile.followers',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'profile/following': {
    operation: 'profile.following',
    fields: {
      user_id: 'userId',
      count: 'count',
    },
    required: ['user_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
    },
  },
  'post/detail': {
    operation: 'post.detail',
    fields: {
      post_id: 'tweetId',
    },
    required: ['post_id'],
  },
  'post/conversation': {
    operation: 'post.conversation',
    fields: {
      post_id: 'focalTweetId',
      ranking: 'rankingMode',
    },
    required: ['post_id'],
    cursorKey: 'cursor',
    defaults: {
      rankingMode: 'Relevance',
    },
  },
  'search/timeline': {
    operation: 'search.timeline',
    fields: {
      keyword: 'rawQuery',
      product: 'product',
      count: 'count',
    },
    required: ['keyword'],
    cursorKey: 'cursor',
    numbers: ['count'],
    maxCount: 40,
    defaults: {
      count: 20,
      product: 'Latest',
    },
  },
};
