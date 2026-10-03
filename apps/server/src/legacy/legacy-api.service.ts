import { Inject, Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Store } from '@datalom/shared/storage/store';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

/** Temporary bridge for existing Fastify routes while they migrate to feature modules. */
@Injectable()
export class LegacyApiService implements OnModuleInit, OnApplicationShutdown {
  private usageCleanupTimer?: ReturnType<typeof setInterval>;
  private usageCleanup?: Promise<void>;
  private maintainUsage() {
    if (this.usageCleanup) return this.usageCleanup;
    this.usageCleanup = (async () => {
      // Bound each maintenance run; concurrent instances skip each other's rows.
      for (let batch = 0; batch < 10; batch++) {
        if ((await this.store.wallets.pruneUsage()) < 1000) break;
      }
    })()
      .catch(() => {
        process.stderr.write('DATALOM_USAGE_RETENTION_FAILED\n');
      })
      .finally(() => {
        this.usageCleanup = undefined;
      });
    return this.usageCleanup;
  }

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(Store) private readonly store: Store,
  ) {}

  async onModuleInit() {
    await this.maintainUsage();
    this.usageCleanupTimer = setInterval(
      () => {
        void this.maintainUsage();
      },
      60 * 60 * 1000,
    );
    this.usageCleanupTimer.unref();
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    fastify.addHook('onResponse', async (req, reply) => {
      this.store.observations.record(
        `${req.method} ${req.routeOptions.url ?? 'unmatched'}`,
        String(reply.statusCode),
        reply.elapsedTime,
      );
    });
    await fastify.register(async (instance) => {
      await buildApp(this.store, {}, instance);
    });
  }

  async onApplicationShutdown() {
    if (this.usageCleanupTimer) clearInterval(this.usageCleanupTimer);
    await this.usageCleanup;
    await this.store.close();
  }
}
