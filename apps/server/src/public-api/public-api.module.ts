import { CapturedPlatformService } from './captured-platform.service.js';
import { DocsTryController } from './docs-try.controller.js';
import { PublicApiController } from './public-api.controller.js';
import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../legacy/legacy-api.module.js';
import { PublicApiService } from './public-api.service.js';
@Module({
  imports: [LegacyApiModule],
  controllers: [PublicApiController, DocsTryController],
  providers: [PublicApiService, CapturedPlatformService],
  exports: [PublicApiService, CapturedPlatformService],
})
export class PublicApiModule {}
