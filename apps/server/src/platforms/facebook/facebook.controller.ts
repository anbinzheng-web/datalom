import { Controller, Get, Inject, Param, Query, Req, Res, NotFoundException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { CapturedPlatformService } from '../../public-api/captured-platform.service.js';
import { FacebookService } from './facebook.service.js';
import { endpoints } from './facebook.endpoints.js';
@Controller('api/v1/facebook/web')
export class FacebookController {
  constructor(
    @Inject(CapturedPlatformService) private readonly executor: CapturedPlatformService,
    @Inject(FacebookService) private readonly service: FacebookService,
  ) {}
  @Get(':resource/:action')
  request(
    @Param('resource') resource: string,
    @Param('action') action: string,
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const def = endpoints[`${resource}/${action}`];
    if (!def) throw new NotFoundException();
    return this.executor.request(this.service.platform, def, query, req, reply);
  }
}
