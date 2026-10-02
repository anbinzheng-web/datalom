import { Module } from '@nestjs/common';
import { LegacyApiModule } from '../../legacy/legacy-api.module.js';
import { PublicApiModule } from '../../public-api/public-api.module.js';
import { DoubaoController } from './doubao.controller.js';
import { DoubaoService } from './doubao.service.js';
@Module({
  imports: [LegacyApiModule, PublicApiModule],
  controllers: [DoubaoController],
  providers: [DoubaoService],
})
export class DoubaoModule {}
