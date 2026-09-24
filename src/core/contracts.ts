export type AccountStatus =
  "pending" | "ready" | "cooldown" | "login_required" | "disabled";
export type ErrorCode =
  | "OBSERVABILITY"
  | "INTERNAL"
  | "NETWORK"
  | "RATE_LIMIT"
  | "LOGIN_REQUIRED"
  | "CHALLENGE"
  | "SCHEMA_CHANGED"
  | "RESEARCH_REQUIRED"
  | "PROXY_UNAVAILABLE"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "CANCELLED"
  | "DEADLINE";
export class SpiderError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SpiderError";
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
  sameSite: "Strict" | "Lax" | "None";
  partitionKey?:
    string | { topLevelSite: string; hasCrossSiteAncestor?: boolean };
  [key: string]: unknown;
}
export interface ProxyEndpoint {
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}
export interface RouteConfig {
  upstream: ProxyEndpoint;
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
  id: string;
  platform: "tiktok";
  label: string;
  profileId: string;
  workspaceId: string;
  identity: string;
  notes: string;
  version: number;
  status: AccountStatus;
  reason: string;
  updatedAt: number;
  validatedAt: number | null;
  nextAllowedAt: number;
}
export type Operation = "video.detail" | "video.comments";
export interface TaskInput {
  accountId: string;
  operation: Operation;
  video: string;
  cursor?: string;
  maxPages?: number;
  count?: number;
}
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
  trace?: import("./diagnostics.ts").Trace;
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
  saveSecret(
    id: string,
    version: number,
    secret: SessionSecret,
    lease: string,
  ): void;
}
export function safeError(error: unknown): {
  code: ErrorCode;
  message: string;
} {
  if (error instanceof SpiderError)
    return { code: error.code, message: error.message };
  return {
    code: "INTERNAL",
    message: "未分类异常；请查看加密诊断证据中的原始异常与调用栈。",
  };
}
