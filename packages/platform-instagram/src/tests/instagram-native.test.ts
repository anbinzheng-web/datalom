import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  applyResponseCookies,
  NativeCookieJar,
} from '@datalom/platform-runtime/instagram-native-cookies';
import {
  buildInstagramRequest,
  validateInstagramResult,
  publicMedia,
  type InstagramCapture,
} from '../api/instagram-native.ts';

const root = 'xdt_api__v1__media__media_id__comments__connection';
const capture: InstagramCapture = {
  profileId: 'a'.repeat(32),
  url: 'https://www.instagram.com/api/graphql',
  name: 'PolarisPostCommentsPaginationQuery',
  docId: '123',
  requestBody: new URLSearchParams({
    fb_api_req_friendly_name: 'PolarisPostCommentsPaginationQuery',
    doc_id: '123',
    fb_dtsg: 'fixture',
    lsd: 'fixture',
    __req: 'a',
    variables: JSON.stringify({ media_id: '12', after: null, first: 10 }),
  }).toString(),
  requestHeaders: { 'x-csrftoken': 'fixture', cookie: 'must-not-replay' },
  body: '',
  status: 200,
  method: 'POST',
};

test('builds new Instagram requests with opaque cursors and rejects changing subjects or endpoints', () => {
  const r = buildInstagramRequest('post.comments', capture, { after: '{"cursor":"next"}' }, 2);
  assert.equal(new URLSearchParams(r.body).get('__req'), 'c');
  assert.equal(r.headers.cookie, undefined);
  assert.throws(() => buildInstagramRequest('post.comments', capture, { media_id: '13' }, 1));
  assert.throws(() =>
    buildInstagramRequest(
      'post.comments',
      { ...capture, url: 'https://evil.test/api/graphql' },
      {},
      1,
    ),
  );
  assert.throws(() =>
    buildInstagramRequest('post.comments', { ...capture, name: 'Mutation' }, {}, 1),
  );
});

test('validates terminal Instagram comments and excludes viewer-dependent fields', () => {
  const body = JSON.stringify({
    data: {
      [root]: {
        edges: [
          {
            node: {
              pk: 'c1',
              text: 'Hi',
              has_liked_comment: true,
              user: {
                pk: 'p1',
                username: 'author',
                friendship_status: { following: true },
              },
            },
          },
        ],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  });
  const r = validateInstagramResult('post.comments', { media_id: '12' }, 200, body);
  assert.equal(r.page?.hasMore, false);
  assert.equal(r.page?.cursor, null);
  assert.equal(r.page?.items[0].id, 'c1');
  assert.equal(r.page?.items[0].text, 'Hi');
  assert.doesNotMatch(JSON.stringify(r), /has_liked_comment|friendship_status/);
  assert.throws(() =>
    validateInstagramResult(
      'post.comments',
      {},
      200,
      '{"data":{},"errors":[{"message":"failed"}]}',
    ),
  );
});

test('rejects a mismatched Instagram reply parent', () => {
  const k = 'xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection';
  const body = JSON.stringify({
    data: {
      [k]: {
        edges: [{ node: { pk: '1', text: 'hello', parent_comment_id: 'wrong' } }],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  });
  assert.throws(
    () => validateInstagramResult('comment.replies', { parent_comment_id: 'right' }, 200, body),
    /父评论/,
  );
});

test('returns public Instagram media fields and blocks private accounts', () => {
  const m = {
    pk: '1',
    code: 'abc',
    user: { pk: '2', username: 'public', is_private: false },
    has_viewer_saved: true,
    saved_collection_ids: ['secret'],
    caption: { text: 'Caption', viewer_secret: 'secret' },
  };
  assert.doesNotMatch(JSON.stringify(publicMedia(m)), /secret|has_viewer_saved/);
  assert.throws(() => publicMedia({ ...m, user: { is_private: true } }));
});

test('rejects cross-domain Instagram response cookies without aborting the response', () => {
  const jar = new NativeCookieJar(),
    events: unknown[] = [];
  applyResponseCookies(
    jar,
    [
      'other=secret; Domain=i.instagram.com; Path=/',
      'csrf=new; Domain=.instagram.com; Secure; Path=/',
    ],
    'https://www.instagram.com/graphql/query',
    (...args) => events.push(args),
  );
  assert.equal(jar.header('https://www.instagram.com/'), 'csrf=new');
  assert.deepEqual(events[0], [
    'instagram-cookie',
    'rejected',
    {
      reason: 'domain-mismatch',
      name: 'other',
      domain: 'i.instagram.com',
      requestHost: 'www.instagram.com',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /secret/);
});

test('accepts known Instagram search header rows but rejects unknown media row layouts', () => {
  const searchRoot = 'xdt_fbsearch__top_serp_graphql';
  const value = {
    data: {
      [searchRoot]: {
        edges: [
          { node: { __typename: 'XDTTopSerpHeaderUnit' } },
          { node: { __typename: 'XDTTopSerpAccountsHCMUnit' } },
          {
            node: {
              __typename: 'XDTTopSerpMediaGridUnit',
              items: [{ pk: '1', code: 'abc', user: { is_private: false } }],
            },
          },
        ],
        page_info: { end_cursor: null, has_next_page: false },
      },
    },
  };
  assert.equal(
    validateInstagramResult('search.media', {}, 200, JSON.stringify(value)).page?.items.length,
    1,
  );
  assert.throws(() =>
    validateInstagramResult(
      'search.media',
      {},
      200,
      JSON.stringify({
        data: {
          [searchRoot]: {
            edges: [{ node: { __typename: 'Unexpected' } }],
            page_info: { end_cursor: null, has_next_page: false },
          },
        },
      }),
    ),
  );
});
