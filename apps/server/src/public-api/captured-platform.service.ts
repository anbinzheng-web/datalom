import { Inject, Injectable } from '@nestjs/common';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { startRoute } from '@datalom/network-node/route';
import type { Trace } from '@datalom/shared/runtime/diagnostics';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { PublicApiService, publicError } from './public-api.service.js';
import { parseParameters, type EndpointDefinition } from './platform-endpoint.js';

// Platform implementations retain their own request validation and session ownership.
export interface CapturedPlatform {
  platform: 'instagram' | 'facebook' | 'x';
  sessions: {
    available(): Promise<string[]>;
    acquire(id: string): Promise<{ session: any; lease: string; version: number }>;
    save(session: any, version: number, lease: string): Promise<void>;
    renew(id: string, lease: string): Promise<boolean>;
    release(id: string, lease: string, cooldown: number): Promise<void>;
  };
  build(operation: any, capture: any, updates: Record<string, unknown>, counter: number): any;
  validate(operation: any, variables: any, status: number, body: string): any;
  transport: new (
    proxy: string,
    session: any,
    trace: Trace,
  ) => { request(request: any, signal: AbortSignal): Promise<{ status: number; body: string }> };
}
@Injectable()
export class CapturedPlatformService {
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(PublicApiService) private readonly api: PublicApiService,
  ) {}
  private route = startRoute;

  async request(
    platform: CapturedPlatform,
    def: EndpointDefinition,
    query: Record<string, unknown>,
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const auth = await this.api.authenticate(req, reply);
    const values = parseParameters(def, query, auth.id);
    if (platform.platform === 'x') {
      if (
        (values.screen_name !== undefined && !/^\w{1,15}$/.test(String(values.screen_name))) ||
        ['userId', 'tweetId', 'focalTweetId'].some(
          (k) => values[k] !== undefined && !/^\d{1,25}$/.test(String(values[k])),
        ) ||
        (values.rankingMode !== undefined &&
          !['Relevance', 'Recency', 'Likes'].includes(String(values.rankingMode))) ||
        (values.product !== undefined &&
          !['Top', 'Latest', 'People', 'Media'].includes(String(values.product)))
      )
        publicError(400, 'INVALID_INPUT', 'X 查询参数无效', auth.id);
    }
    if (typeof values.query === 'string' && values.query.length > 100)
      publicError(400, 'INVALID_INPUT', '关键词长度不能超过 100', auth.id);
    return this.api.executeManaged({
      auth,
      reply,
      platform: platform.platform,
      operation: def.operation,
      parameters: values,
      cursor: query.cursor as string | undefined,
      paginated: !!def.cursorKey,
      acquire: async (pinned, state) => {
        const previous = state
          ? (JSON.parse(state) as { capture: string; cursor: string })
          : undefined;
        const profiles = await platform.sessions.available();
        for (const profileId of profiles) {
          if (pinned && pinned !== profileId) continue;
          const rows = (await this.store.diagnostics.findCached(
            `captures:${platform.platform}`,
            (row) =>
              (row.stage === `${platform.platform}-http` && row.outcome === 'received') ||
              (row.stage === `${platform.platform}-template` && row.outcome === 'validated'),
            500,
          )) as { id: string }[];
          for (const row of rows) {
            if (previous && row.id !== previous.capture) continue;
            const capture = (await this.store.diagnostics.rawEvent(row.id)) as any;
            if (capture?.profileId !== profileId || capture.status !== 200) continue;
            let request: any;
            try {
              const sample = platform.build(def.operation, capture, {}, 1);
              platform.validate(def.operation, sample.variables, capture.status, capture.body);
              if (
                (def.selectors ?? []).some(
                  (key) => String(sample.variables[key] ?? '') !== String(values[key] ?? ''),
                )
              )
                continue;
              const updates = Object.fromEntries(
                Object.entries(values).filter(([key]) => !def.selectors?.includes(key)),
              );
              // Clear captured pagination before starting a new public query.
              const fresh = structuredClone(capture);
              if (platform.platform === 'x') {
                const url = new URL(fresh.url),
                  variables = JSON.parse(url.searchParams.get('variables')!);
                delete variables.cursor;
                url.searchParams.set('variables', JSON.stringify(variables));
                fresh.url = url.toString();
              } else if (def.cursorKey) {
                const body = new URLSearchParams(fresh.requestBody),
                  variables = JSON.parse(body.get('variables')!);
                variables[def.cursorKey] = null;
                body.set('variables', JSON.stringify(variables));
                fresh.requestBody = body.toString();
              }
              if (previous && def.cursorKey) updates[def.cursorKey] = previous.cursor;
              if (
                platform.platform === 'facebook' &&
                def.operation === 'marketplace.search' &&
                previous
              ) {
                const body = new URLSearchParams(fresh.requestBody),
                  variables = JSON.parse(body.get('variables')!);
                variables.params.bqf.query = values.query;
                variables.savedSearchQuery = values.query;
                body.set('variables', JSON.stringify(variables));
                fresh.requestBody = body.toString();
                delete updates.query;
              }
              request = { capture: fresh, updates };
              platform.build(def.operation, fresh, updates, 1);
            } catch {
              continue;
            }
            let held: Awaited<ReturnType<CapturedPlatform['sessions']['acquire']>>;
            try {
              held = await platform.sessions.acquire(profileId);
            } catch {
              continue;
            }
            return {
              account: profileId,
              renew: async () => await platform.sessions.renew(profileId, held.lease),
              release: async (cooldown) =>
                await platform.sessions.release(profileId, held.lease, cooldown),
              run: async (signal) => {
                if (!held.session.route?.verifiedAt)
                  throw new DatalomError('PROXY_UNAVAILABLE', '会话线路未验证');
                const trace: Trace = async (stage, outcome, payload, code) => {
                  await this.store.diagnostics.event(
                    { requestId: auth.id, accountId: profileId },
                    stage,
                    outcome,
                    payload,
                    code,
                  );
                };
                const route = await this.route(held.session.route, this.store.dir, trace);
                try {
                  signal.throwIfAborted();
                  const built = platform.build(
                    def.operation,
                    request.capture,
                    request.updates,
                    ++held.session.requestCounter,
                  );
                  const self = held.session.cookies.find(
                    (c: any) =>
                      c.name ===
                      (platform.platform === 'instagram'
                        ? 'ds_user_id'
                        : platform.platform === 'facebook'
                          ? 'c_user'
                          : 'twid'),
                  )?.value;
                  const selfId = self
                    ? decodeURIComponent(self).replace(/^u=/, '').replaceAll('"', '')
                    : undefined;
                  if (
                    selfId &&
                    ['id', 'userId', 'userID', 'user_id', 'sellerId', 'sellerID'].some(
                      (k) => built.variables[k] === selfId,
                    )
                  )
                    throw new DatalomError('INVALID_INPUT', '不公开服务账号自身资料');
                  await platform.sessions.save(held.session, held.version, held.lease);
                  const transport = new platform.transport(route.url, held.session, trace);
                  const response = await transport.request(built, signal);
                  await platform.sessions.save(held.session, held.version, held.lease);
                  const result = platform.validate(
                    def.operation,
                    built.variables,
                    response.status,
                    response.body,
                  );
                  if (result.page?.hasMore && result.page.cursor === previous?.cursor)
                    throw new DatalomError('SCHEMA_CHANGED', '游标未推进');
                  return {
                    raw: result.raw,
                    hasMore: result.page?.hasMore,
                    cursor: result.page?.cursor
                      ? JSON.stringify({ capture: row.id, cursor: result.page.cursor })
                      : undefined,
                  };
                } finally {
                  await route.stop();
                }
              },
            };
          }
        }
        return undefined;
      },
    });
  }
}
