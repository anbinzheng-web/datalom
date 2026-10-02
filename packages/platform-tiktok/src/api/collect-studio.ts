import { isStudioInput } from '@datalom/platform-runtime/contracts/index';
import { redact } from '@datalom/platform-runtime/logging';
import type { CollectContext } from './collector.ts';
import { checkAbort } from '@datalom/platform-runtime/pause';
import {
  parseStudioAnalytics,
  parseStudioIdentity,
  parseStudioList,
  studioInsightPath,
  studioInsightTypes,
  studioListBody,
  studioListPath,
  studioUserPath,
} from './studio-parser.ts';
import { createHarvest } from './harvest.ts';
import { navigateStudio } from './studio-navigation.ts';

export { studioInsightPath, studioInsightTypes, studioListPath, studioUserPath };

// Use the authenticated page's fetch, including TikTok's installed request wrapper.
// No cookies, signatures or captured authentication headers leave the browser.
async function studioRequest(ctx: CollectContext, path: string, body?: unknown) {
  checkAbort(ctx.signal);
  const response = await ctx.page
    .evaluate(
      async ({ path, body }) => {
        if (location.origin !== 'https://www.tiktok.com') throw new Error('STUDIO_ORIGIN_MISMATCH');
        const response = await fetch(path, {
          credentials: 'include',
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 401 || response.status === 403) throw new Error('LOGIN_REQUIRED');
        if (response.status === 429) throw new Error('SITE_RATE_LIMITED');
        if (!response.ok) throw new Error(`STUDIO_HTTP_${response.status}`);
        const text = await response.text();
        if (text.length > 2 * 1024 * 1024) throw new Error('STUDIO_RESPONSE_TOO_LARGE');
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('STUDIO_RESPONSE_NOT_JSON');
        }
        if (path === '/tiktokstudio/api/web/user') {
          const user = data.userBaseInfo?.UserProfile?.UserBase;
          return {
            statusCode: data.statusCode,
            userId: data.userId,
            handle: user?.UniqId,
            name: user?.NickName,
          };
        }
        // Media signatures are unnecessary for reporting and offline parser replay.
        const sanitize = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(sanitize);
          if (value && typeof value === 'object')
            return Object.fromEntries(
              Object.entries(value)
                .filter(
                  ([key]) =>
                    !/token|cookie|authorization|secret|signature|credential|api.?key/i.test(key),
                )
                .map(([key, entry]) => [key, sanitize(entry)]),
            );
          if (typeof value === 'string' && /^https?:\/\//.test(value)) {
            try {
              const url = new URL(value);
              url.search = '';
              url.hash = '';
              return url.toString();
            } catch {
              return null;
            }
          }
          return value;
        };
        return sanitize(data);
      },
      { path, body },
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.match(/\b(STUDIO_[A-Z0-9_]+|LOGIN_REQUIRED|SITE_RATE_LIMITED)\b/)?.[1];
      if (code) throw new Error(code);
      throw error;
    });
  checkAbort(ctx.signal);
  return response;
}

export async function collectStudio(ctx: CollectContext) {
  if (!isStudioInput(ctx.run.input)) throw new Error('SCRIPT_INPUT_MISMATCH');
  if (
    ctx.run.profileId !== ctx.run.input.profileId ||
    ctx.run.workspaceId !== ctx.run.input.workspaceId
  )
    throw new Error('STUDIO_PROFILE_MISMATCH');
  const harvest = createHarvest(ctx.page, ctx.signal);
  try {
    await navigateStudio(ctx);
    // Wait for the Studio application to initialize, not unrelated resource load.
    try {
      await ctx.page.getByPlaceholder('Search for post description').waitFor({ timeout: 60000 });
    } catch (error) {
      await harvest.state();
      throw error;
    }
    await harvest.requireLogin();
    const identity = async () => parseStudioIdentity(await studioRequest(ctx, studioUserPath));
    const owner = await identity();
    let rank = 0;
    const seen = new Set<string>();
    let pagesUsed = 0;
    for (const recentPosts of [true, false]) {
      let cursor = 0;
      let modeEnded = false;
      while (!modeEnded && pagesUsed < 1000) {
        pagesUsed += 1;
        ctx.progress(`读取 Studio 视频列表 · 已保存 ${rank} 个`);
        if ((await identity()).id !== owner.id) throw new Error('STUDIO_ACCOUNT_CHANGED');
        const body = await studioRequest(ctx, studioListPath, studioListBody(cursor, recentPosts));
        ctx.sample = { source: studioListPath, body: redact(body), recentPosts };
        const batch = parseStudioList(body, new Date().toISOString());
        for (const video of batch.records) {
          const id = String(video.videoId);
          if (seen.has(id)) continue;
          ctx.progress(`读取 Studio 分析 · ${rank + 1}`);
          const query = new URLSearchParams({
            type_requests: JSON.stringify(
              studioInsightTypes.map((insigh_type) => ({ insigh_type, aweme_id: id })),
            ),
          });
          const analysis = await studioRequest(ctx, `${studioInsightPath}?${query}`);
          ctx.sample = {
            source: studioInsightPath,
            videoId: id,
            ownerId: owner.id,
            body: redact(analysis),
          };
          const metrics = parseStudioAnalytics(analysis, id, owner.id);
          ctx.emit('tiktok.videos', [
            {
              ...video,
              ...metrics,
              rank: ++rank,
              authorId: owner.id,
              authorHandle: owner.handle,
              authorName: owner.name,
              url: `https://www.tiktok.com/@${owner.handle}/video/${id}`,
              source: 'tiktok-studio',
              raw: redact({ post: video.raw, analytics: analysis }),
            },
          ]);
          seen.add(id);
        }
        if (batch.ended) {
          if ((await identity()).id !== owner.id) throw new Error('STUDIO_ACCOUNT_CHANGED');
          modeEnded = true;
          continue;
        }
        if (!batch.records.length || batch.cursor <= cursor)
          throw new Error('STUDIO_PAGINATION_STALLED');
        cursor = batch.cursor;
      }
      if (!modeEnded) throw new Error('STUDIO_PAGE_LIMIT');
    }
  } finally {
    harvest.stop();
  }
}
