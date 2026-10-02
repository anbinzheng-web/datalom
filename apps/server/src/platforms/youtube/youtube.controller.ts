import { Controller, Get, Inject, Param, Query, Req, Res, NotFoundException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { YoutubeService } from './youtube.service.js';
@Controller('api/v1/youtube/web')
export class YoutubeController {
  constructor(@Inject(YoutubeService) private readonly service: YoutubeService) {}
  @Get(':resource/:action')
  request(
    @Param('resource') resource: string,
    @Param('action') action: string,
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const operation = `${resource}.${action}`;
    if (!['search.videos', 'video.detail', 'video.comments'].includes(operation))
      throw new NotFoundException();
    return this.service.request(operation, query, req, reply);
  }
}
