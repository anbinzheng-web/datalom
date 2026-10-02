import type { ApiOperation } from './api-catalog';

export type ApiField = {
  name: string;
  type: string;
  description: string;
  children?: ApiField[];
};

const f = (name: string, type: string, description: string, children?: ApiField[]): ApiField => ({
  name,
  type,
  description,
  ...(children ? { children } : {}),
});

const user = [
  f('id', 'string', 'User ID'),
  f('uniqueId', 'string', 'Username'),
  f('secUid', 'string', 'secUid'),
  f('nickname', 'string', 'Nickname'),
  f('signature', 'string', 'Biography'),
  f('verified', 'boolean', 'Whether the account is verified'),
  f('privateAccount', 'boolean', 'Whether the account is private'),
  f('avatarThumb', 'string', 'Small avatar URL'),
  f('avatarMedium', 'string', 'Medium avatar URL'),
  f('avatarLarger', 'string', 'Large avatar URL'),
];
const stats = [
  f('followerCount', 'number', 'Follower count'),
  f('followingCount', 'number', 'Following count'),
  f('heartCount', 'number', 'Total likes received'),
  f('videoCount', 'number', 'Video count'),
  f('friendCount', 'number', 'Friend count'),
];
const videoStats = [
  f('diggCount', 'number', 'Like count'),
  f('commentCount', 'number', 'Comment count'),
  f('playCount', 'number', 'Play count'),
  f('shareCount', 'number', 'Share count'),
  f('collectCount', 'number', 'Bookmark count'),
];
const author = [
  f('id', 'string', 'Author ID'),
  f('uniqueId', 'string', 'Author username'),
  f('secUid', 'string', 'Author secUid'),
  f('nickname', 'string', 'Author nickname'),
];
const video = [
  f('id', 'string', 'Video ID'),
  f('desc', 'string', 'Caption'),
  f('createTime', 'number', 'Publication timestamp in Unix seconds'),
  f('author', 'object', 'Author', author),
  f('stats', 'object', 'Engagement counts', videoStats),
  f('video', 'object', 'Media files', [
    f('cover', 'string', 'Cover image URL'),
    f('duration', 'number', 'Duration in seconds'),
    f('playAddr', 'string', 'Playback URL'),
  ]),
];
const comment = [
  f('cid', 'string', 'Comment ID'),
  f('aweme_id', 'string', 'ID of the associated video'),
  f('text', 'string', 'Text content'),
  f('create_time', 'number', 'Publication timestamp in Unix seconds'),
  f('digg_count', 'number', 'Like count'),
  f('reply_comment_total', 'number', 'Reply count'),
  f('reply_id', 'string', 'Root comment ID; only present in reply responses'),
  f(
    'reply_to_reply_id',
    'string',
    'ID of the comment being replied to; only present in reply responses',
  ),
  f('user', 'object', 'Comment author', [
    f('uid', 'string', 'User ID'),
    f('unique_id', 'string', 'Username'),
    f('nickname', 'string', 'Nickname'),
  ]),
];

