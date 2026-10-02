import { Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import * as protocol from '@datalom/platform-youtube/api/youtube-native';
import { cookieJar } from '@datalom/network-node/cookies';
import { openTransport } from '@datalom/network-node/session-transport';
import { PublicApiService, publicError } from '../../public-api/public-api.service.js';
export function findNode(value: unknown, predicate: (node: any) => boolean): any {
  if (!value || typeof value !== 'object') return undefined;
  if (predicate(value)) return value;
  for (const child of Object.values(value)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
}
function continuation(value: unknown): string | undefined {
  return findNode(
    value,
    (n) =>
      typeof n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ===
      'string',
  )?.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
}
@Injectable()
export class YoutubeService {
  private open = openTransport;
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(PublicApiService) private readonly api: PublicApiService,
  ) {}
  request(
    operation: string,
    query: Record<string, unknown>,
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const auth = this.api.authenticate(req, reply);
    const search = operation === 'search.videos',
      paginated = operation !== 'video.detail';
    const name = search ? 'keyword' : 'video_id';
    if (
      Object.keys(query).some((k) => k !== name && !(paginated && k === 'cursor')) ||
      typeof query[name] !== 'string' ||
      !query[name].trim() ||
      query[name].length > 500 ||
      (!search && !/^[A-Za-z0-9_-]{11}$/.test(query[name])) ||
      (query.cursor !== undefined &&
        (typeof query.cursor !== 'string' || query.cursor.length > 24000))
    )
      publicError(400, 'INVALID_INPUT', '需要有效 keyword 或 video_id', auth.id);
    const subject = query[name] as string;
    return this.api.executeManaged({
      auth,
      reply,
      platform: 'youtube',
      operation,
      parameters: { [name]: subject },
      cursor: query.cursor as string | undefined,
      paginated,
      acquire: (pinned) => {
        for (const account of this.store.listAccounts()) {
          if (account.platform.toLowerCase() !== 'youtube' || (pinned && pinned !== account.id))
            continue;
          const lease = this.store.lease(account.id);
          if (!lease) continue;
          return {
            account: account.id,
            renew: () => this.store.renew(account.id, lease),
            release: (cooldown) => {
              try {
                if (cooldown > 3000) this.store.coolDownAccount(account.id, '公开 API 上游异常');
                this.store.scheduleNext(account.id, lease, cooldown);
              } finally {
                this.store.release(account.id, lease);
              }
            },
            run: async (signal, state) => {
              const session = this.store.getSecret(account.id);
              const trace = (stage: string, outcome: string, payload: unknown) => {
                this.store.diagnostics.event(
                  { requestId: auth.id, accountId: account.id },
                  stage,
                  outcome,
                  payload,
                );
              };
              const connection = await this.open(session, this.store.dir, trace);
              const url = search
                ? `https://www.youtube.com/results?search_query=${encodeURIComponent(subject)}`
                : `https://www.youtube.com/watch?v=${subject}`;
              const headers = {
                'user-agent': session.observed.userAgent,
                'accept-language': session.observed.language,
              };
              try {
                const request = async (
                  target: string,
                  method: 'GET' | 'POST',
                  extra: Record<string, string> = {},
                  body?: string,
                ) => {
                  if (!protocol.youtubeUrlAllowed(new URL(target), method))
                    throw new DatalomError('INVALID_INPUT', '不允许的 YouTube 路径');
                  const wait = this.store.reserveRate(account.id, lease, operation, 3000);
                  if (wait)
                    await new Promise<void>((resolve, reject) => {
                      const done = () => {
                        clearTimeout(timer);
                        signal.removeEventListener('abort', abort);
                      };
                      const abort = () => {
                        done();
                        reject(signal.reason);
                      };
                      const timer = setTimeout(() => {
                        done();
                        resolve();
                      }, wait);
                      signal.addEventListener('abort', abort, { once: true });
                      if (signal.aborted) abort();
                    });
                  const response = await connection.transport.request(target, {
                    method,
                    headers: { ...headers, ...extra },
                    body,
                    signal,
                  });
                  connection.save();
                  this.store.saveSecret(account.id, account.version, session, lease);
                  trace('youtube-public-http', 'received', {
                    status: response.status,
                    body: response.body,
                  });
                  if (response.status !== 200)
                    throw new DatalomError(
                      response.status === 429 ? 'RATE_LIMIT' : 'NETWORK',
                      'YouTube HTTP 失败',
                    );
                  return response.body;
                };
                const document = protocol.parseYouTubeDocument(await request(url, 'GET'));
                let data = document.data;
                if (operation === 'video.comments' || state) {
                  const section = findNode(
                    data,
                    (n) => n.itemSectionRenderer?.sectionIdentifier === 'comment-item-section',
                  )?.itemSectionRenderer;
                  const token = state ?? continuation(section);
                  if (!token) throw new DatalomError('RESEARCH_REQUIRED', '评论入口不可用');
                  const cookies =
                    cookieJar(session)
                      .serializeSync()
                      ?.cookies.map((c) => ({
                        name: c.key!,
                        value: c.value!,
                        domain: String(c.domain),
                        path: String(c.path ?? '/'),
                        secure: !!c.secure,
                        httpOnly: !!c.httpOnly,
                        expires:
                          typeof c.expires === 'string' && c.expires !== 'Infinity'
                            ? Date.parse(c.expires) / 1000
                            : -1,
                      })) ?? [];
                  const signed = protocol.innertubeRequest(
                    document.config,
                    new protocol.YouTubeCookieJar(cookies),
                    url,
                    { continuation: token },
                    headers,
                  );
                  data = JSON.parse(
                    await request(
                      `https://www.youtube.com/youtubei/v1/${search ? 'search' : 'next'}?prettyPrint=false`,
                      'POST',
                      signed.headers,
                      signed.body,
                    ),
                  );
                  if (data.error) throw new DatalomError('RESEARCH_REQUIRED', 'YouTube 业务失败');
                }
                const next = paginated ? continuation(data) : undefined;
                if (next && next === state) throw new DatalomError('SCHEMA_CHANGED', '游标未推进');
                return { raw: data, cursor: next, hasMore: next ? true : undefined };
              } finally {
                await connection.close();
              }
            },
          };
        }
        return undefined;
      },
    });
  }
}
