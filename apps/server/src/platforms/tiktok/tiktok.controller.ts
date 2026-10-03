import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { TikTokService } from './tiktok.service.js';
@Controller('api/v1/tiktok/web')
export class TikTokController {
  constructor(@Inject(TikTokService) private readonly service: TikTokService) {}
  @Get('user/detail')
  async user_detail(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('user/detail', query, req, reply);
  }
  @Get('user/posts')
  async user_posts(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('user/posts', query, req, reply);
  }
  @Get('video/detail')
  async video_detail(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('video/detail', query, req, reply);
  }
  @Get('video/comments')
  async video_comments(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('video/comments', query, req, reply);
  }
  @Get('comment/replies')
  async comment_replies(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('comment/replies', query, req, reply);
  }
  @Get('search/videos')
  async search_videos(
    @Query() query: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request('search/videos', query, req, reply);
  }
}
