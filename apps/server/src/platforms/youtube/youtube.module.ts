import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { YoutubeController } from './youtube.controller.js';
import { YoutubeService } from './youtube.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [YoutubeController],
  providers: [YoutubeService],
})
export class YoutubeModule {}
