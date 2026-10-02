import assert from 'node:assert/strict';
import { test } from 'vitest';
import { marketplaceSearchTemplate } from '../api/facebook-bootstrap.ts';
import { buildFacebookRequest } from '../api/facebook-native.ts';
import { parseInstagramPageTokens } from '@datalom/platform-instagram/api/instagram-bootstrap';
import { LabError } from '@datalom/platform-runtime/reverse-core';

const html = [
  '["DTSGInitialData",[],{"token":"dtsg-token"}]',
  '["LSD",[],{"token":"lsd-token"}]',
  '"queryID":"27517490627932547","variables":{"count":24,"cursor":null,"params":{"bqf":{"callsite":"COMMERCE_MKTPLACE_WWW","query":"seed"}},"savedSearchQuery":"seed"},"queryName":"CometMarketplaceSearchContentContainerQuery"',
].join('');

test('reads the Marketplace search preloader embedded in the document', () => {
  const tokens = parseInstagramPageTokens(html);
  const template = marketplaceSearchTemplate(html);
  assert.equal(tokens.dtsg, 'dtsg-token');
  assert.equal(template.docId, '27517490627932547');
  const request = buildFacebookRequest(
    'marketplace.search',
    {
      url: 'https://www.facebook.com/api/graphql/',
      name: 'CometMarketplaceSearchContentContainerQuery',
      docId: template.docId,
      requestHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
      requestBody: new URLSearchParams({
        fb_api_req_friendly_name: 'CometMarketplaceSearchContentContainerQuery',
        doc_id: template.docId,
        fb_dtsg: tokens.dtsg,
        lsd: tokens.lsd,
        __req: 'a',
        variables: JSON.stringify({
          ...template.variables,
          savedSearchQuery: 'jeans for women',
          params: {
            ...(template.variables.params as object),
            bqf: {
              ...(template.variables.params as { bqf: object }).bqf,
              query: 'jeans for women',
            },
          },
        }),
      }).toString(),
    },
    { query: 'jeans for women' },
    1,
  );
  const variables = JSON.parse(new URLSearchParams(request.body).get('variables') ?? 'null');
  assert.equal(variables.params.bqf.query, 'jeans for women');
  assert.equal(variables.savedSearchQuery, 'jeans for women');
  assert.equal(variables.cursor, null);
});

test('rejects a Marketplace document without the search preloader', () => {
  assert.throws(
    () => marketplaceSearchTemplate('["DTSGInitialData",[],{"token":"d"}]'),
    (error: unknown) => error instanceof LabError && error.message === 'SEARCH_BOOTSTRAP_MISSING',
  );
});
