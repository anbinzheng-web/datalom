import { z } from 'zod';
import { pageJSState } from './page-js-state.ts';
export * from './page-js-state.ts';
import { browserEnvironment, browserEnvironmentSummary } from './browser-environment.ts';
export * from './browser-environment.ts';

// One capability list for the Desktop entry and future platform adapters.
export const accountPoolPlatforms = ['TikTok', 'Facebook', 'YouTube', 'Instagram', 'X'] as const;
export const accountPoolExtractionEnabled = (platform: string) =>
  platform === 'TikTok' ||
  platform === 'Instagram' ||
  platform === 'Facebook' ||
  platform === 'YouTube' ||
  platform === 'X';
export const platformCookieHosts: Record<(typeof accountPoolPlatforms)[number], string[]> = {
  TikTok: ['tiktok.com'],
  Instagram: ['instagram.com'],
  Facebook: ['facebook.com'],
  YouTube: ['youtube.com'],
  X: ['x.com', 'twitter.com'],
};
export const poolTypes = ['shared', 'dedicated'] as const;
export const poolTypeSchema = z.enum(poolTypes);
export type PoolType = z.infer<typeof poolTypeSchema>;
export const POOL_TYPE_LABELS: Record<PoolType, string> = {
  shared: '公共',
  dedicated: '专用',
};
export function poolTypeOf(account: { poolType?: string | null }) {
  return account.poolType === 'dedicated' ? 'dedicated' : 'shared';
}
export function isSharedPoolAccount(account: { poolType?: string | null }) {
  return poolTypeOf(account) === 'shared';
}

export const poolProxy = z
  .object({
    url: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const u = new URL(value);
          return (
            ['http:', 'https:', 'socks5:'].includes(u.protocol) &&
            !!u.hostname &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash &&
            (u.pathname === '/' || (u.protocol === 'socks5:' && u.pathname === '')) &&
            (u.protocol !== 'socks5:' ||
              (!!u.port && Number(u.port) > 0 && Number(u.port) <= 65535))
          );
        } catch {
          return false;
        }
      }, 'INVALID_PROXY_URL'),
    username: z
      .string()
      .max(512)
      .regex(/^[^\r\n:]*$/)
      .optional(),
    password: z
      .string()
      .max(1024)
      .regex(/^[^\r\n]*$/)
      .optional(),
    lastKnownIp: z.string().max(64).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !/^socks5:/i.test(value.url) ||
      (new TextEncoder().encode(value.username ?? '').length <= 255 &&
        new TextEncoder().encode(value.password ?? '').length <= 255),
    'INVALID_SOCKS_CREDENTIAL',
  );
export type PoolProxy = z.infer<typeof poolProxy>;
export const poolCookie = z
  .object({
    name: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
    value: z
      .string()
      .max(16384)
      // eslint-disable-next-line no-control-regex
      .regex(/^[^\x00-\x20\x7f;]*$/),
    domain: z.string().default('.tiktok.com'),
    path: z.string().startsWith('/').max(1024).default('/'),
    expires: z.number().finite().default(-1),
    secure: z.boolean().default(true),
    httpOnly: z.boolean().default(false),
  })
  .strip();
export type PoolCookie = z.infer<typeof poolCookie>;
export const graphqlCapture = z
  .object({
    url: z.string().url().max(2048),
    name: z.string().min(1).max(200),
    docId: z.string().max(40).nullable(),
    requestBody: z.string().max(65536).nullable(),
    requestHeaders: z
      .record(z.string().max(100), z.string().max(8192))
      .refine((value) => Object.keys(value).length <= 40),
    method: z.enum(['GET', 'POST']),
  })
  .strict();
export type GraphqlCapture = z.infer<typeof graphqlCapture>;
export const poolCredential = z
  .object({
    browserEnvironment: browserEnvironment.optional(),
    pageJSState: pageJSState.optional(),
    graphqlCaptures: z
      .record(z.string().max(80), graphqlCapture)
      .refine((value) => Object.keys(value).length <= 20)
      .optional(),
    requestCounter: z.number().int().nonnegative().max(100000).optional(),
    proxy: poolProxy.nullable().optional(),
    cookies: z.array(poolCookie).min(1).max(300),
    userAgent: z
      .string()
      .max(1024)
      .regex(/^[^\r\n]*$/)
      .optional(),
  })
  .strict();
export type PoolCredential = z.infer<typeof poolCredential>;
const text = z.string().trim().min(1).max(200);
export const poolIdentity = z
  .object({
    userId: text.nullable(),
    username: text.nullable(),
    verifiedAt: z.string().datetime().nullable(),
    displayName: text.nullable().optional(),
  })
  .strict();
