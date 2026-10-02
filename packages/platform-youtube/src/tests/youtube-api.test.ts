import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyYouTubePage,
  sessionFromAccountProbe,
  youtubeSession,
} from '../api/youtube-session.ts';
import { compactCount, parseYouTube } from '../api/youtube-parser.ts';
import {
  isCommentApi,
  isSearchApi,
  keywordMatches,
  searchUrl,
  videoIdFromUrl,
  watchUrl,
} from '../api/youtube-api.ts';
import {
  inputScriptId,
  keywordScriptId,
  keywordUsesServerApi,
} from '@datalom/platform-runtime/contracts/business';
import { parseYouTubeDocument, YouTubeCookieJar } from '../api/youtube-native.ts';

type SessionPage = Parameters<typeof youtubeSession>[0];

test('YouTube search and watch URLs', () => {
  assert.equal(
    searchUrl('metro turf'),
    'https://www.youtube.com/results?search_query=metro%20turf',
  );
  assert.equal(watchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoIdFromUrl('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(isSearchApi('/youtubei/v1/search'), true);
  assert.equal(isCommentApi('/youtubei/v1/next'), true);
  assert.equal(
    keywordMatches(
      new URL('https://www.youtube.com/youtubei/v1/search?prettyPrint=false'),
      JSON.stringify({ query: 'metro turf' }),
      'metro turf',
    ),
    true,
  );
});

test('compact counts accept K/M and missing values', () => {
  assert.equal(compactCount('1.2K views'), 1200);
  assert.equal(compactCount('1,234'), 1234);
  assert.equal(compactCount('No views'), null);
  assert.equal(compactCount(undefined), null);
  assert.equal(compactCount(55), 55);
});

test('search fixture keeps videos even when likes and channel are missing', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/youtube-search.json', import.meta.url), 'utf8'),
  );
  const page = parseYouTube(fixture, '2026-09-14T00:00:00.000Z');
  assert.equal(page?.kind, 'videos');
  assert.equal(page?.ended, false);
  assert.equal(page?.records.length, 2);
  assert.equal(page?.records[0]?.videoId, 'dQw4w9WgXcQ');
  assert.equal(page?.records[0]?.plays, 1200);
  assert.equal(page?.records[0]?.likes, null);
  assert.equal(page?.records[0]?.authorHandle, 'Official Channel');
  assert.equal(page?.records[1]?.videoId, 'abcdefghijk');
  assert.equal(page?.records[1]?.plays, null);
  assert.equal(page?.records[1]?.authorHandle, null);
});

test('comment fixture keeps comments without likes or handle', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/youtube-comments.json', import.meta.url), 'utf8'),
  );
  const page = parseYouTube(fixture, '2026-09-14T00:00:00.000Z', 'dQw4w9WgXcQ');
  assert.equal(page?.kind, 'comments');
  assert.equal(page?.records.length, 2);
  assert.equal(page?.records[0]?.commentId, 'Ugxd123');
  assert.equal(page?.records[0]?.likes, 12);
  assert.equal(page?.records[0]?.handle, '@alice');
  assert.equal(page?.records[1]?.likes, null);
  assert.equal(page?.records[1]?.text, 'no likes on this one');
});

test('YouTube keyword tasks bind youtube.keyword-research', () => {
  assert.equal(keywordScriptId('YouTube'), 'youtube.keyword-research');
  assert.equal(keywordUsesServerApi('YouTube'), true);
  assert.equal(
    inputScriptId(
      {
        keyword: 'ip',
        videoLimit: 10,
        minLikes: 100,
        commentsPerVideo: 50,
        totalComments: 500,
        maxMinutes: 15,
      },
      'YouTube',
    ),
    'youtube.keyword-research',
  );
});

test('YouTube direct bootstrap parses JSON config and creates SAPISID auth', () => {
  const parsed = parseYouTubeDocument(
    'ytcfg.set({"LOGGED_IN":true,"INNERTUBE_CONTEXT":{"client":{"clientVersion":"2.test"}}});' +
      'var ytInitialData = {"contents":{}};',
  );
  assert.equal(parsed.config.INNERTUBE_CONTEXT.client.clientVersion, '2.test');
  const jar = new YouTubeCookieJar([
    {
      name: 'SAPISID',
      value: 'test-session',
      domain: '.youtube.com',
      path: '/',
      expires: -1,
      secure: true,
      httpOnly: true,
    },
  ]);
  assert.match(jar.auth(1700000000), /^SAPISIDHASH 1700000000_[a-f0-9]{40}$/);
});

test('sign-in URL is login_required; SSL is site_unavailable', () => {
  assert.equal(
    classifyYouTubePage({
      url: 'https://accounts.google.com/ServiceLogin?service=youtube',
      title: 'Sign in',
      text: '',
    }),
    'login_required',
  );
  assert.equal(
    classifyYouTubePage({
      url: 'https://www.youtube.com/results?search_query=x',
      title: 'www.youtube.com',
      text: 'ERR_SSL_PROTOCOL_ERROR',
    }),
    'site_unavailable',
  );
  assert.equal(
    classifyYouTubePage({
      url: 'https://www.youtube.com/results?search_query=phlboss+online+casino',
      title: 'YouTube',
      text: "No internet connection\nConnect to the internet\nYou're offline. Check your connection.\nRetry",
    }),
    'site_unavailable',
  );
  assert.equal(
    sessionFromAccountProbe({ authenticated: false, conclusive: false, username: null }),
    'unknown',
  );
});

test('LOGIN_INFO cookie or avatar is ready without account_menu', async () => {
  let probed = false;
  const page = {
    url: () => 'https://www.youtube.com/results?search_query=x',
    title: async () => 'x - YouTube',
    evaluate: async (fn: (...args: never[]) => unknown) => {
      if (fn.toString().includes('account_menu')) {
        probed = true;
        return { authenticated: false, conclusive: true, username: null };
      }
      return {
        text: 'Home',
        offline: false,
        captcha: false,
        loggedInFlag: false,
        hasLoginCookie: true,
        signedInNav: false,
      };
    },
  };
  assert.equal(await youtubeSession(page as unknown as SessionPage), 'ready');
  assert.equal(probed, false);
});

test('YouTube offline interstitial is site_unavailable even when avatar is present', async () => {
  const page = {
    url: () => 'https://www.youtube.com/results?search_query=phlboss+online+casino',
    title: async () => 'YouTube',
    evaluate: async () => ({
      text: "No internet connection\nYou're offline. Check your connection.",
      offline: true,
      captcha: false,
      loggedInFlag: true,
      hasLoginCookie: true,
      signedInNav: true,
    }),
  };
  assert.equal(await youtubeSession(page as unknown as SessionPage), 'site_unavailable');
});
