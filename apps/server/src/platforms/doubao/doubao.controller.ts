import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DoubaoService } from './doubao.service.js';
@Controller('api/v1/doubao/web')
export class DoubaoController {
  constructor(@Inject(DoubaoService) private readonly service: DoubaoService) {}
  @Post('chat/completion')
  request(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.service.request(body, req, reply);
  }
}
