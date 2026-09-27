import { Module } from '@nestjs/common';
import { LegacyApiService } from './legacy-api.service.js';
import { openStore } from '@datalom/storage-node/runtime';
import { Store } from '@datalom/storage-node/store';

@Module({ providers: [{ provide: Store, useFactory: openStore }, LegacyApiService] })
export class LegacyApiModule {}
