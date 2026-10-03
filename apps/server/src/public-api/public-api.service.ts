import { Inject, Injectable, HttpException } from '@nestjs/common';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '@datalom/shared/storage/store';
import {
  DatalomError,
  type ExecutionContext,
  type RequestTemplate,
} from '@datalom/shared/runtime/contracts';
import { openTransport } from '@datalom/network-node/session-transport';
import type { FastifyRequest, FastifyReply } from 'fastify';

export function publicError(
  status: number,
  code: string,
  message: string,
  requestId: string,
): never {
  throw new HttpException({ request_id: requestId, error: { code, message } }, status);
}
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !/^(cookie|cookies|set-cookie|authorization|ms_?token|access_token|refresh_token|session_?id|session_key|csrf_token|x-bogus|x-gnarly|x-dynosaur)$/i.test(
            key,
          ),
      )
      .map(([key, child]) => [key, sanitize(child)]),
  );
}
interface Page {
  raw: Record<string, unknown>;
  cursor?: string;
  hasMore?: boolean;
}
interface Continuation {
  account: string;
  operation: string;
  subject: string;
  cursor: string;
  expires: number;
}
@Injectable()
export class PublicApiService {
  constructor(@Inject(Store) private readonly store: Store) {}

  async authenticate(req: FastifyRequest, reply: FastifyReply) {
    const id = randomUUID();
    reply
      .header('X-Request-Id', id)
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff');
    const configured = process.env.DATALOM_PUBLIC_API_KEY;
    if (!configured || configured.length < 32)
      publicError(503, 'API_NOT_CONFIGURED', '公开 API 尚未配置', id);
    const supplied = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '';
    const hash = (v: string) => createHash('sha256').update(v).digest();
    if (!timingSafeEqual(hash(supplied), hash(configured)))
      publicError(401, 'AUTH_REQUIRED', 'API Key 无效', id);
    const bucket = Math.floor(Date.now() / 60_000);
    const limit = Number(process.env.DATALOM_PUBLIC_API_RPM ?? 60);
    if (!Number.isSafeInteger(limit) || limit < 1)
      publicError(503, 'API_NOT_CONFIGURED', 'API 配额配置无效', id);
    const allowed = await this.store.consumeRate(
      `public-api-rate:${hash(configured).toString('hex')}`,
      bucket,
      limit,
    );
    if (!allowed) {
      reply.header('Retry-After', Math.ceil((60_000 - (Date.now() % 60_000)) / 1000));
      publicError(429, 'QUOTA_EXCEEDED', '请求频率超过配额', id);
    }
    return { id, key: hash(configured) };
  }

  private open = openTransport;

