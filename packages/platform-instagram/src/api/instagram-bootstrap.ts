import { INSTAGRAM_APP_ID } from './instagram-api.ts';
import { instagramOperations, type InstagramCapture } from './instagram-native.ts';
import { LabError } from '@datalom/platform-runtime/reverse-core';
import type { GraphqlCapture } from '@datalom/platform-runtime/contracts/cookie-pool';

export const instagramDocIds = {
  'search.media': '37324993597144881',
  'search.media.page': '28656899673911396',
  'post.comments': '28169471862682868',
} as const;

function token(html: string, names: string[]) {
  for (const name of names) {
    const match =
      new RegExp(`"${name}"\\s*,\\s*\\[\\]\\s*,\\s*\\{\\s*"token"\\s*:\\s*"([^"]+)"`).exec(html) ??
      new RegExp(`"${name}"\\s*:\\s*\\{\\s*"token"\\s*:\\s*"([^"]+)"`).exec(html);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function parseInstagramPageTokens(html: string) {
  const dtsg = token(html, ['DTSGInitialData', 'dtsg']);
  const lsd = token(html, ['LSD', 'lsd']);
  if (!dtsg || !lsd) throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  return { dtsg, lsd };
}

export function csrfFromCookie(cookie: string) {
  const value = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('csrftoken='))
    ?.slice('csrftoken='.length);
  return value && /^[\x21-\x7e]{1,2048}$/.test(value) ? value : null;
}

function capture(
  operation: keyof typeof instagramDocIds,
  tokens: { dtsg: string; lsd: string; csrf: string },
  variables: Record<string, unknown>,
): GraphqlCapture {
  const name = instagramOperations[operation].name;
  const docId = instagramDocIds[operation];
  return {
    url: 'https://www.instagram.com/graphql/query',
    name,
    docId,
    method: 'POST',
    requestHeaders: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://www.instagram.com',
      referer: 'https://www.instagram.com/',
      'x-csrftoken': tokens.csrf,
      'x-fb-friendly-name': name,
      'x-ig-app-id': INSTAGRAM_APP_ID,
    },
    requestBody: new URLSearchParams({
      fb_api_req_friendly_name: name,
      doc_id: docId,
      fb_dtsg: tokens.dtsg,
      lsd: tokens.lsd,
      __req: 'a',
      variables: JSON.stringify(variables),
    }).toString(),
  };
}

export function instagramGraphqlCaptures(tokens: {
  dtsg: string;
  lsd: string;
  csrf: string;
}): Record<string, GraphqlCapture> {
  return {
    'search.media': capture('search.media', tokens, {
      query: 'bootstrap',
      search_session_id: '0',
      serp_session_id: '0',
    }),
    'search.media.page': capture('search.media.page', tokens, {
      query: 'bootstrap',
      after: null,
      first: 10,
      search_session_id: '0',
      serp_session_id: '0',
    }),
    'post.comments': capture('post.comments', tokens, {
      media_id: '0',
      after: null,
      first: 10,
      // Required by the live comment query; absent values fail before any comments return.
      __relay_internal__pv__PolarisIsLoggedInrelayprovider: true,
    }),
  };
}

function rewriteVariables(
  value: InstagramCapture,
  patch: Record<string, unknown>,
): InstagramCapture {
  const form = new URLSearchParams(value.requestBody ?? '');
  const variables = JSON.parse(form.get('variables') ?? 'null');
  if (!variables || typeof variables !== 'object' || Array.isArray(variables))
    throw new LabError('GRAPHQL_TEMPLATE_REQUIRED');
  Object.assign(variables, patch);
  form.set('variables', JSON.stringify(variables));
  return { ...value, requestBody: form.toString() };
}

export function instagramCaptureForMedia(value: InstagramCapture, mediaId: string) {
  return rewriteVariables(value, { media_id: mediaId });
}

export function instagramCaptureForSearchPage(
  value: InstagramCapture,
  query: string,
  after: string | null,
) {
  return rewriteVariables(value, { query, after });
}

export function instagramHomeAllowed(url: URL, method: string) {
  return url.origin === 'https://www.instagram.com' && method === 'GET' && url.pathname === '/';
}
