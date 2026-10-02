import type { ProfileBinding, RunRecord } from './contracts/index.ts';
import { isStudioInput, isVideoCommentsInput, inputScriptId } from './contracts/index.ts';
type ScriptDefinition = {
  scriptId: string;
  browserMode: 'shared' | 'exclusive' | 'none';
  maxTasksPerBrowser?: number;
};

export type Reservation = { run?: RunRecord; profile: ProfileBinding; script: ScriptDefinition };
export const profileKey = (p: { workspaceId: number | null; profileId: string | null }) =>
  `${p.workspaceId}/${p.profileId}`;

/** Stable code extracted from Error.message / Playwright text for dispatch accounting. */
export function failureCode(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'COLLECTION_FAILED';
  if (/^[A-Z][A-Z0-9_]*$/.test(raw)) return raw;
  if (raw.startsWith('KEYWORD_COMMENTS_INCOMPLETE:')) return 'KEYWORD_COMMENTS_INCOMPLETE';
  if (raw.startsWith('COMMENT_COLLECTION_INCOMPLETE:')) return 'COMMENT_COLLECTION_INCOMPLETE';
  if (raw.startsWith('ACCOUNT_COLLECTION_INCOMPLETE:')) return 'ACCOUNT_COLLECTION_INCOMPLETE';
  if (raw.startsWith('ACCOUNT_METRIC_MISSING:')) return 'ACCOUNT_METRIC_MISSING';
  if (/page\.goto|Timeout \d+ms exceeded|NAVIGATION_FAILED|net::ERR_/i.test(raw))
    return 'BROWSER_NAVIGATION_FAILED';
  if (
    /CDP_ENDPOINT|BROWSER_SESSION|BACKGROUND_PAGE|Target closed|browser has been closed/i.test(raw)
  )
    return 'BROWSER_SESSION_FAILED';
  if (error instanceof Error && error.name === 'AbortError') return 'BROWSER_SESSION_FAILED';
  if (/this operation was aborted/i.test(raw)) return 'BROWSER_SESSION_FAILED';
  return 'COLLECTION_FAILED';
}

/**
 * Switch windows only when this profile cannot continue: missing login, dead
 * session, or network/proxy failure. Page-level issues (wrong comment payload,
 * maintenance on one video, parse stall) stay on the same browser — reload/skip.
 */
export function shouldFailover(code: string, run: RunRecord, maxDispatches: number): boolean {
  if (isStudioInput(run.input)) return false;
  if (
    inputScriptId(run.input, run.platform) === 'tiktok.keyword-research' &&
    Object.values(run.counts).some((count) => count > 0)
  )
    return false;
  if (isVideoCommentsInput(run.input) && (run.counts['tiktok.comments'] ?? 0) > 0) return false;
  if (run.dispatches.length >= maxDispatches) return false;
  return [
    'LOGIN_REQUIRED',
    'LOGIN_STATE_UNKNOWN',
    'SITE_RATE_LIMITED',
    'SITE_UNAVAILABLE',
    'BROWSER_NAVIGATION_FAILED',
    'BROWSER_SESSION_FAILED',
    'CDP_ENDPOINT_UNAVAILABLE',
    'BACKGROUND_PAGE_UNAVAILABLE',
  ].includes(code);
}

export function chooseBrowser(
  profiles: ProfileBinding[],
  run: RunRecord,
  script: ScriptDefinition,
  reservations: Reservation[],
  limits: { maxBrowsers: number; maxTabsPerBrowser: number },
) {
  const tried = new Set(run.dispatches.map((p) => profileKey(p)));
  const candidates = profiles.filter(
    (p) =>
      (!isStudioInput(run.input) ||
        (p.profileId === run.input.profileId && p.workspaceId === run.input.workspaceId)) &&
      p.enabled &&
      p.available !== false &&
      !p.cleanupFailed &&
      p.tags.includes(run.platform) &&
      !tried.has(profileKey(p)) &&
      ['unknown', 'ready'].includes(p.platforms?.[run.platform]?.state ?? 'unknown'),
  );
  const occupied = new Set(reservations.map((r) => profileKey(r.profile)));
  // A failed close may have left a real window open. Keep its slot until manual recovery.
  for (const profile of profiles) if (profile.cleanupFailed) occupied.add(profileKey(profile));
  const available = candidates.filter((profile) => {
    if (occupied.size > limits.maxBrowsers) return false;
    const used = reservations.filter((r) => profileKey(r.profile) === profileKey(profile));
    if (!used.length) return occupied.size < limits.maxBrowsers;
    return (
      script.browserMode === 'shared' &&
      used.every((r) => r.script.browserMode === 'shared') &&
      used.length < limits.maxTabsPerBrowser &&
      used.filter((r) => r.script.scriptId === script.scriptId).length <
        (script.maxTasksPerBrowser ?? 1)
    );
  });
  available.sort((a, b) => {
    const load = (p: ProfileBinding) =>
      reservations.filter((r) => profileKey(r.profile) === profileKey(p)).length;
    return (
      load(a) - load(b) ||
      (a.lastUsedAt ?? '').localeCompare(b.lastUsedAt ?? '') ||
      profileKey(a).localeCompare(profileKey(b))
    );
  });
  return {
    profile: available[0],
    reason: candidates.length ? '等待浏览器空闲' : '没有可用的平台窗口，请检查标签、开关或登录状态',
  };
}
