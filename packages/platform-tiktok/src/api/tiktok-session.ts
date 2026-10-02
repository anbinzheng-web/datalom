import type { Page } from 'playwright-core';

export type TikTokPageState =
  'ready' | 'login_required' | 'needs_human' | 'site_unavailable' | 'unknown';

export type TikTokAccountProbe = {
  authenticated: boolean;
  conclusive: boolean;
  username: string | null;
  status?: number;
  reason?: string;
};

/** Classify from captured URL/title/text so SSL and maintenance pages are not LOGIN_STATE_UNKNOWN. */
export function classifyTikTokPage(input: {
  url?: string;
  title?: string;
  text?: string;
}): TikTokPageState {
  const url = input.url ?? '';
  const title = input.title ?? '';
  const text = input.text ?? '';
  try {
    if (new URL(url).pathname.startsWith('/login')) return 'login_required';
  } catch {
    // about:blank and chrome-error pages have no usable path.
  }
  if (
    /ERR_SSL_PROTOCOL_ERROR|此网站无法提供安全连接|发送的响应无效|neterror/i.test(text) ||
    /ERR_SSL_PROTOCOL_ERROR/i.test(title)
  )
    return 'site_unavailable';
  if (
    /site maintenance/i.test(title) ||
    /oops!\s*something went wrong/i.test(text) ||
    /please contact your administrator with the error code/i.test(text)
  )
    return 'site_unavailable';
  if (/verify to continue|complete the puzzle|拖动滑块|请完成验证/i.test(text))
    return 'needs_human';
  if (/log in to tiktok|登录 tiktok|登入 tiktok/i.test(text) && /dialog/i.test(text))
    return 'login_required';
  return 'unknown';
}

export function sessionFromAccountProbe(probe: TikTokAccountProbe): TikTokPageState {
  if (probe.authenticated) return 'ready';
  if (probe.conclusive || probe.status === 401 || probe.status === 403) return 'login_required';
  return 'unknown';
}

/** In-page fetch reuses the signed TikTok session; a valid login returns JSON user fields. */
export async function probeTikTokAccount(page: Page): Promise<TikTokAccountProbe> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('https://www.tiktok.com/passport/web/account/info/', {
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json, text/plain, */*' },
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
      const user = body?.data?.user ?? body?.data ?? {};
      const userId = user.user_id ?? user.userId ?? user.uid ?? null;
      const username = user.username ?? null;
      const displayName = user.screen_name ?? user.display_name ?? user.nickname ?? null;
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
  });
}

export async function tikTokSession(page: Page): Promise<TikTokPageState> {
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
      return {
        text: document.body?.innerText ?? '',
        captcha: has('[id*="captcha"], [data-e2e="captcha"]'),
      };
    })
    .catch(() => ({ text: '', captcha: false }));
  const fromCapture = classifyTikTokPage({
    url: page.url(),
    title: await page.title().catch(() => ''),
    text: fromPage.text,
  });
  if (fromCapture !== 'unknown') return fromCapture;
  if (fromPage.captcha) return 'needs_human';
  return sessionFromAccountProbe(await probeTikTokAccount(page));
}
