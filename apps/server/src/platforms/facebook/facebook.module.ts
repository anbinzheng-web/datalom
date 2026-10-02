import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { FacebookController } from './facebook.controller.js';
import { FacebookService } from './facebook.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [FacebookController],
  providers: [FacebookService],
})
export class FacebookModule {}
