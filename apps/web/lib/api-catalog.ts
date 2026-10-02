export type ApiParam = {
  name: string;
  in: 'query' | 'body';
  required: boolean;
  type: 'string' | 'integer';
  description: string;
  example?: string;
  minimum?: number;
  maximum?: number;
  placeholder?: string;
};

export type ApiOperation = {
  id: string;
  title: string;
  summary: string;
  method: 'GET' | 'POST';
  path: string;
  params: ApiParam[];
  /** At least one of these parameters must be present. */
  requireAny?: string[];
};

export type ApiHeader = {
  name: string;
  value: string;
  required: boolean;
  description: string;
};

export function operationHeaders(operation: ApiOperation): ApiHeader[] {
  const headers: ApiHeader[] = [
    {
      name: 'Authorization',
      value: 'Bearer <API Key>',
      required: true,
      description:
        'Required for every request. The API key is configured by the service and must contain at least 32 characters.',
    },
  ];
  if (operation.method === 'POST') {
    headers.push({
      name: 'Content-Type',
      value: 'application/json',
      required: true,
      description: 'The request body must use JSON.',
    });
  }
  return headers;
}

export type ApiGroup = { id: string; title: string; operations: ApiOperation[] };
export type ApiPlatform = { id: string; title: string; description: string; groups: ApiGroup[] };

const cursor = (
  description = 'The next_cursor returned by the previous page. Leave empty for the first page.',
): ApiParam => ({
  name: 'cursor',
  in: 'query',
  required: false,
  type: 'string',
  description,
});
const count = (maximum: number, placeholder = '20'): ApiParam => ({
  name: 'count',
  in: 'query',
  required: false,
  type: 'integer',
  minimum: 1,
  maximum,
  placeholder,
  description: `Number of items to return, from 1 to ${maximum}. Leave empty to use the default.`,
});

