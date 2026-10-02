import type { EndpointDefinition } from '../../public-api/platform-endpoint.js';
export const endpoints: Record<string, EndpointDefinition> = {
  'reel/detail': {
    operation: 'reel.detail',
    fields: {
      video_id: 'initial_node_id',
    },
    required: ['video_id'],
  },
  'page/header': {
    operation: 'page.header',
    fields: {
      user_id: 'userID',
    },
    required: ['user_id'],
  },
  'page/about': {
    operation: 'page.about',
    fields: {
      user_id: 'userID',
    },
    required: ['user_id'],
  },
  'page/reels': {
    operation: 'page.reels',
    fields: {
      user_id: 'userID',
    },
    required: ['user_id'],
  },
  'marketplace/seller': {
    operation: 'marketplace.seller',
    fields: {
      seller_id: 'sellerId',
    },
    required: ['seller_id'],
  },
  'marketplace/inventory': {
    operation: 'marketplace.inventory',
    fields: {
      seller_id: 'sellerID',
    },
    required: ['seller_id'],
  },
  'marketplace/detail': {
    operation: 'marketplace.detail',
    fields: {
      listing_id: 'targetId',
    },
    required: ['listing_id'],
  },
  'marketplace/media': {
    operation: 'marketplace.media',
    fields: {
      listing_id: 'targetId',
    },
    required: ['listing_id'],
  },
  'post/comments': {
    operation: 'post.comments',
    fields: {
      node_id: 'id',
      count: 'commentsAfterCount',
    },
    required: ['node_id'],
    cursorKey: 'commentsAfterCursor',
    numbers: ['count'],
    defaults: {
      commentsAfterCount: 10,
    },
  },
  'comment/replies': {
    operation: 'comment.replies',
    fields: {
      node_id: 'id',
      count: 'repliesAfterCount',
    },
    required: ['node_id'],
    cursorKey: 'repliesAfterCursor',
    numbers: ['count'],
    defaults: {
      repliesAfterCount: 10,
    },
  },
  'page/photos': {
    operation: 'page.photos',
    fields: {
      node_id: 'id',
      count: 'count',
    },
    required: ['node_id'],
    cursorKey: 'cursor',
    numbers: ['count'],
    defaults: {
      count: 10,
    },
  },
  'marketplace/feed': {
    operation: 'marketplace.feed',
    fields: {
      listing_id: 'pdpListingId',
      count: 'count',
    },
    required: ['listing_id'],
    selectors: ['pdpListingId'],
    cursorKey: 'cursor',
    numbers: ['count'],
    defaults: {
      count: 8,
    },
  },
  'marketplace/search': {
    operation: 'marketplace.search',
    fields: {
      keyword: 'query',
      count: 'count',
    },
    required: ['keyword'],
    cursorKey: 'cursor',
    numbers: ['count'],
    defaults: {
      count: 8,
    },
  },
};
