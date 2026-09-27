import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LegacyApiModule } from './legacy/legacy-api.module.js';

@Module({
  imports: [LegacyApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
