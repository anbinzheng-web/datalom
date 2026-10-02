import { Inject, Injectable } from '@nestjs/common';
import { Store } from '@datalom/shared/storage/store';
import {
  executeNative,
  nativeEndpoints,
  parseNative,
  validateNativeInput,
  type NativeOperation,
} from '@datalom/platform-tiktok/native';
import type { RequestTemplate } from '@datalom/shared/runtime/contracts';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { PublicApiService, publicError } from '../../public-api/public-api.service.js';

import { endpoints, type Endpoint } from './tiktok.endpoints.js';

@Injectable()
export class TikTokService {
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(PublicApiService) private readonly api: PublicApiService,
  ) {}

  private template(accountId: string, operation: NativeOperation): RequestTemplate | undefined {
    const stored = this.store.getSecret(accountId).research?.requestTemplates?.[operation];
    const valid = (template: RequestTemplate) => {
      try {
        const u = new URL(template.url);
        return (
          u.origin === 'https://www.tiktok.com' &&
          u.pathname === nativeEndpoints[operation].path &&
          !u.username &&
          !u.password &&
          !u.hash
        );
      } catch {
        return false;
      }
    };
    if (stored && valid(stored)) return stored;
    // Only encrypted successful captures belonging to this account can become templates.
    const rows = this.store.sql
      .prepare(
        "SELECT id, createdAt FROM diagnostic_events WHERE accountId=? AND stage='tiktok-native-http' AND outcome='received' ORDER BY createdAt DESC LIMIT 200",
      )
      .all(accountId) as { id: string; createdAt: number }[];
    for (const row of rows) {
      const capture = this.store.diagnostics.rawEvent(row.id) as any;
      if (capture?.method !== 'GET' || capture.status !== 200 || typeof capture.body !== 'string')
        continue;
      const template = { url: capture.url, headers: capture.headers, capturedAt: row.createdAt };
      if (!valid(template)) continue;
      try {
        parseNative(
          { operation, parameters: Object.fromEntries(new URL(capture.url).searchParams) },
          capture.status,
          capture.body,
        );
        return template;
      } catch {
        /* A failed business response is not an eligible template. */
      }
    }
    return undefined;
  }

  async request(
    endpoint: Endpoint,
    query: Record<string, unknown>,
    req: FastifyRequest,
    reply: FastifyReply,
  ) {
    const auth = this.api.authenticate(req, reply);
    const def = endpoints[endpoint];
    const fields: Record<string, string> = def.fields;
    const parameters: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (
        !(Object.hasOwn(fields, key) || (def.paginated && key === 'cursor')) ||
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > (key === 'cursor' ? 4096 : 1024)
      )
        publicError(400, 'INVALID_INPUT', `参数无效：${key}`, auth.id);
      if (key !== 'cursor') parameters[fields[key]] = value;
    }
    for (const key of def.required)
      if (!query[key]) publicError(400, 'INVALID_INPUT', `缺少参数：${key}`, auth.id);
    if ('count' in fields) parameters.count ??= '20';
    if (def.paginated) parameters.cursor = '0';
    if (def.operation === 'search.videos') {
      parameters.cursor = '0';
      parameters.offset = '0';
    }
    try {
      validateNativeInput(
        { operation: def.operation, parameters },
        {
          url: `https://www.tiktok.com${nativeEndpoints[def.operation].path}`,
          headers: {},
          capturedAt: 0,
        },
      );
    } catch {
      publicError(
        400,
        'INVALID_INPUT',
        '业务参数无效，请检查必填字段、ID 和 count（1–50）',
        auth.id,
      );
    }
    return this.api.execute({
      auth,
      req,
      reply,
      platform: 'tiktok',
      operation: def.operation,
      parameters,
      cursor: query.cursor as string | undefined,
      paginated: def.paginated,
      template: (accountId) => this.template(accountId, def.operation),
      run: (template, context, cursor) =>
        executeNative(
          {
            operation: def.operation,
            parameters: { ...parameters, ...(def.paginated ? { cursor } : {}) },
          },
          template,
          context,
        ),
    });
  }
}
