export * from './execution.ts';
export * from './realtime.ts';
import { businessParams } from './business.ts';
export * from './business.ts';
export * from './cookie-pool.ts';
export const PROTOCOL_VERSION = 1;
export type CloudUser = {
  id: string;
  username: string;
  role: 'admin' | 'user';
  accountType: 'admin' | 'invited' | 'regular';
};
export function isInternalUser(user: Pick<CloudUser, 'role' | 'accountType'>) {
  return user.role === 'admin' || user.accountType === 'invited';
}
export type InvitationSummary = {
  id: string;
  createdAt: number;
  usageCount: number;
};
export const CHANNEL = 'crawler:invoke';
export const AUTH_CHANNEL = 'crawler:auth';
export const CLIPBOARD_CHANNEL = 'crawler:clipboard';
export type DeviceLoginState = {
  status: 'idle' | 'starting' | 'pending' | 'authorized' | 'error';
  userCode?: string;
  expiresAt?: number;
  message?: string;
};
export const EVENT_CHANNEL = 'crawler:event';
export const METHODS = [
  'runtime.snapshot',
  'settings.get',
  'settings.set',
  ...Object.keys(businessParams),
] as const;
export type Method =
  'runtime.snapshot' | 'settings.get' | 'settings.set' | keyof typeof businessParams;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Request = {
  protocolVersion: number;
  requestId: string;
  method: Method;
  params: Record<string, unknown>;
};
export type Reply =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: { code: string; message: string; retryable: boolean } };
export type RuntimeEvent = {
  topic: 'runtime.changed' | 'host.status';
  runtimeGeneration: string;
  sequence: number;
  payload: unknown;
};
export type Snapshot = {
  protocolVersion: number;
  runtimeVersion: string;
  runtimeGeneration: string;
  sequence: number;
  mode: 'ready' | 'draining';
  deviceId: string;
  startedAt: string;
  nodeVersion: string;
  storage: 'sqlite+json';
  capabilities: string[];
  runningTaskCount: number;
};
export interface DesktopBridge {
  auth(
    action: 'start' | 'status' | 'cancel' | 'openConsole',
    path?: string,
  ): Promise<DeviceLoginState>;
  writeClipboard(text: string): Promise<void>;
  invoke(request: Request): Promise<Reply>;
  subscribe(topic: RuntimeEvent['topic'], listener: (event: RuntimeEvent) => void): () => void;
}
export function failure(
  requestId: string,
  code: string,
  message: string,
  retryable = false,
): Reply {
  return { requestId, ok: false, error: { code, message, retryable } };
}
export function parseRequest(input: unknown): Request {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('INVALID_REQUEST');
  const r = input as Record<string, unknown>;
  if (r.protocolVersion !== PROTOCOL_VERSION) throw new Error('PROTOCOL_MISMATCH');
  if (typeof r.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.requestId))
    throw new Error('INVALID_REQUEST_ID');
  if (!METHODS.includes(r.method as Method)) throw new Error('METHOD_NOT_SUPPORTED');
  if (!r.params || typeof r.params !== 'object' || Array.isArray(r.params))
    throw new Error('INVALID_PARAMS');
  if (
    JSON.stringify(r).length >
    (r.method === 'executor.import'
      ? 10 * 1024 * 1024
      : r.method === 'profiles.saveAccounts'
        ? 256 * 1024
        : 16_384)
  )
    throw new Error('REQUEST_TOO_LARGE');
  const params = r.params as Record<string, unknown>;
  if ((r.method as string) in businessParams) {
    const schema = businessParams[r.method as keyof typeof businessParams];
    const parsed = schema.safeParse(params);
    if (!parsed.success) throw new Error('INVALID_PARAMS');
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: r.requestId,
      method: r.method as Method,
      params: parsed.data,
    };
  }
  // Foundation deliberately exposes just one harmless setting; credentials never traverse generic settings.
  if (
    r.method === 'settings.set' &&
    (params.key !== 'displayName' ||
      typeof params.value !== 'string' ||
      params.value.length > 100 ||
      Object.keys(params).length !== 2)
  )
    throw new Error('INVALID_SETTING');
  if (r.method !== 'settings.set' && Object.keys(params).length !== 0)
    throw new Error('INVALID_PARAMS');
  return r as Request;
}
export function isReply(value: unknown): value is Reply {
  if (!value || typeof value !== 'object') return false;
  const r = value as Reply;
  return (
    typeof r.requestId === 'string' &&
    (r.ok === true || (r.ok === false && typeof r.error?.code === 'string'))
  );
}

export * from './cloud-tasks.ts';
export * from './scheduling.ts';

export * from './executor-backup.ts';