export const poolIdentityCheck = z
  .object({
    status: z.enum(['verified', 'unknown']),
    checkedAt: z.string().datetime(),
    endpoint: z.string().min(1).max(200),
    transport: z.literal('proxy-http'),
    reason: z
      .string()
      .regex(/^[A-Z_]+$/)
      .nullable(),
    httpStatus: z.number().int().min(0).max(599).nullable(),
    businessStatus: z
      .string()
      .max(30)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .nullable(),
    responseBytes: z.number().int().nonnegative(),
  })
  .strict();
export const poolImport = z
  .object({
    id: z.string().uuid(),
    platform: z.enum(accountPoolPlatforms),
    label: text,
    account: z.string().trim().max(200).default(''),
    credential: poolCredential,
    source: z
      .object({
        kind: z.enum(['manual', 'browser']),
        profileId: z.string().max(200).optional(),
        workspaceId: z.number().int().positive().optional(),
        profileName: z.string().max(200).optional(),
        windowNumber: z.string().max(40).optional(),
        windowSortNum: z.number().int().nonnegative().optional(),
      })
      .strict(),
    identity: poolIdentity,
    identityCheck: poolIdentityCheck.optional(),
    poolType: poolTypeSchema.default('shared'),
  })
  .strict();
export type PoolImport = z.infer<typeof poolImport>;
export type PoolSummary = Omit<PoolImport, 'credential'> & {
  enabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  cookieCount: number;
  expiresAt: number | null;
  proxyConfigured?: boolean;
  poolType?: PoolType;
  browserEnvironment?: z.infer<typeof browserEnvironmentSummary>;
};
export const poolCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('validate-all') }).strict(),
  z
    .object({
      action: z.literal('validation-start'),
      retryJobId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('validation-status'),
      jobId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('set-js-state'),
      id: z.string().uuid(),
      revision: z.number().int().positive(),
      state: pageJSState,
      environment: browserEnvironment,
    })
    .strict(),
  z
    .object({
      action: z.literal('set-proxy'),
      id: z.string().uuid(),
      revision: z.number().int().positive(),
      proxy: poolProxy.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('import'), entry: poolImport }).strict(),
  z
    .object({
      action: z.literal('reimport'),
      revision: z.number().int().positive(),
      entry: poolImport,
    })
    .strict(),
  z.object({ action: z.literal('credentials'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('update'),
      id: z.string().uuid(),
      revision: z.number().int().positive(),
      label: text.optional(),
      account: z.string().trim().max(200).optional(),
      enabled: z.boolean().optional(),
      poolType: poolTypeSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('set-pool-type'),
      poolType: poolTypeSchema,
      accounts: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              revision: z.number().int().positive(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict()
    .refine(
      (value) =>
        new Set(value.accounts.map((account) => account.id)).size === value.accounts.length,
      'DUPLICATE_ACCOUNT',
    ),
  z
    .object({
      action: z.literal('delete'),
      id: z.string().uuid(),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export const poolExtract = z
  .object({
    id: z.string().uuid(),
    profileId: text,
    workspaceId: z.number().int().positive(),
    label: text.optional(),
  })
  .strict();

export const poolBrowserExtract = poolExtract
  .extend({
    platform: z.enum(accountPoolPlatforms),
    account: z.string().trim().max(200).default(''),
    poolType: poolTypeSchema.default('shared'),
    replace: z.boolean().optional(),
    revision: z.number().int().positive().optional(),
  })
  .refine((value) => !value.replace || value.revision !== undefined, 'REVISION_REQUIRED');
// Explicit allowlist for Renderer responses. Never return the generic pool response.
export const poolSaveReceipt = z
  .object({
    id: z.string().uuid(),
    platform: z.enum(accountPoolPlatforms),
    label: text,
    account: z.string().max(200),
    cookieCount: z.number().int().positive(),
    proxyConfigured: z.literal(true),
    createdAt: z.string().datetime(),
    identity: poolIdentity.optional(),
    identityCheck: poolIdentityCheck.optional(),
    browserEnvironment: browserEnvironmentSummary.optional(),
  })
  .strip();
export type PoolSaveReceipt = z.infer<typeof poolSaveReceipt>;

export const poolValidationResult = z
  .object({
    id: z.string().uuid(),
    label: text,
    status: z.enum(['valid', 'deleted', 'retained']),
    reason: z
      .string()
      .regex(/^[A-Z_]+$/)
      .nullable(),
  })
  .strict();
export type PoolValidationResult = z.infer<typeof poolValidationResult>;
export const poolValidationReceipt = z
  .object({
    checked: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    retained: z.number().int().nonnegative(),
    results: z.array(poolValidationResult),
  })
  .strict();
export type PoolValidationReceipt = z.infer<typeof poolValidationReceipt>;
export const poolValidationJob = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['running', 'completed', 'failed']),
    total: z.number().int().nonnegative(),
    checked: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    retained: z.number().int().nonnegative(),
    results: z.array(poolValidationResult),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    error: z
      .string()
      .regex(/^[A-Z_]+$/)
      .nullable(),
  })
  .strict();
export type PoolValidationJob = z.infer<typeof poolValidationJob>;

export const poolBrowserBatchExtract = z
  .object({
    platform: z.enum(accountPoolPlatforms),
    poolType: poolTypeSchema.default('shared'),
    concurrency: z.number().int().min(1).max(100),
    replace: z.boolean().optional(),
    profiles: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            profileId: text,
            workspaceId: z.number().int().positive(),
            revision: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.profiles.map((profile) => `${profile.workspaceId}/${profile.profileId}`))
        .size === value.profiles.length,
    'DUPLICATE_PROFILE',
  )
  .refine(
    (value) => !value.replace || value.profiles.every((profile) => profile.revision !== undefined),
    'REVISION_REQUIRED',
  );
export const poolBatchSaveItem = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('saved'),
      workspaceId: z.number().int().positive(),
      profileId: text,
      profileName: text,
      receipt: poolSaveReceipt,
    })
    .strict(),
  z
    .object({
      status: z.literal('failed'),
      workspaceId: z.number().int().positive(),
      profileId: text,
      profileName: text,
      error: z.string().regex(/^[A-Z_]+$/),
    })
    .strict(),
]);
export const poolBatchSaveReceipt = z
  .object({
    total: z.number().int().positive(),
    saved: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    results: z.array(poolBatchSaveItem),
  })
  .strict();
