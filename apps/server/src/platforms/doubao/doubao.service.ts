import { Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { DoubaoSessions } from '@datalom/platform-doubao/session';
import { DoubaoNative, loadDoubaoSDK } from '@datalom/platform-doubao/native';
import { PublicApiService, publicError } from '../../public-api/public-api.service.js';
@Injectable()
export class DoubaoService {
  private readonly sessions: DoubaoSessions;
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(PublicApiService) private readonly api: PublicApiService,
  ) {
    this.sessions = new DoubaoSessions(store);
  }
  async request(body: unknown, req: FastifyRequest, reply: FastifyReply) {
    const auth = await this.api.authenticate(req, reply);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'prompt') ||
      !('prompt' in body) ||
      typeof body.prompt !== 'string' ||
      !body.prompt.trim() ||
      body.prompt.length > 16000
    )
      publicError(400, 'INVALID_INPUT', '需要长度为 1–16000 的 prompt', auth.id);
    const prompt = body.prompt;
    return this.api.executeManaged({
      auth,
      reply,
      platform: 'doubao',
      operation: 'chat.completion',
      parameters: {},
      paginated: false,
      acquire: async () => {
        const ids = await this.sessions.available();
        for (const id of ids) {
          let held;
          try {
            held = await this.sessions.acquire(id);
          } catch {
            continue;
          }
          const { session, lease } = held;
          return {
            account: id,
            renew: () => this.sessions.renew(id, lease),
            release: (cooldown) => this.sessions.release(id, lease, cooldown),
            run: async (signal) => {
              const client = new DoubaoNative(
                this.store,
                session,
                await loadDoubaoSDK(this.store),
                async () => await this.sessions.save(session, lease),
              );
              // Every public request starts a new conversation; no cross-caller history reuse.
              const result = await client.chat(prompt, { newConversation: true, signal });
              if (!result.report.success)
                throw new DatalomError('RESEARCH_REQUIRED', '豆包返回业务失败');
              return { raw: { answer: result.answer } };
            },
          };
        }
        return undefined;
      },
    });
  }
}
