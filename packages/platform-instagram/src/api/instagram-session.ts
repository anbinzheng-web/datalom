import type { Page } from 'playwright-core';
import { INSTAGRAM_APP_ID } from './instagram-api.ts';

export type InstagramPageState =
  'ready' | 'login_required' | 'needs_human' | 'site_unavailable' | 'unknown';

export type InstagramAccountProbe = {
  authenticated: boolean;
  conclusive: boolean;
  username: string | null;
  status?: number;
  reason?: string;
};

export function classifyInstagramPage(input: {
  url?: string;
  title?: string;
  text?: string;
}): InstagramPageState {
  const url = input.url ?? '';
  const title = input.title ?? '';
  const text = input.text ?? '';
  try {
    const path = new URL(url).pathname;
    if (path.startsWith('/accounts/login') || path.startsWith('/accounts/emailsignup'))
      return 'login_required';
    if (path.startsWith('/challenge') || path.startsWith('/accounts/suspended'))
      return 'needs_human';
  } catch {
    // about:blank and chrome-error pages have no usable path.
  }
  if (
    /ERR_SSL_PROTOCOL_ERROR|此网站无法提供安全连接|发送的响应无效|neterror/i.test(text) ||
    /ERR_SSL_PROTOCOL_ERROR/i.test(title)
  )
    return 'site_unavailable';
  if (/verify to continue|complete the puzzle|拖动滑块|请完成验证|checkpoint/i.test(text))
    return 'needs_human';
  if (/log in to instagram|登录 instagram|log in to see/i.test(text) && /dialog|form/i.test(text))
    return 'login_required';
  return 'unknown';
}

export function sessionFromAccountProbe(probe: InstagramAccountProbe): InstagramPageState {
  if (probe.authenticated) return 'ready';
  if (probe.conclusive || probe.status === 401 || probe.status === 403) return 'login_required';
  return 'unknown';
}

export async function probeInstagramAccount(page: Page): Promise<InstagramAccountProbe> {
  return page.evaluate(async (appId) => {
    try {
      const csrf =
        typeof document === 'undefined'
          ? undefined
          : document.cookie
              .split('; ')
              .find((part) => part.startsWith('csrftoken='))
              ?.slice('csrftoken='.length);
      const response = await fetch('https://www.instagram.com/api/v1/accounts/current_user/', {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          accept: 'application/json, text/plain, */*',
          'x-ig-app-id': appId,
          'x-requested-with': 'XMLHttpRequest',
          ...(csrf ? { 'x-csrftoken': csrf } : {}),
        },
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {
          authenticated: false,
          conclusive: false,
          username: null,
          status: response.status,
          reason: 'account endpoint did not return JSON',
        };
      }
      const body = await response.json();
      if (body?.message === 'login_required') {
        return {
          authenticated: false,
          conclusive: true,
          username: null,
          status: response.status,
          reason: 'login_required',
        };
      }
      if (body?.status === 'fail') {
        return {
          authenticated: false,
          conclusive: false,
          username: null,
          status: response.status,
          reason: typeof body?.message === 'string' ? body.message : 'status fail',
        };
      }
      const user = body?.user ?? body?.data?.user ?? {};
      const userId = user.pk ?? user.pk_id ?? user.id ?? user.user_id ?? null;
      const username = user.username ?? null;
      const displayName = user.full_name ?? user.fullName ?? null;
      return {
        authenticated: Boolean(userId || username || displayName),
        conclusive: response.ok,
        username: typeof username === 'string' && username.trim() ? username.trim() : null,
        status: response.status,
      };
    } catch (error) {
      return {
        authenticated: false,
        conclusive: false,
        username: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }, INSTAGRAM_APP_ID);
}

export async function instagramAppReady(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const splash = document.getElementById('splash-screen');
      if (!splash) return true;
      const box = splash.getBoundingClientRect();
      const style = getComputedStyle(splash);
      return (
        box.height <= 40 ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      );
    })
    .catch(() => false);
}

export async function instagramSession(page: Page): Promise<InstagramPageState> {
  const fromPage = await page
    .evaluate(() => {
      const visible = (element: Element) => {
        const box = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
        );
      };
      const has = (selector: string) => [...document.querySelectorAll(selector)].some(visible);
      const splash = document.getElementById('splash-screen');
      const splashBox = splash?.getBoundingClientRect();
      const splashStyle = splash ? getComputedStyle(splash) : null;
      return {
        text: document.body?.innerText ?? '',
        captcha: has('[id*="captcha"], iframe[src*="captcha"], [data-bloks-name*="captcha"]'),
        splash: Boolean(
          splash &&
          splashBox &&
          splashBox.height > 40 &&
          splashStyle &&
          splashStyle.display !== 'none' &&
          splashStyle.visibility !== 'hidden' &&
          splashStyle.opacity !== '0',
        ),
        signedInNav: has(
          'svg[aria-label="Home"], svg[aria-label="首页"], a[href="/direct/inbox/"], a[href^="/direct/inbox"]',
        ),
        hasUserCookie: document.cookie.split('; ').some((part) => {
          const [name, value] = part.split('=');
          return name === 'ds_user_id' && Boolean(value);
        }),
      };
    })
    .catch(() => ({
      text: '',
      captcha: false,
      splash: false,
      signedInNav: false,
      hasUserCookie: false,
    }));
  const fromCapture = classifyInstagramPage({
    url: page.url(),
    title: await page.title().catch(() => ''),
    text: fromPage.text,
  });
  if (fromCapture !== 'unknown') return fromCapture;
  if (fromPage.captcha) return 'needs_human';
  // Run 343f01ad captured #splash-screen + Meta logo and still probed
  // current_user, which returns login_required JSON before the app hydrates.
  if (fromPage.splash) return 'unknown';
  if (fromPage.hasUserCookie || fromPage.signedInNav) return 'ready';
  return sessionFromAccountProbe(await probeInstagramAccount(page));
}
