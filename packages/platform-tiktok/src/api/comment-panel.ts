import type { Page } from 'playwright-core';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';

// 9609db5d: cinema preloads comments while its collapsed pane has width=0.
// 2aa9ec82: classic detail has an already-open DivCommentListContainer, without the cinema button.
// Dimensions/scrollHeight alone do not imply that its pagination observer can run.
export function inspectCommentPanel(scroll = false): 'missing' | 'closed' | 'ready' {
  const panes = [
    ...document.querySelectorAll<HTMLElement>(
      '[aria-label="cinema-side-panel-comment-scroll-content"], [class*="DivCommentMain"], [class*="DivCommentContainer"] [class*="DivCommentListContainer"]',
    ),
  ];
  if (!panes.length) return 'missing';
  const pane = panes.find((el) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 100 &&
      rect.height > 100 &&
      rect.right > 0 &&
      rect.left < innerWidth &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)
    );
  });
  if (!pane) return 'closed';
  if (scroll) pane.scrollTop = pane.scrollHeight;
  return 'ready';
}

export async function openCommentPanel(page: Page, signal: AbortSignal) {
  const until = Date.now() + 30000;
  let clicks = 0;
  let lastClick = 0;
  let buttonSince = 0;
  while (Date.now() < until) {
    checkAbort(signal);
    const state = await page.evaluate(inspectCommentPanel, false);
    if (state === 'ready') return;
    const button = page
      .getByRole('button', { name: /^Read or add comments / })
      .filter({ visible: true })
      .first();
    const visible = await button.isVisible();
    if (!visible) buttonSince = 0;
    else if (!buttonSince) buttonSince = Date.now();
    // f370: markup and button appear before the side panel and its handlers are ready.
    // Use an actionable browser click, then observe the result. At most one retry after
    // five seconds without an open panel; never toggle a panel already reported ready.
    if (
      visible &&
      clicks < 2 &&
      Date.now() - lastClick >= 5000 &&
      (state === 'closed' || Date.now() - buttonSince >= 2000)
    ) {
      // The panel may finish opening while locating the button.
      if ((await page.evaluate(inspectCommentPanel, false)) === 'ready') return;
      await button.click({ timeout: Math.min(5000, Math.max(1, until - Date.now())) });
      clicks++;
      lastClick = Date.now();
    }
    await pause(250, signal);
  }
  throw new Error('COMMENT_PANEL_NOT_OPEN');
}
