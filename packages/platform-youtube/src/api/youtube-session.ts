import type { Page } from 'playwright-core';

export type YouTubePageState =
  'ready' | 'login_required' | 'needs_human' | 'site_unavailable' | 'unknown';

export type YouTubeAccountProbe = {
  authenticated: boolean;
  conclusive: boolean;
  username: string | null;
  status?: number;
  reason?: string;
};

export function classifyYouTubePage(input: {
  url?: string;
  title?: string;
  text?: string;
}): YouTubePageState {
  const url = input.url ?? '';
  const title = input.title ?? '';
  const text = input.text ?? '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    if (
      host.includes('accounts.google.com') ||
      path.startsWith('/signin') ||
      /ServiceLogin/i.test(url)
    )
      return 'login_required';
    if (host.includes('consent.youtube.com') || path.includes('/sorry/')) return 'needs_human';
  } catch {
    /* about:blank */
  }
  if (
    /ERR_SSL_PROTOCOL_ERROR|此网站无法提供安全连接|发送的响应无效|neterror/i.test(text) ||
    /ERR_SSL_PROTOCOL_ERROR/i.test(title)
  )
    return 'site_unavailable';
  if (
    /no internet connection|you're offline|you’re offline|check your connection|connect to the internet/i.test(
      text,
    )
  )
    return 'site_unavailable';
  if (/verify you.re human|unusual traffic|complete the captcha|拖动滑块|请完成验证/i.test(text))
    return 'needs_human';
  if (
    /sign in to youtube|登录 youtube|sign in to continue/i.test(text) &&
    /dialog|form/i.test(text)
  )
    return 'login_required';
  return 'unknown';
}

export function sessionFromAccountProbe(probe: YouTubeAccountProbe): YouTubePageState {
  if (probe.authenticated) return 'ready';
  if (probe.conclusive || probe.status === 401 || probe.status === 403) return 'login_required';
  return 'unknown';
}

export async function probeYouTubeAccount(page: Page): Promise<YouTubeAccountProbe> {
  return page.evaluate(async () => {
    try {
      const cfg =
        (
          window as unknown as {
            ytcfg?: { data_?: { INNERTUBE_CLIENT_VERSION?: string; INNERTUBE_API_KEY?: string } };
          }
        ).ytcfg?.data_ ?? {};
      const response = await fetch('/youtubei/v1/account/account_menu?prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: cfg.INNERTUBE_CLIENT_VERSION || '2.20240101.00.00',
              hl: 'en',
            },
          },
        }),
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        return {
          authenticated: false,
          conclusive: false,
          username: null,
          status: response.status,
          reason: 'account endpoint did not return JSON',
        };
      }
      const body = await response.json();
      const text = JSON.stringify(body);
      const signedIn =
        /accountName|channelHandle|manageAccount|Sign out|退出账号|登出/i.test(text) &&
        !/Sign in to YouTube|登录 YouTube/i.test(text.slice(0, 400));
      const handleMatch = /"simpleText":"(@[A-Za-z0-9._-]+)"/.exec(text);
      return {
        authenticated: Boolean(signedIn || handleMatch),
        conclusive: response.ok,
        username: handleMatch?.[1] ?? null,
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

export async function youtubeSession(page: Page): Promise<YouTubePageState> {
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
      const cfg = (window as unknown as { ytcfg?: { data_?: { LOGGED_IN?: boolean | number } } })
        .ytcfg?.data_;
      return {
        text: document.body?.innerText ?? '',
        offline: navigator.onLine === false,
        captcha: has('iframe[src*="recaptcha"], #captcha, [id*="captcha"]'),
        loggedInFlag: cfg?.LOGGED_IN === true || cfg?.LOGGED_IN === 1,
        hasLoginCookie: document.cookie.split('; ').some((part) => {
          const [name, value] = part.split('=');
          return name === 'LOGIN_INFO' && Boolean(value);
        }),
        signedInNav: has(
          '#avatar-btn, button[aria-label*="Account"], img#img, ytd-topbar-menu-button-renderer #avatar-btn',
        ),
      };
    })
    .catch(() => ({
      text: '',
      offline: false,
      captcha: false,
      loggedInFlag: false,
      hasLoginCookie: false,
      signedInNav: false,
    }));
  const fromCapture = classifyYouTubePage({
    url: page.url(),
    title: await page.title().catch(() => ''),
    text: fromPage.text,
  });
  if (fromCapture !== 'unknown') return fromCapture;
  if (fromPage.offline) return 'site_unavailable';
  if (fromPage.captcha) return 'needs_human';
  if (fromPage.loggedInFlag || fromPage.hasLoginCookie || fromPage.signedInNav) return 'ready';
  return sessionFromAccountProbe(await probeYouTubeAccount(page));
}
