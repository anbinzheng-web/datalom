import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { TikTokController } from './tiktok.controller.js';
import { TikTokService } from './tiktok.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [TikTokController],
  providers: [TikTokService],
})
export class TikTokModule {}
