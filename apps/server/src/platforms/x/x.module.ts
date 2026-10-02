import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { XController } from './x.controller.js';
import { XService } from './x.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [XController],
  providers: [XService],
})
export class XModule {}
