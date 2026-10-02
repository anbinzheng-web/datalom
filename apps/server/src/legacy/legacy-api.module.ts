import { Module } from '@nestjs/common';
import { LegacyApiService } from './legacy-api.service.js';
import { openStore } from '@datalom/shared/storage/runtime';
import { Store } from '@datalom/shared/storage/store';

@Module({
  providers: [{ provide: Store, useFactory: openStore }, LegacyApiService],
  exports: [Store],
})
export class LegacyApiModule {}
