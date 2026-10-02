import { YoutubeModule } from './platforms/youtube/youtube.module.js';
import { DoubaoModule } from './platforms/doubao/doubao.module.js';
import { XModule } from './platforms/x/x.module.js';
import { FacebookModule } from './platforms/facebook/facebook.module.js';
import { InstagramModule } from './platforms/instagram/instagram.module.js';
import { TikTokModule } from './platforms/tiktok/tiktok.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LegacyApiModule } from './legacy/legacy-api.module.js';

@Module({
  imports: [
    LegacyApiModule,
    TikTokModule,
    InstagramModule,
    FacebookModule,
    XModule,
    DoubaoModule,
    YoutubeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