  private encode(value: Continuation, key: Buffer) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  private decode(token: string, key: Buffer): Continuation {
    const bytes = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
    );
  }

  /** Shared lifecycle for platforms whose existing sessions use dedicated lease tables. */
  async executeManaged(options: {
    auth: { id: string; key: Buffer };
    reply: FastifyReply;
    platform: string;
    operation: string;
    parameters: Record<string, unknown>;
    cursor?: string;
    paginated: boolean;
    acquire: (
      account?: string,
      state?: string,
    ) => Promise<
      | {
          account: string;
          renew: () => Promise<boolean>;
          release: (cooldown: number) => Promise<void>;
          run: (signal: AbortSignal, state?: string) => Promise<Page>;
        }
      | undefined
    >;
  }) {
    const { auth } = options;
    const operation = `${options.platform}:${options.operation}`;
    const subject = createHash('sha256')
      .update(JSON.stringify(Object.entries(options.parameters).sort()))
      .digest('hex');
    let previous: Continuation | undefined;
    if (options.cursor) {
      try {
        previous = this.decode(options.cursor, auth.key);
        if (
          previous.operation !== operation ||
          previous.subject !== subject ||
          !Number.isFinite(previous.expires) ||
          previous.expires < Date.now() ||
          typeof previous.account !== 'string' ||
          typeof previous.cursor !== 'string'
        )
          throw Error();
      } catch {
        publicError(400, 'INVALID_CURSOR', '游标无效、过期或不属于当前查询', auth.id);
      }
    }
    let held: Awaited<ReturnType<typeof options.acquire>>;
    try {
      held = await options.acquire(previous?.account, previous?.cursor);
    } catch (error) {
      if (error instanceof DatalomError && error.code === 'INVALID_INPUT')
        publicError(400, 'INVALID_INPUT', '业务参数无效', auth.id);
      publicError(503, 'NO_AVAILABLE_ACCOUNT', '暂无具备此能力的可用会话', auth.id);
    }
    if (!held)
      publicError(503, 'NO_AVAILABLE_ACCOUNT', '暂无具备此能力的可用会话或目标模板', auth.id);
    const controller = new AbortController();
    let timedOut = false,
      cooldown = 3000;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    const close = () => {
      if (!options.reply.raw.writableEnded) controller.abort();
    };
    options.reply.raw.once('close', close);
    const heartbeat = setInterval(async () => {
      try {
        if (!(await held!.renew())) controller.abort();
      } catch {
        controller.abort();
      }
    }, 10_000);
    try {
      const result = await held.run(controller.signal, previous?.cursor);
      controller.signal.throwIfAborted();
      return {
        request_id: auth.id,
        data: sanitize(result.raw),
        ...(options.paginated
          ? {
              pagination: {
                has_more: result.hasMore ?? null,
                next_cursor:
                  result.hasMore && result.cursor
                    ? this.encode(
                        {
                          account: held.account,
                          operation,
                          subject,
                          cursor: result.cursor,
                          expires: Date.now() + 30 * 60_000,
                        },
                        auth.key,
                      )
                    : null,
              },
            }
          : {}),
      };
    } catch (error) {
      const code = error instanceof DatalomError ? error.code : 'INTERNAL';
      if (['RATE_LIMIT', 'CHALLENGE', 'LOGIN_REQUIRED'].includes(code)) cooldown = 300000;
      await this.store.diagnostics.event(
        { requestId: auth.id, accountId: held.account },
        'public-api',
        'failed',
        { platform: options.platform, operation, code },
      );
      publicError(
        timedOut ? 504 : code === 'CONFLICT' ? 503 : 502,
        timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        '平台请求失败，请使用 request_id 联系管理员',
        auth.id,
      );
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      options.reply.raw.removeListener('close', close);
      await held.release(cooldown);
    }
  }

  async execute(options: {
    auth: { id: string; key: Buffer };
    req: FastifyRequest;
    reply: FastifyReply;
    platform: string;
    operation: string;
    parameters: Record<string, string>;
    cursor?: string;
    paginated: boolean;
    template: (accountId: string) => Promise<RequestTemplate | undefined>;
    run: (template: RequestTemplate, context: ExecutionContext, cursor: string) => Promise<Page>;
  }) {
    const { auth, operation } = options;
    const subject = createHash('sha256')
      .update(JSON.stringify(Object.entries(options.parameters).sort()))
      .digest('hex');
    let continuation: Continuation | undefined;
    if (options.cursor) {
      try {
        continuation = this.decode(options.cursor, auth.key);
        if (
          continuation.operation !== `${options.platform}:${operation}` ||
          continuation.subject !== subject ||
          !Number.isFinite(continuation.expires) ||
          continuation.expires < Date.now() ||
          typeof continuation.cursor !== 'string'
        )
          throw Error();
      } catch {
        publicError(400, 'INVALID_CURSOR', '游标无效、已过期或不属于当前查询', auth.id);
      }
    }
    let selected:
      | {
          account: Awaited<ReturnType<Store['getAccount']>>;
          lease: string;
          template: RequestTemplate;
        }
      | undefined;
    for (const account of await this.store.listAccounts()) {
      if (
        account.platform !== options.platform ||
        (continuation && account.id !== continuation.account)
      )
        continue;
      if (!['ready', 'cooldown'].includes(account.status))
        continue;
      const template = await options.template(account.id);
      if (!template) continue;
      const lease = await this.store.lease(account.id);
      if (lease) {
        selected = { account, lease, template };
        break;
      }
    }
    if (!selected)
      publicError(503, 'NO_AVAILABLE_ACCOUNT', '暂无具备此能力的可用账号，请稍后重试', auth.id);
    const { account, lease, template } = selected;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    const disconnected = () => {
      if (!options.reply.raw.writableEnded) controller.abort();
    };
    options.reply.raw.once('close', disconnected);
    const heartbeat = setInterval(async () => {
      try {
        if (!(await this.store.renew(account.id, lease))) controller.abort();
      } catch {
        controller.abort();
      }
    }, 10_000);
    let connection: Awaited<ReturnType<typeof openTransport>> | undefined;
    try {
      const session = await this.store.getSecret(account.id);
      const trace: ExecutionContext['trace'] = async (stage, outcome, payload, code) => {
        await this.store.diagnostics.event(
          { requestId: auth.id, accountId: account.id },
          stage,
          outcome,
          payload,
          code,
        );
      };
      connection = await this.open(session, this.store.dir, trace);
      const wait = await this.store.reserveRate(account.id, lease, operation);
      if (wait) await delay(wait, undefined, { signal: controller.signal });
      controller.signal.throwIfAborted();
      const result = await options.run(
        template,
        {
          account,
          session,
          transport: connection.transport,
          signal: controller.signal,
          trace,
          saveSession: async () => {
            connection!.save();
            await this.store.saveSecret(account.id, account.version, session, lease);
          },
          recordEvidence: async (kind, summary, payload) => {
            await this.store.evidence(account.id, kind, summary, { requestId: auth.id, payload });
          },
        },
        continuation?.cursor ?? '0',
      );
      controller.signal.throwIfAborted();
      return {
        request_id: auth.id,
        data: sanitize(result.raw),
        ...(options.paginated
          ? {
              pagination: {
                has_more: result.hasMore ?? null,
                next_cursor:
                  result.hasMore && result.cursor
                    ? this.encode(
                        {
                          account: account.id,
                          operation: `${options.platform}:${operation}`,
                          subject,
                          cursor: result.cursor,
                          expires: Date.now() + 30 * 60_000,
                        },
                        auth.key,
                      )
                    : null,
              },
            }
          : {}),
      };
    } catch (error) {
      const code = error instanceof DatalomError ? error.code : 'INTERNAL';
      await this.store.diagnostics.event(
        { requestId: auth.id, accountId: account.id },
        'public-api',
        'failed',
        { code },
      );
      if (code === 'RATE_LIMIT') await this.store.coolDownAccount(account.id, '公开 API 上游限流');
      if (['LOGIN_REQUIRED', 'CHALLENGE'].includes(code))
        await this.store.status(account.id, 'login_required', '平台会话需要重新验证');
      if (timedOut) publicError(504, 'UPSTREAM_TIMEOUT', '平台请求超时', auth.id);
      publicError(
        code === 'CONFLICT' ? 503 : 502,
        'UPSTREAM_ERROR',
        '平台请求失败，请使用 request_id 联系管理员',
        auth.id,
      );
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      options.reply.raw.removeListener('close', disconnected);
      try {
        await connection?.close();
      } finally {
        try {
          await this.store.scheduleNext(account.id, lease);
        } finally {
          await this.store.release(account.id, lease);
        }
      }
    }
  }
}