const igUser = [
  f('pk', 'string', 'Numeric ID'),
  f('id', 'string', 'Numeric ID'),
  f('username', 'string', 'Username'),
  f('full_name', 'string', 'Display name'),
  f('is_verified', 'boolean', 'Whether the account is verified'),
  f('is_private', 'boolean', 'Whether the account is private'),
  f('profile_pic_url', 'string', 'Avatar URL'),
];
const igMedia = [
  f('pk', 'string', 'Numeric media ID'),
  f('id', 'string', 'Numeric media ID'),
  f('code', 'string', 'Shortcode'),
  f('taken_at', 'number', 'Publication timestamp in Unix seconds'),
  f('media_type', 'number', 'Media type'),
  f('product_type', 'string', 'Product type, such as clips'),
  f('like_count', 'number', 'Like count'),
  f('comment_count', 'number', 'Comment count'),
  f('play_count', 'number', 'Play count'),
  f('view_count', 'number', 'View count'),
  f('video_duration', 'number', 'Video duration in seconds'),
  f('original_width', 'number', 'Width'),
  f('original_height', 'number', 'Height'),
  f('accessibility_caption', 'string', 'Accessibility caption'),
  f('carousel_media_count', 'number', 'Carousel item count'),
  f('image_versions2', 'object', 'Image variants'),
  f('video_versions', 'array', 'Video variants'),
  f('user', 'object', 'Author', igUser),
  f('caption', 'object', 'Caption', [
    f('pk', 'string', 'Caption ID'),
    f('text', 'string', 'Text content'),
    f('created_at', 'number', 'Creation time'),
  ]),
  f('carousel_media', 'array', 'Carousel items; omitted when no carousel is available'),
  f('location', 'object', 'Location; omitted when no location is available', [
    f('pk', 'string', 'Location ID'),
    f('name', 'string', 'Name'),
    f('short_name', 'string', 'Short name'),
    f('city', 'string', 'City'),
    f('lat', 'number', 'Latitude'),
    f('lng', 'number', 'Longitude'),
  ]),
];
const igComment = [
  f('id', 'string', 'Comment ID'),
  f('pk', 'string', 'Comment ID'),
  f('text', 'string', 'Text content'),
  f('created_at', 'number', 'Publication time'),
  f('comment_like_count', 'number', 'Like count'),
  f('child_comment_count', 'number', 'Reply count'),
  f('parent_comment_id', 'string', 'Parent comment ID'),
  f('user', 'object', 'Comment author', igUser),
];

const xUser = [
  f('kind', 'string', 'user or unavailable'),
  f('id', 'string', 'Numeric user ID'),
  f('username', 'string', 'Username'),
  f('name', 'string', 'Display name'),
  f('bio', 'string', 'Biography'),
  f('createdAt', 'string', 'Account creation time'),
  f('location', 'string', 'Location'),
  f('avatar', 'string', 'Avatar URL'),
  f('banner', 'string', 'Banner image URL'),
  f('url', 'string', 'Website URL'),
  f('verified', 'boolean', 'Whether the account is verified'),
  f('verificationType', 'string', 'Verification type'),
  f('followers', 'number', 'Follower count'),
  f('following', 'number', 'Following count'),
  f('posts', 'number', 'Post count'),
  f('mediaCount', 'number', 'Media count'),
  f('reason', 'string', 'Reason for unavailability; only present when kind is unavailable'),
];
const xTweet = [
  f('kind', 'string', 'tweet or unavailable'),
  f('id', 'string', 'Post ID'),
  f('text', 'string', 'Text content'),
  f('createdAt', 'string', 'Publication time'),
  f('language', 'string', 'Language'),
  f('conversationId', 'string', 'Conversation ID'),
  f('replyToPostId', 'string | null', 'ID of the post being replied to'),
  f('replyToUserId', 'string | null', 'ID of the user being replied to'),
  f('author', 'object', 'Author', xUser),
  f('counts', 'object', 'Engagement counts', [
    f('replies', 'number', 'Reply count'),
    f('reposts', 'number', 'Repost count'),
    f('quotes', 'number', 'Quote count'),
    f('likes', 'number', 'Like count'),
    f('bookmarks', 'number', 'Bookmark count'),
    f('views', 'number', 'View count'),
  ]),
  f('media', 'array', 'Media', [
    f('id', 'string', 'Media ID'),
    f('type', 'string', 'Type'),
    f('url', 'string', 'URL'),
    f('alt', 'string', 'Alternative text'),
    f('width', 'number', 'Width'),
    f('height', 'number', 'Height'),
    f('durationMs', 'number', 'Video duration in milliseconds'),
    f('variants', 'array', 'Video quality variants'),
  ]),
  f('urls', 'array', 'Links', [
    f('url', 'string', 'Short URL'),
    f('expandedUrl', 'string', 'Expanded URL'),
    f('displayUrl', 'string', 'Display URL'),
  ]),
  f('hashtags', 'array', 'Hashtags as an array of strings'),
  f('mentions', 'array', 'Mentions', [
    f('id', 'string', 'User ID'),
    f('username', 'string', 'Username'),
    f('name', 'string', 'Display name'),
  ]),
  f('quote', 'object', 'Quoted post with the same structure as this object'),
  f('repost', 'object', 'Reposted post with the same structure as this object'),
  f('reason', 'string', 'Reason for unavailability; only present when kind is unavailable'),
];