export type PoolBatchSaveReceipt = z.infer<typeof poolBatchSaveReceipt>;

export function platformHosts(platform: string): string[] {
  return platformCookieHosts[platform as keyof typeof platformCookieHosts] ?? [];
}

function cookieDomain(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const domain = (item as { domain?: unknown }).domain;
  return typeof domain === 'string' ? domain : undefined;
}

export function normalizePlatformCookies(
  platform: string,
  input: unknown,
  now = Date.now() / 1000,
): PoolCookie[] {
  const roots = platformHosts(platform);
  if (!roots.length) throw new Error('PLATFORM_EXTRACTION_UNSUPPORTED');
  const onPlatform = (domain: string) => {
    const host = domain.replace(/^\./, '').toLowerCase();
    return roots.some((root) => host === root || host.endsWith(`.${root}`));
  };
  const fallback = `.${roots[0]}`;
  const items =
    typeof input === 'string'
      ? input
          .split(';')
          .filter((s) => s.trim())
          .map((part) => {
            const equal = part.indexOf('=');
            if (equal < 1) throw new Error('INVALID_COOKIE');
            return {
              name: part.slice(0, equal).trim(),
              value: part.slice(equal + 1).trim(),
              domain: fallback,
            };
          })
      : input;
  if (!Array.isArray(items)) throw new Error('INVALID_COOKIE');
  const accepted: PoolCookie[] = [];
  for (const item of items) {
    // A foreign cookie with an empty name or illegal value must not reject the platform jar.
    const domain = cookieDomain(item);
    if (domain !== undefined && !onPlatform(domain)) continue;
    const one = poolCookie.safeParse(item);
    if (!one.success) throw new Error('INVALID_COOKIE');
    accepted.push(one.data);
  }
  if (accepted.length > 300) throw new Error('INVALID_COOKIE');
  const map = new Map<string, PoolCookie>();
  for (const c of accepted) {
    if (!onPlatform(c.domain)) continue;
    if (c.expires !== -1 && c.expires <= now) continue;
    map.set(`${c.domain}/${c.path}/${c.name}`, c);
  }
  if (!map.size) throw new Error(`NO_${platform.toUpperCase()}_COOKIES`);
  return [...map.values()];
}

export function normalizeTikTokCookies(input: unknown, now = Date.now() / 1000): PoolCookie[] {
  return normalizePlatformCookies('TikTok', input, now);
}

const cookieOrigins = new Set([
  'https://www.tiktok.com',
  'https://www.instagram.com',
  'https://www.facebook.com',
  'https://www.youtube.com',
  'https://x.com',
]);

export function cookieHeader(
  cookies: PoolCookie[],
  target: string,
  now = Date.now() / 1000,
): string {
  const url = new URL(target);
  if (!cookieOrigins.has(url.origin)) throw new Error('COOKIE_TARGET_REJECTED');
  return cookies
    .filter((c) => {
      const host = c.domain.replace(/^\./, '').toLowerCase();
      const domainMatches = c.domain.startsWith('.')
        ? url.hostname === host || url.hostname.endsWith(`.${host}`)
        : url.hostname === host;
      const pathMatches =
        url.pathname === c.path ||
        (url.pathname.startsWith(c.path) &&
          (c.path.endsWith('/') || url.pathname[c.path.length] === '/'));
      return domainMatches && pathMatches && (c.expires === -1 || c.expires > now);
    })
    .sort((a, b) => b.path.length - a.path.length)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}
