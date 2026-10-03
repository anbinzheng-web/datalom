export type AccountStatus = 'pending' | 'ready' | 'cooldown' | 'login_required' | 'disabled';

export type ErrorCode =
  | 'OBSERVABILITY'
  | 'INTERNAL'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'LOGIN_REQUIRED'
  | 'CHALLENGE'
  | 'SCHEMA_CHANGED'
  | 'RESEARCH_REQUIRED'
  | 'PROXY_UNAVAILABLE'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'CANCELLED'
  | 'DEADLINE';

export class DatalomError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DatalomError';
  }
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  partitionKey?: string | { topLevelSite: string; hasCrossSiteAncestor?: boolean };
  [key: string]: unknown;
}

export interface ProxyEndpoint {
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface RouteConfig {
  upstream?: ProxyEndpoint;
  account: ProxyEndpoint;
  expectedIp?: string;
  observedIp?: string;
  verifiedAt?: number;
}

export interface SessionSecret {
  cookies: BrowserCookie[];
  storage: {
    origins: unknown[];
    session: Record<string, Record<string, string>>;
  };
  configured: Record<string, unknown>;
  observed: {
    userAgent: string;
    browserVersion: string;
    language: string;
    languages: string[];
    timezone: string;
    [key: string]: unknown;
  };
  route?: RouteConfig;
  cookieJar?: string;
  research?: {
    requestTemplates?: Record<string, RequestTemplate>;
    requestCount?: number;
  };
}

export interface RequestTemplate {
  url: string;
  headers: Record<string, string>;
  capturedAt: number;
  scriptHashes?: string[];
}

export interface Account {
  proxyId?: string | null;
  id: string;
  platform: string;
  source: Record<string, unknown>;
  /** Derived compatibility values for existing callers; authoritative data is source. */
  profileId?: string;
  workspaceId?: string;
  browserNumber?: string;
  identity: string;
  version: number;
  status: AccountStatus;
  updatedAt: number;
  validatedAt: number | null;
}

export type Operation = 'video.detail' | 'video.comments';
export type { TaskInput } from '../api/index.ts';
import type { TaskInput } from '../api/index.ts';

export interface PageResult {
  data: unknown;
  cursor?: string;
  hasMore?: boolean;
  adapterVersion: string;
}

export interface ExecutionContext {
  account: Account;
  session: SessionSecret;
  signal: AbortSignal;
  transport: Transport;
  saveSession(): void;
  recordEvidence(kind: string, summary: string, payload: unknown): void;
  trace?: import('./diagnostics.ts').Trace;
}

export interface PlatformAdapter {
  platform: string;
  version: string;
  execute(input: TaskInput, context: ExecutionContext): Promise<PageResult>;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  body: string;
}

export interface Transport {
  request(
    url: string,
    options: {
      headers?: Record<string, string>;
      signal: AbortSignal;
      method?: string;
      body?: string;
    },
  ): Promise<TransportResponse>;
}

export interface SessionProvider {
  getSecret(id: string): SessionSecret;
  saveSecret(id: string, version: number, secret: SessionSecret, lease: string): void;
}

export function safeError(error: unknown): {
  code: ErrorCode;
  message: string;
} {
  if (error instanceof DatalomError) return { code: error.code, message: error.message };
  return {
    code: 'INTERNAL',
    message: '未分类异常；请查看加密诊断证据中的原始异常与调用栈。',
  };
}
