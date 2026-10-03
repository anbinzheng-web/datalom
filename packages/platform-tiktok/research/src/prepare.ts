import { roxyConfig } from '@datalom/shared/runtime/config';
import { chromium } from 'playwright';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { normalizeVideo } from '@datalom/platform-tiktok/adapter';
import { RoxyConnector, type RoxyConfig } from './roxy.ts';

/** Explicit research action only. Never imported by the production Worker. */
export async function prepareAccount(store: Store, accountId: string, videoInput: string) {
  const a = await store.getAccount(accountId),
    video = normalizeVideo(videoInput),
    config = roxyConfig();
  if (a.platform !== 'tiktok') throw new DatalomError('INVALID_INPUT', '该平台尚未接入请求验证');
  if (!config || config.workspaceId !== a.workspaceId)
    throw new DatalomError('INVALID_INPUT', '请切换到该账号对应的 RoxyBrowser 工作区');
  const connector = new RoxyConnector(config),
    lease = await store.lease(a.id, true);
  if (!lease) throw new DatalomError('CONFLICT', '账号正在执行任务、冷却或已禁用');
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  const timer = setInterval(async () => await store.renew(a.id, lease), 15000);
  try {
    browser = await chromium.connectOverCDP(await connector.endpoint(a.profileId), {
      timeout: 15000,
    });
    const page = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().startsWith('https://www.tiktok.com/'));
    if (!page) throw new DatalomError('INVALID_INPUT', '请打开 TikTok 页面后重试');
    const source = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .reverse()
        .find(
          (name) => name.startsWith('https://www.tiktok.com/api/') && name.includes('device_id='),
        ),
    );
    if (!source)
      throw new DatalomError(
        'RESEARCH_REQUIRED',
        '页面尚未产生可观察的 API 请求，请在 TikTok 打开一个公开视频再采集',
      );
    const common = [
      'WebIdLastTime',
      'aid',
      'app_language',
      'app_name',
      'browser_language',
      'browser_name',
      'browser_online',
      'browser_platform',
      'browser_version',
      'channel',
      'cookie_enabled',
      'data_collection_enabled',
      'device_id',
      'device_platform',
      'focus_state',
      'from_page',
      'history_len',
      'is_fullscreen',
      'is_page_visible',
      'odinId',
      'os',
      'priority_region',
      'referer',
      'region',
      'root_referer',
      'screen_height',
      'screen_width',
      'tz_name',
      'user_is_login',
      'verifyFp',
      'webcast_language',
    ];
    const base = new URL(source),
      previous = await store.getSecret(a.id),
      templates = { ...previous.research?.requestTemplates },
      results = [];
    for (const operation of ['video.detail', 'video.comments'] as const) {
      const path = operation === 'video.detail' ? '/api/item/detail/' : '/api/comment/list/';
      const params = new URLSearchParams(
        [...base.searchParams].filter(([k]) => common.includes(k)),
      );
      params.set(operation === 'video.detail' ? 'itemId' : 'aweme_id', video.id);
      if (operation === 'video.detail')
        params.set('language', base.searchParams.get('app_language') ?? 'en');
      else {
        params.set('count', '20');
        params.set('cursor', '0');
      }
      const responsePromise = page.waitForResponse(
        (r) => {
          const u = new URL(r.url());
          return (
            u.pathname === path &&
            u.searchParams.get(operation === 'video.detail' ? 'itemId' : 'aweme_id') === video.id
          );
        },
        { timeout: 25000 },
      );
      const [, response] = await Promise.all([
        page.evaluate(async (url) => {
          const r = await fetch(url, {
            credentials: 'include',
            signal: AbortSignal.timeout(20000),
          });
          await r.text();
        }, `${path}?${params}`),
        responsePromise,
      ]);
      const body = await response.text(),
        headers = await response.request().allHeaders();
      let json: any;
      try {
        json = JSON.parse(body);
      } catch {}
      const valid =
        response.status() === 200 &&
        json?.status_code === 0 &&
        (operation === 'video.detail'
          ? String(json.itemInfo?.itemStruct?.id) === video.id
          : Array.isArray(json.comments));
      await store.evidence(
        a.id,
        'capture',
        `${operation} · ${valid ? '成功样本' : '待分析'} · HTTP ${response.status()} · ${body.length} bytes`,
        {
          url: response.url(),
          headers,
          response: body,
          status: response.status(),
        },
      );
      if (valid)
        templates[operation] = {
          url: response.url(),
          headers,
          capturedAt: Date.now(),
        };
      results.push({
        operation,
        captured: valid,
        status: response.status(),
        businessCode: json?.status_code ?? null,
      });
      if (operation === 'video.detail') await new Promise((r) => setTimeout(r, 3000));
    }
    const fresh = await connector.extract(a.profileId);
    fresh.secret.research = { requestTemplates: templates };
    if (
      fresh.secret.route &&
      JSON.stringify(fresh.secret.route.account) === JSON.stringify(previous.route?.account) &&
      JSON.stringify(fresh.secret.route.upstream) === JSON.stringify(previous.route?.upstream)
    ) {
      fresh.secret.route.verifiedAt = previous.route?.verifiedAt;
      fresh.secret.route.observedIp = previous.route?.observedIp;
    }
    await store.saveSecret(a.id, a.version, fresh.secret, lease);
    await store.status(a.id, 'pending', '接口样本已采集，等待独立 Worker 验证');
    return { results };
  } finally {
    await browser?.close();
    clearInterval(timer);
    await store.release(a.id, lease);
  }
}
