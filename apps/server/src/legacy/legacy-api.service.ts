import { Inject, Injectable, type OnModuleInit, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Store } from '@datalom/storage-node/store';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

/** Temporary bridge for existing Fastify routes while they migrate to feature modules. */
@Injectable()
export class LegacyApiService implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(Store) private readonly store: Store,
  ) {}

  async onModuleInit() {
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    await fastify.register(async (instance) => {
      await buildApp(this.store, {}, instance);
    });
  }

  onApplicationShutdown() {
    this.store.close();
  }
}
