import { readFile } from 'node:fs/promises';
import { RoxyConnector, platformDomains } from './roxy.ts';
import type { Store } from '@datalom/shared/storage/store';

export interface CollectorConfig {
  host: string;
  apikey: string;
  workspaceId: string;
  maxConcurrent: number;
  profiles: { dirId: string; platforms: string[] }[];
}

export async function readCollectorConfig(path: string): Promise<CollectorConfig> {
  let value: CollectorConfig;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('配置文件无法读取或 JSON 格式无效');
  }
  if (!value || typeof value !== 'object') throw new Error('配置必须是对象');
  if (
    typeof value.workspaceId === 'number' &&
    Number.isSafeInteger(value.workspaceId) &&
    value.workspaceId > 0
  )
    value.workspaceId = String(value.workspaceId);
  for (const key of ['host', 'apikey', 'workspaceId'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim())
      throw new Error(`${key} 必须为非空字符串`);
  }
  try {
    const url = new URL(value.host);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error();
  } catch {
    throw new Error('host 必须是本机 HTTP(S) 地址');
  }
  if (!Number.isSafeInteger(value.maxConcurrent) || value.maxConcurrent < 1)
    throw new Error('maxConcurrent 必须为正整数');
  if (!Array.isArray(value.profiles) || !value.profiles.length)
    throw new Error('profiles 不能为空');
  const ids = new Set<string>();
  for (const [index, p] of value.profiles.entries()) {
    if (!p || typeof p.dirId !== 'string' || !p.dirId.trim() || ids.has(p.dirId))
      throw new Error(`profiles[${index}].dirId 无效或重复`);
    ids.add(p.dirId);
    if (
      !Array.isArray(p.platforms) ||
      !p.platforms.length ||
      p.platforms.some(
        (name) => typeof name !== 'string' || !Object.hasOwn(platformDomains, name),
      ) ||
      new Set(p.platforms).size !== p.platforms.length
    )
      throw new Error(`profiles[${index}].platforms 无效、重复或尚不支持`);
  }
  return value;
}

function sessionFailureText(reason: string) {
  const text: Record<string, string> = {
    checkpoint_required: 'Instagram 要求完成账号验证',
    http_or_content: '账号接口未确认身份',
    request_failed: '账号接口请求失败',
    proxy_required: '缺少代理，无法确认身份',
    identity_missing: '账号接口未返回身份',
    unsupported: '该平台尚未接入身份识别',
    api_rejected: '账号接口拒绝了这次身份确认',
  };
  return text[reason] ?? `会话未识别：${reason}`;
}

export async function collectProfiles(
  config: CollectorConfig,
  store: Store,
  report: (result: {
    profile: number;
    platform: string;
    ok: boolean;
    stage?: 'open' | 'extract' | 'store' | 'close';
    sessionStatus?: string;
    sessionReason?: string;
    sessionHttpStatus?: number;
    cookieCount?: number;
    warnings?: string[];
  }) => void,
  connector = new RoxyConnector({
    host: config.host,
    apiKey: config.apikey,
    workspaceId: config.workspaceId,
  }),
) {
  let next = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(config.maxConcurrent, config.profiles.length) }, async () => {
      while (next < config.profiles.length) {
        const index = next++;
        const profile = config.profiles[index];
        try {
          try {
            await connector.open(profile.dirId);
          } catch {
            failed += profile.platforms.length;
            for (const platform of profile.platforms)
              report({ profile: index + 1, platform, ok: false, stage: 'open' });
            continue;
          }
          for (const platform of profile.platforms) {
            let stage: 'extract' | 'store' = 'extract';
            try {
              const result = await connector.extract(profile.dirId, platform, true);
              stage = 'store';
              const account = store.importAccount(
                {
                  platform,
                  workspaceId: config.workspaceId,
                  profileId: profile.dirId,
                  label: result.label,
                  identity: result.identity,
                },
                result.secret,
              );
              const check = result.secret.observed.sessionCheck as
                | { status: string; reason?: string; httpStatus?: number }
                | undefined;
              const sessionStatus = check?.status ?? 'unknown';
              const sessionReason =
                check?.reason && /^[A-Za-z0-9_]{1,80}$/.test(check.reason) ? check.reason : undefined;
              const sessionHttpStatus =
                typeof check?.httpStatus === 'number' && Number.isInteger(check.httpStatus)
                  ? check.httpStatus
                  : undefined;
              if (sessionStatus === 'login_required')
                store.status(account.id, 'login_required', '账号信息接口确认未登录');
              else if (!result.identity && sessionReason && sessionReason !== 'account_identity')
                store.status(
                  account.id,
                  'pending',
                  [
                    sessionFailureText(sessionReason),
                    sessionHttpStatus === undefined ? '' : `HTTP ${sessionHttpStatus}`,
                  ]
                    .filter(Boolean)
                    .join('，'),
                );
              store.evidence(
                account.id,
                'session-check',
                [
                  `浏览器会话：${sessionStatus}`,
                  sessionReason ? `原因 ${sessionReason}` : '',
                  sessionHttpStatus === undefined ? '' : `HTTP ${sessionHttpStatus}`,
                ]
                  .filter(Boolean)
                  .join('，'),
                {
                  status: sessionStatus,
                  ...(sessionReason ? { reason: sessionReason } : {}),
                  ...(sessionHttpStatus === undefined ? {} : { httpStatus: sessionHttpStatus }),
                },
              );
              report({
                profile: index + 1,
                platform,
                ok: true,
                sessionStatus: check?.status ?? 'unknown',
                sessionReason: check?.reason,
                sessionHttpStatus: check?.httpStatus,
                cookieCount: result.secret.cookies.length,
                warnings: result.warnings,
              });
            } catch {
              failed++;
              report({ profile: index + 1, platform, ok: false, stage });
            }
          }
        } finally {
          try {
            await connector.close(profile.dirId);
          } catch {
            failed++;
            report({ profile: index + 1, platform: '*', ok: false, stage: 'close' });
          }
        }
      }
    }),
  );
  return { failed };
}
