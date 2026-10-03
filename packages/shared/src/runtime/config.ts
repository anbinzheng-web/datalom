import type { ProxyEndpoint } from './contracts.ts';

/** Optional machine authentication; normal admin JWT login remains available. */
export function managementToken(): string {
  const token = process.env.DATALOM_MANAGEMENT_TOKEN ?? '';
  if (token && token.length < 32)
    throw new Error('DATALOM_MANAGEMENT_TOKEN must contain at least 32 characters');
  return token;
}

export function roxyConfig():
  { host: string; workspaceId: string; apiKey?: string; upstream?: ProxyEndpoint } | undefined {
  const host = process.env.ROXY_HOST;
  const workspaceId = process.env.ROXY_WORKSPACE_ID;
  if (!host || !workspaceId) return undefined;
  return { host, workspaceId, apiKey: process.env.ROXY_API_KEY, upstream: undefined };
}

export function accountIntervalMs(): number {
  const raw = process.env.DATALOM_ACCOUNT_INTERVAL_MS ?? '3000';
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 3600000)
    throw new Error('DATALOM_ACCOUNT_INTERVAL_MS must be an integer from 0 to 3600000');
  return Number(raw);
}
