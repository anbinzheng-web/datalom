import type { Browser, Page } from 'playwright-core';

export type BrowserSession = {
  browser: Browser;
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
};
export type BrowserLease = { page: Page; browser: Browser; dispose: () => Promise<void> };
type Entry = {
  refs: number;
  session: Promise<BrowserSession>;
  pageQueue: Promise<unknown>;
  closing?: Promise<void>;
};

// The scheduler reserves capacity before calling acquire; this pool owns only CDP/Tab lifetime.
export class BrowserPool {
  private entries = new Map<string, Entry>();
  constructor(private open: (workspaceId: number, profileId: string) => Promise<BrowserSession>) {}
  async acquire(workspaceId: number, profileId: string): Promise<BrowserLease> {
    const key = `${workspaceId}/${profileId}`;
    let entry = this.entries.get(key);
    if (entry?.closing) {
      await entry.closing;
      return await this.acquire(workspaceId, profileId);
    }
    if (!entry) {
      entry = { refs: 0, session: this.open(workspaceId, profileId), pageQueue: Promise.resolve() };
      this.entries.set(key, entry);
    }
    entry.refs++;
    const current = entry;
    const release = async () => {
      current.refs--;
      if (current.refs !== 0) return;
      current.closing = (async () => {
        try {
          // The factory owns cleanup if opening never produced a session.
          const session = await current.session.catch(() => undefined);
          await session?.close();
        } finally {
          if (this.entries.get(key) === current) this.entries.delete(key);
        }
      })();
      await current.closing;
    };
    try {
      const session = await current.session;
      const opening = current.pageQueue.then(() => session.newPage());
      current.pageQueue = opening.catch(() => {});
      const page = await opening;
      let disposed = false;
      return {
        page,
        browser: session.browser,
        dispose: async () => {
          if (disposed) return;
          disposed = true;
          try {
            if (typeof page.isClosed !== 'function' || !page.isClosed())
              await page.close({ runBeforeUnload: false }).catch(() => {});
          } finally {
            await release();
          }
        },
      };
    } catch (error) {
      try {
        await release();
      } catch {
        throw new Error('BROWSER_SESSION_CLEANUP_FAILED');
      }
      throw error;
    }
  }
}