const dataByOperation: Record<string, ApiField[]> = {
  'tiktok.user.detail': [
    f('userInfo', 'object', 'User profile', [
      f('user', 'object', 'Account', user),
      f('stats', 'object', 'Counts', stats),
    ]),
  ],
  'tiktok.user.posts': [
    f('itemList', 'array', 'Video list; item fields are listed below', video),
    f('cursor', 'string | number', 'Upstream pagination cursor'),
    f('hasMore', 'boolean', 'Whether the upstream platform has another page'),
  ],
  'tiktok.video.detail': [
    f('itemInfo', 'object', 'Video', [f('itemStruct', 'object', 'Video object', video)]),
  ],
  'tiktok.video.comments': [
    f('comments', 'array', 'Comment list', comment),
    f('cursor', 'string | number', 'Upstream pagination cursor'),
    f('has_more', 'boolean | number', 'Whether the upstream platform has another page'),
  ],
  'tiktok.comment.replies': [
    f('comments', 'array', 'Reply list', comment),
    f('cursor', 'string | number', 'Upstream pagination cursor'),
    f('has_more', 'boolean | number', 'Whether the upstream platform has another page'),
  ],
  'tiktok.search.videos': [
    f('item_list', 'array', 'Video list', video),
    f('cursor', 'string | number', 'Upstream pagination cursor'),
    f('has_more', 'boolean | number', 'Whether the upstream platform has another page'),
  ],
  'instagram.profile.detail': [
    ...igUser,
    f('biography', 'string', 'Biography'),
    f('bio_links', 'array', 'Biography links'),
    f('external_url', 'string', 'External URL'),
    f('category', 'string', 'Category'),
    f('follower_count', 'number', 'Follower count'),
    f('following_count', 'number', 'Following count'),
    f('media_count', 'number', 'Post count'),
    f('total_clips_count', 'number', 'Reel count'),
  ],
  'instagram.profile.posts': [f('items', 'array', 'Posts', igMedia)],
  'instagram.profile.reels': [f('items', 'array', 'Reels', igMedia)],
  'instagram.search.suggestions': [
    f('users', 'array', 'Users', igUser),
    f('hashtags', 'array', 'Hashtags', [
      f('id', 'string', 'Hashtag ID'),
      f('name', 'string', 'Name'),
      f('media_count', 'number', 'Media count'),
    ]),
    f('places', 'array', 'Location', [
      f('pk', 'string', 'Location ID'),
      f('name', 'string', 'Name'),
      f('city', 'string', 'City'),
      f('lat', 'number', 'Latitude'),
      f('lng', 'number', 'Longitude'),
    ]),
  ],
  'instagram.search.media': [f('items', 'array', 'Media', igMedia)],
  'instagram.search.media-page': [f('items', 'array', 'Media', igMedia)],
  'instagram.media.detail': [f('items', 'array', 'Media items, usually a single item', igMedia)],
  'instagram.post.comments': [f('items', 'array', 'Comments', igComment)],
  'instagram.comment.replies': [f('items', 'array', 'Replies', igComment)],
  'x.profile.detail': [f('items', 'array', 'Accounts, usually a single account', xUser)],
  'x.profile.posts': [f('items', 'array', 'Posts', xTweet)],
  'x.profile.replies': [f('items', 'array', 'Replies', xTweet)],
  'x.profile.reposts': [f('items', 'array', 'Reposts', xTweet)],
  'x.profile.media': [f('items', 'array', 'Posts containing media', xTweet)],
  'x.profile.followers': [f('items', 'array', 'Followers', xUser)],
  'x.profile.following': [f('items', 'array', 'Accounts being followed', xUser)],
  'x.post.detail': [f('items', 'array', 'Posts, usually a single post', xTweet)],
  'x.post.conversation': [f('items', 'array', 'Posts in the conversation', xTweet)],
  'x.search.timeline': [f('items', 'array', 'Posts or accounts in the search results', xTweet)],
  'doubao.chat.completion': [f('answer', 'string', 'Answer text for this conversation turn')],
};

