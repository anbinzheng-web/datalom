import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { InstagramController } from './instagram.controller.js';
import { InstagramService } from './instagram.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
