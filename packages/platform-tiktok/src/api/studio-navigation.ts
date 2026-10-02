import type { CollectContext } from './collector.ts';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';

const studioUrl = 'https://www.tiktok.com/tiktokstudio/content';
const maxAttempts = 3;
const budgetMs = 180000;

function transientNavigation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /net::ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|NETWORK_CHANGED)\b/.test(
      message,
    ) ||
    (error instanceof Error && error.name === 'TimeoutError')
  );
}

// Retry only opening the task-owned Studio tab, before any records can be emitted.
export async function navigateStudio(
  ctx: Pick<CollectContext, 'page' | 'signal' | 'progress'>,
  wait: typeof pause = pause,
) {
  const started = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    checkAbort(ctx.signal);
    ctx.progress(`打开 TikTok Studio · ${attempt}/${maxAttempts}`, {
      event: 'navigation.started',
      attempt,
      maxAttempts,
    });
    const attemptStarted = Date.now();
    let onAbort: () => void = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(ctx.signal.reason ?? new Error('CANCELLED'));
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      });
      await Promise.race([
        ctx.page.goto(studioUrl, {
          waitUntil: 'commit',
          timeout: Math.min(60000, Math.max(1, budgetMs - (Date.now() - started))),
        }),
        cancelled,
      ]);
      checkAbort(ctx.signal);
      ctx.progress('等待 TikTok Studio 内容加载', {
        event: 'navigation.completed',
        attempt,
        durationMs: Date.now() - attemptStarted,
      });
      return;
    } catch (error) {
      checkAbort(ctx.signal);
      const delayMs = attempt * 5000;
      if (
        !transientNavigation(error) ||
        attempt === maxAttempts ||
        Date.now() - started + delayMs >= budgetMs
      )
        throw error;
      const message = error instanceof Error ? error.message : String(error);
      ctx.progress(
        `Studio 网络连接超时或中断 · ${delayMs / 1000} 秒后重试 ${attempt + 1}/${maxAttempts}`,
        {
          event: 'navigation.retry',
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          durationMs: Date.now() - attemptStarted,
          code: message.match(/net::(ERR_[A-Z_]+)/)?.[1] ?? 'NAVIGATION_TIMEOUT',
        },
      );
      await wait(delayMs, ctx.signal);
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
    }
  }
}