const facebookRoot: Record<string, string> = {
  'facebook.reel.detail': 'video',
  'facebook.post.comments': 'node',
  'facebook.comment.replies': 'node',
  'facebook.page.header': 'user',
  'facebook.page.about': 'user',
  'facebook.page.reels': 'user',
  'facebook.page.photos': 'node',
};

function facebookData(id: string): ApiField[] {
  if (id === 'facebook.marketplace.detail')
    return [
      f('marketplace_listing_title', 'string', 'Title'),
      f('listing_price', 'object', 'Price'),
      f('strikethrough_price', 'object', 'Original price before discount'),
      f('marketplace_listing_category_id', 'string', 'Category ID'),
      f('marketplace_listing_seller', 'object', 'Seller'),
      f('listing_photos', 'array', 'Images'),
    ];
  if (id === 'facebook.marketplace.seller')
    return [
      f('id', 'string', 'Seller ID'),
      f('name', 'string', 'Name'),
      f('ratings', 'object', 'Public ratings; omitted when the seller hides ratings'),
    ];
  if (
    id === 'facebook.marketplace.inventory' ||
    id === 'facebook.marketplace.search' ||
    id === 'facebook.marketplace.feed'
  )
    return [
      f('items', 'array', 'Listings', [
        f('id', 'string', 'Listing ID'),
        f('marketplace_listing_title', 'string', 'Title'),
        f('listing_price', 'object', 'Price'),
      ]),
    ];
  if (id === 'facebook.marketplace.media') return [f('listing_photos', 'array', 'Listing images')];
  const root = facebookRoot[id];
  return [f(root ?? 'data', 'object', 'Public object returned by this query')];
}

function youtubeData(id: string): ApiField[] {
  if (id === 'youtube.video.comments')
    return [
      f('onResponseReceivedEndpoints', 'array', 'Comment pagination continuation actions'),
      f('frameworkUpdates', 'object', 'Page data containing comment items'),
    ];
  return [
    f('contents', 'object', 'Page content'),
    f('metadata', 'object', 'Video or search metadata'),
    f('header', 'object', 'Page header'),
  ];
}

export function responseFields(operation: ApiOperation): ApiField[] {
  const paginated = operation.params.some((param) => param.name === 'cursor');
  const data =
    dataByOperation[operation.id] ??
    (operation.id.startsWith('facebook.')
      ? facebookData(operation.id)
      : operation.id.startsWith('youtube.')
        ? youtubeData(operation.id)
        : [f('payload', 'object', 'Platform data object')]);
  return [
    f('request_id', 'string', 'ID of this request'),
    f('data', 'object', 'Platform response data', data),
    ...(paginated
      ? [
          f(
            'pagination',
            'object',
            'Pagination information; next_cursor is null when there is no next page',
            [
              f('has_more', 'boolean | null', 'Whether another page is available'),
              f('next_cursor', 'string | null', 'Cursor to use when requesting the next page'),
            ],
          ),
        ]
      : []),
  ];
}

export function errorFields(): ApiField[] {
  return [
    f('request_id', 'string', 'ID of this request'),
    f('error', 'object', 'Returned instead of data when the request fails', [
      f('code', 'string', 'Error code, such as INVALID_INPUT, AUTH_REQUIRED, or UPSTREAM_ERROR'),
      f('message', 'string', 'Error description'),
    ]),
  ];
}

export function flattenFields(
  fields: ApiField[],
  depth = 0,
  prefix = '',
): { field: ApiField; depth: number; path: string }[] {
  return fields.flatMap((field) => {
    const path = `${prefix}.${field.name}`;
    return [
      { field, depth, path },
      ...(field.children ? flattenFields(field.children, depth + 1, path) : []),
    ];
  });
}
