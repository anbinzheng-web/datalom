import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseConnection, parseGraphQL } from '@datalom/platform-runtime/graphql-protocol';
import { validateMarketplace } from '../api/facebook-marketplace.ts';
import {
  buildFacebookRequest,
  validateFacebookResult,
  type FacebookCapture,
} from '../api/facebook-native.ts';
import { NativeError } from '@datalom/platform-runtime/reverse-core';
import { keywordScriptId } from '@datalom/platform-runtime/contracts/business';

const capture = (name = 'CommentsListComponentsPaginationQuery'): FacebookCapture => ({
  profileId: 'a'.repeat(32),
  url: 'https://www.facebook.com/api/graphql/',
  name,
  docId: '123',
  requestBody: new URLSearchParams({
    fb_api_req_friendly_name: name,
    doc_id: '123',
    fb_dtsg: 'd',
    lsd: 'l',
    __req: 'a',
    variables: JSON.stringify({ id: 'x', commentsAfterCursor: null, commentsAfterCount: -1 }),
  }).toString(),
  requestHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
  body: '{"data":{"node":{"id":"x","comment_rendering_instance_for_feed_location":{"comments":{"edges":[],"page_info":{"end_cursor":null,"has_next_page":false,"has_previous_page":false}}}}}}',
  status: 200,
});

test('Facebook keyword tasks bind facebook.keyword-research', () => {
  assert.equal(keywordScriptId('Facebook'), 'facebook.keyword-research');
});

test('Facebook GraphQL merges incremental data and rejects errors', () => {
  const x = parseGraphQL(200, '{"data":{"node":{"id":"x"}}}\n{"path":["node"],"data":{"ok":true}}');
  assert.equal(x.data.node.ok, true);
  assert.throws(
    () => parseGraphQL(200, '{"errors":[{"message":"bad"}]}'),
    (error: unknown) => error instanceof NativeError,
  );
});

test('Facebook GraphQL rejects duplicate ids and malformed cursors', () => {
  assert.throws(() =>
    parseConnection({
      edges: [{ node: { id: 'x' } }, { node: { id: 'x' } }],
      page_info: { end_cursor: null, has_next_page: false, has_previous_page: false },
    }),
  );
});

test('Facebook request allowlist validates empty comment page', () => {
  const c = capture();
  const r = buildFacebookRequest('post.comments', c, { commentsAfterCount: -1 }, 1);
  assert.match(r.body, /__req=b/);
  assert.equal(
    validateFacebookResult('post.comments', r.variables, c.status!, c.body!).page?.items.length,
    0,
  );
  assert.throws(() => buildFacebookRequest('post.comments', c, { id: 'other' }, 1), /上下文/);
});

test('assembles streamed Marketplace edges without mutating captured chunks', () => {
  const initial = { data: { feed: { edges: [{ node: { id: '1' } }] } } };
  const patch = {
    path: ['feed', 'edges', 1],
    label: 'q$stream$edges',
    data: { node: { id: '2' } },
  };
  const r = parseGraphQL(200, [initial, patch].map((x) => JSON.stringify(x)).join('\n'));
  assert.equal(r.data.feed.edges.length, 2);
  assert.equal(r.chunks[0].data.feed.edges.length, 1);
  assert.throws(() =>
    parseGraphQL(
      200,
      [initial, { ...patch, path: ['feed', 'edges', 4] }].map((x) => JSON.stringify(x)).join('\n'),
    ),
  );
});

test('Marketplace details exclude viewer, orders and messaging', () => {
  const target = {
    id: '123',
    marketplace_listing_title: 'Desk',
    listing_price: { amount: '10', currency: 'USD' },
    seller_message_thread: { secret: 1 },
    active_order: { secret: 2 },
    marketplace_listing_seller: { id: 'seller', name: 'Store' },
  };
  const body = JSON.stringify({
    data: {
      viewer: {
        marketplace_product_details_page: { target },
        marketplace_settings: { secret: 3 },
      },
    },
  });
  const r = validateMarketplace('marketplace.detail', { targetId: '123' }, 200, body);
  assert.equal(r.raw.marketplace_listing_title, 'Desk');
  assert.doesNotMatch(
    JSON.stringify(r),
    /secret|active_order|seller_message_thread|marketplace_settings/,
  );
  assert.throws(() => validateMarketplace('marketplace.detail', { targetId: '124' }, 200, body));
});

test('does not accept server-error null Marketplace search as an empty page', () => {
  assert.throws(() =>
    validateMarketplace(
      'marketplace.search',
      {},
      200,
      JSON.stringify({
        data: { marketplace_search: { feed_units: null } },
        errors: [{ code: 1357038, message: 'field_exception' }],
      }),
    ),
  );
});

test('Marketplace search listing nodes expose public fields and skip ads', () => {
  const body = JSON.stringify({
    data: {
      marketplace_search: {
        feed_units: {
          edges: [
            {
              node: {
                __typename: 'MarketplaceFeedListingStoryObject',
                listing: {
                  id: '1',
                  marketplace_listing_title: 'Table',
                  listing_price: { amount: '10' },
                  seller_message_thread: { secret: 1 },
                },
              },
            },
            { node: { __typename: 'MarketplaceFeedAdStory' } },
            {
              node: {
                __typename: 'MarketplaceFeedGeneralListingObject',
                listing: {
                  id: '2',
                  marketplace_listing_title: 'Jeans',
                  listing_price: { amount: '20' },
                },
              },
            },
          ],
          page_info: { end_cursor: 'next', has_next_page: true },
        },
      },
    },
  });
  const r = validateMarketplace('marketplace.search', {}, 200, body);
  assert.equal(r.page?.items.length, 2);
  assert.equal(r.page?.items[1].marketplace_listing_title, 'Jeans');
  assert.equal(r.page?.hasMore, true);
  assert.doesNotMatch(JSON.stringify(r), /secret/);
});