export const apiCatalog: ApiPlatform[] = [
  {
    id: 'tiktok',
    title: 'TikTok',
    description: 'Users, videos, comments, and search.',
    groups: [
      {
        id: 'users',
        title: 'Users',
        operations: [
          {
            id: 'tiktok.user.detail',
            title: 'User details',
            summary: 'Read public profile data by username or secUid. Provide at least one.',
            method: 'GET',
            path: '/api/v1/tiktok/web/user/detail',
            requireAny: ['username', 'sec_uid'],
            params: [
              {
                name: 'username',
                in: 'query',
                required: false,
                type: 'string',
                description: 'Public username without the @ prefix.',
                example: 'tiktok',
              },
              {
                name: 'sec_uid',
                in: 'query',
                required: false,
                type: 'string',
                description: 'Account secUid. Provide either this value or username.',
              },
            ],
          },
          {
            id: 'tiktok.user.posts',
            title: 'User posts',
            summary: 'Read public posts by secUid with pagination.',
            method: 'GET',
            path: '/api/v1/tiktok/web/user/posts',
            params: [
              {
                name: 'sec_uid',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Account secUid.',
              },
              count(50),
              cursor(),
            ],
          },
        ],
      },
      {
        id: 'videos',
        title: 'Videos',
        operations: [
          {
            id: 'tiktok.video.detail',
            title: 'Video details',
            summary: 'Read one public video.',
            method: 'GET',
            path: '/api/v1/tiktok/web/video/detail',
            params: [
              {
                name: 'video_id',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Numeric video ID.',
                example: '7685551053554617613',
              },
            ],
          },
          {
            id: 'tiktok.video.comments',
            title: 'VideosComments',
            summary: 'Read public comments with pagination.',
            method: 'GET',
            path: '/api/v1/tiktok/web/video/comments',
            params: [
              {
                name: 'video_id',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Numeric video ID.',
              },
              count(50),
              cursor(),
            ],
          },
          {
            id: 'tiktok.comment.replies',
            title: 'Comment replies',
            summary: 'Read public replies to a comment.',
            method: 'GET',
            path: '/api/v1/tiktok/web/comment/replies',
            params: [
              {
                name: 'video_id',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Numeric video ID.',
              },
              {
                name: 'comment_id',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Parent comment ID.',
              },
              count(50),
              cursor(),
            ],
          },
        ],
      },
      {
        id: 'search',
        title: 'Search',
        operations: [
          {
            id: 'tiktok.search.videos',
            title: 'SearchVideos',
            summary: 'Read one page of public videos by keyword.',
            method: 'GET',
            path: '/api/v1/tiktok/web/search/videos',
            params: [
              {
                name: 'keyword',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Search query.',
                example: 'cats',
              },
              count(50),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'instagram',
    title: 'Instagram',
    description: 'Profiles, search, media, and comments.',
    groups: [
      {
        id: 'profiles',
        title: 'Profile',
        operations: [
          op(
            'instagram.profile.detail',
            'Profile details',
            'Read a public profile.',
            '/api/v1/instagram/web/profile/detail',
            [idParam('user_id', 'Numeric user ID.')],
          ),
          op(
            'instagram.profile.posts',
            'ProfilePosts',
            'Read a public post list.',
            '/api/v1/instagram/web/profile/posts',
            [idParam('user_id', 'Numeric user ID.')],
          ),
          op(
            'instagram.profile.reels',
            'Profile Reels',
            'Read public Reels.',
            '/api/v1/instagram/web/profile/reels',
            [idParam('user_id', 'Numeric user ID.')],
          ),
        ],
      },
      {
        id: 'search',
        title: 'Search',
        operations: [
          op(
            'instagram.search.suggestions',
            'Search suggestions',
            'Read keyword suggestions.',
            '/api/v1/instagram/web/search/suggestions',
            [keyword()],
          ),
          op(
            'instagram.search.media',
            'Media search',
            'Search public media by keyword.',
            '/api/v1/instagram/web/search/media',
            [keyword()],
          ),
          op(
            'instagram.search.media-page',
            'Media search pagination',
            'Continue reading search results.',
            '/api/v1/instagram/web/search/media-page',
            [keyword(), count(30, '10'), cursor()],
          ),
        ],
      },
      {
        id: 'media',
        title: 'Content',
        operations: [
          op(
            'instagram.media.detail',
            'Media details',
            'Read one public media item.',
            '/api/v1/instagram/web/media/detail',
            [idParam('media_id', 'Media ID.')],
          ),
          op(
            'instagram.post.comments',
            'Post comments',
            'Read public comments with pagination.',
            '/api/v1/instagram/web/post/comments',
            [idParam('media_id', 'Media ID.'), count(30, '10'), cursor()],
          ),
          op(
            'instagram.comment.replies',
            'Comment replies',
            'Read public replies to a comment.',
            '/api/v1/instagram/web/comment/replies',
            [idParam('comment_id', 'Parent comment ID.'), count(30, '10'), cursor()],
          ),
        ],
      },
    ],
  },
  {
    id: 'facebook',
    title: 'Facebook',
    description: 'Public profiles, Marketplace, and comments.',
    groups: [
      {
        id: 'pages',
        title: 'Profile',
        operations: [
          op(
            'facebook.page.header',
            'Profile header',
            'Read a public profile header.',
            '/api/v1/facebook/web/page/header',
            [idParam('user_id', 'Page user ID.')],
          ),
          op(
            'facebook.page.about',
            'Profile bio',
            'Read a public profile bio.',
            '/api/v1/facebook/web/page/about',
            [idParam('user_id', 'Page user ID.')],
          ),
          op(
            'facebook.page.reels',
            'Profile Reels',
            'Read public profile Reels.',
            '/api/v1/facebook/web/page/reels',
            [idParam('user_id', 'Page user ID.')],
          ),
          op(
            'facebook.page.photos',
            'Profile photos',
            'Read public photos with pagination.',
            '/api/v1/facebook/web/page/photos',
            [idParam('node_id', 'Photo list node ID.'), count(50, '10'), cursor()],
          ),
          op(
            'facebook.reel.detail',
            'Reel details',
            'Read one public Reel.',
            '/api/v1/facebook/web/reel/detail',
            [idParam('video_id', 'Video node ID.')],
          ),
        ],
      },
      {
        id: 'marketplace',
        title: 'Marketplace',
        operations: [
          op(
            'facebook.marketplace.search',
            'Marketplace search',
            'Search public listings by keyword.',
            '/api/v1/facebook/web/marketplace/search',
            [keyword(), count(50, '8'), cursor()],
          ),
          op(
            'facebook.marketplace.detail',
            'Listing details',
            'Read one public listing.',
            '/api/v1/facebook/web/marketplace/detail',
            [idParam('listing_id', 'Listing ID.')],
          ),
          op(
            'facebook.marketplace.media',
            'Listing images',
            'Read public listing media.',
            '/api/v1/facebook/web/marketplace/media',
            [idParam('listing_id', 'Listing ID.')],
          ),
          op(
            'facebook.marketplace.feed',
            'Related listings',
            'Read public recommendations on a listing page.',
            '/api/v1/facebook/web/marketplace/feed',
            [idParam('listing_id', 'Listing ID.'), count(50, '8'), cursor()],
          ),
          op(
            'facebook.marketplace.seller',
            'Seller profile',
            'Read a public seller profile.',
            '/api/v1/facebook/web/marketplace/seller',
            [idParam('seller_id', 'Seller ID.')],
          ),
          op(
            'facebook.marketplace.inventory',
            'Seller inventory',
            'Read a seller’s public inventory.',
            '/api/v1/facebook/web/marketplace/inventory',
            [idParam('seller_id', 'Seller ID.')],
          ),
        ],
      },
      {
        id: 'comments',
        title: 'Comments',
        operations: [
          op(
            'facebook.post.comments',
            'Post comments',
            'Read public comments with pagination.',
            '/api/v1/facebook/web/post/comments',
            [idParam('node_id', 'Post node ID.'), count(50, '10'), cursor()],
          ),
          op(
            'facebook.comment.replies',
            'Comment replies',
            'Read public replies with pagination.',
            '/api/v1/facebook/web/comment/replies',
            [idParam('node_id', 'Comment node ID.'), count(50, '10'), cursor()],
          ),
        ],
      },
    ],
  },
  {
    id: 'x',
    title: 'X',
    description: 'Public profiles, posts, and search.',
    groups: [
      {
        id: 'profiles',
        title: 'Account',
        operations: [
          op(
            'x.profile.detail',
            'Account details',
            'Read public profile data by username.',
            '/api/v1/x/web/profile/detail',
            [
              {
                name: 'username',
                in: 'query',
                required: true,
                type: 'string',
                description: 'Username without the @ prefix.',
                example: 'x',
              },
            ],
          ),
          op(
            'x.profile.posts',
            'AccountPosts',
            'Read public posts with pagination.',
            '/api/v1/x/web/profile/posts',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
          op(
            'x.profile.replies',
            'Account replies',
            'Read public replies with pagination.',
            '/api/v1/x/web/profile/replies',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
          op(
            'x.profile.reposts',
            'Account reposts',
            'Read public reposts with pagination.',
            '/api/v1/x/web/profile/reposts',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
          op(
            'x.profile.media',
            'Account media',
            'Read public media posts with pagination.',
            '/api/v1/x/web/profile/media',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
          op(
            'x.profile.followers',
            'Followers',
            'Read public followers with pagination.',
            '/api/v1/x/web/profile/followers',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
          op(
            'x.profile.following',
            'Accounts being followed',
            'Read the public following list with pagination.',
            '/api/v1/x/web/profile/following',
            [idParam('user_id', 'Numeric user ID.'), count(40), cursor()],
          ),
        ],
      },
      {
        id: 'posts',
        title: 'Posts',
        operations: [
          op(
            'x.post.detail',
            'Post details',
            'Read one public post.',
            '/api/v1/x/web/post/detail',
            [idParam('post_id', 'Numeric post ID.')],
          ),
          op(
            'x.post.conversation',
            'Post conversation',
            'Read the public conversation on a post.',
            '/api/v1/x/web/post/conversation',
            [
              idParam('post_id', 'Numeric post ID.'),
              {
                name: 'ranking',
                in: 'query',
                required: false,
                type: 'string',
                description: 'Sort order. Defaults to Relevance when empty.',
                placeholder: 'Relevance',
              },
              cursor(),
            ],
          ),
        ],
      },
      {
        id: 'search',
        title: 'Search',
        operations: [
          op(
            'x.search.timeline',
            'Search timeline',
            'Read public search results by keyword.',
            '/api/v1/x/web/search/timeline',
            [
              keyword(),
              {
                name: 'product',
                in: 'query',
                required: false,
                type: 'string',
                description: 'Search result category. Defaults to Latest when empty.',
                placeholder: 'Latest',
              },
              count(40),
              cursor(),
            ],
          ),
        ],
      },
    ],
  },
  {
    id: 'youtube',
    title: 'YouTube',
    description: 'Public search, videos, and comments.',
    groups: [
      {
        id: 'videos',
        title: 'Videos',
        operations: [
          op(
            'youtube.search.videos',
            'SearchVideos',
            'Search public videos by keyword.',
            '/api/v1/youtube/web/search/videos',
            [keyword(), cursor()],
          ),
          op(
            'youtube.video.detail',
            'Video details',
            'Read one public video.',
            '/api/v1/youtube/web/video/detail',
            [
              {
                name: 'video_id',
                in: 'query',
                required: true,
                type: 'string',
                description: '11-character video ID.',
                example: 'dQw4w9WgXcQ',
              },
            ],
          ),
          op(
            'youtube.video.comments',
            'VideosComments',
            'Read public comments. Include the returned cursor when paginating.',
            '/api/v1/youtube/web/video/comments',
            [
              {
                name: 'video_id',
                in: 'query',
                required: true,
                type: 'string',
                description: '11-character video ID.',
              },
              cursor(),
            ],
          ),
        ],
      },
    ],
  },
  {
    id: 'doubao',
    title: 'Doubao',
    description: 'Start a new chat completion.',
    groups: [
      {
        id: 'chat',
        title: 'Chat',
        operations: [
          {
            id: 'doubao.chat.completion',
            title: 'Chat completion',
            summary: 'Start a new chat with a prompt without reusing another caller’s history.',
            method: 'POST',
            path: '/api/v1/doubao/web/chat/completion',
            params: [
              {
                name: 'prompt',
                in: 'body',
                required: true,
                type: 'string',
                description: 'Prompt containing 1 to 16000 characters.',
                example: 'Introduce yourself in one sentence',
              },
            ],
          },
        ],
      },
    ],
  },
];

function keyword(): ApiParam {
  return {
    name: 'keyword',
    in: 'query',
    required: true,
    type: 'string',
    description: 'Search query.',
    example: 'cats',
  };
}
function idParam(name: string, description: string): ApiParam {
  return { name, in: 'query', required: true, type: 'string', description };
}
function op(
  id: string,
  title: string,
  summary: string,
  path: string,
  params: ApiParam[],
): ApiOperation {
  return { id, title, summary, method: 'GET', path, params };
}

export const apiOperations = apiCatalog.flatMap((platform) =>
  platform.groups.flatMap((group) =>
    group.operations.map((operation) => ({ platform, group, operation })),
  ),
);

export function findOperation(id: string) {
  return apiOperations.find((item) => item.operation.id === id);
}
