import type { Page } from 'playwright-core';
import {
  isVideoCommentsInput,
  isAccountInput,
  isStudioInput,
  type Dataset,
  type RunRecord,
} from '@datalom/platform-runtime/contracts/index';
import type { DataRow } from '@datalom/platform-runtime/tiktok-parser';

import { runKeywordApi } from './keyword-api.ts';

export type CollectContext = {
  run: RunRecord;
  signal: AbortSignal;
  page: Page;
  emit: (dataset: Dataset, rows: DataRow[]) => void;
  progress: (step: string, data?: Record<string, unknown>) => void;
  sample?: unknown;
  verifyProxy?: () => Promise<void>;
  recordDiagnostic?: (evidence: Record<string, unknown>) => void;
};

export { checkAbort, pause } from '@datalom/platform-runtime/pause';

export async function collectKeyword(ctx: CollectContext) {
  const input = ctx.run.input;
  if (isVideoCommentsInput(input) || isAccountInput(input) || isStudioInput(input))
    throw new Error('SCRIPT_INPUT_MISMATCH');
  await runKeywordApi(ctx, input);
}

export async function capture(page: Page | undefined, run: RunRecord, sample?: unknown) {
  const closed = !page || (typeof page.isClosed === 'function' ? page.isClosed() : false);
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    runId: run.runId,
    attemptId: run.attemptId,
    scriptVersion: run.scriptVersion,
    step: run.step,
    error: run.error,
    createdAt: new Date().toISOString(),
    sample: sample ?? null,
    trace: {
      status: 'unavailable',
      reason: '当前版本记录步骤、DOM、截图和解析输入；尚未启用 Trace 归档。',
    },
  };
  if (closed)
    return { ...evidence, page: { status: 'unavailable', reason: '页面未建立或已经关闭' } };
  for (const [name, read] of Object.entries({
    html: () =>
      page.evaluate(() => {
        const root = document.documentElement.cloneNode(true) as HTMLElement;
        root
          .querySelectorAll('script,style,input,textarea,form,noscript')
          .forEach((e) => e.remove());
        for (const el of root.querySelectorAll('*'))
          for (const attr of [...el.attributes])
            if (!['class', 'role', 'id', 'data-e2e', 'aria-label'].includes(attr.name))
              el.removeAttribute(attr.name);
        return root.outerHTML.slice(0, 250000);
      }),
    aria: async () => (await page.locator('body').ariaSnapshot({ timeout: 3000 })).slice(0, 64000),
    screenshot: async () =>
      (await page.screenshot({ type: 'jpeg', quality: 55, timeout: 3000 })).toString('base64'),
  })) {
    let timer: NodeJS.Timeout | undefined;
    try {
      evidence[name] = {
        status: 'available',
        value: await Promise.race([
          read(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), 4000);
          }),
        ]),
      };
    } catch {
      evidence[name] = { status: 'unavailable', reason: '捕获超时或页面不可用' };
    } finally {
      clearTimeout(timer);
    }
  }
  return evidence;
}
