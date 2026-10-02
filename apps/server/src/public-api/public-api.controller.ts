import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { publicSpecification } from '../openapi/public.js';
import { PublicApiService } from './public-api.service.js';
@Controller('api/v1')
export class PublicApiController {
  constructor(@Inject(PublicApiService) private readonly api: PublicApiService) {}
  @Get('openapi.json')
  specification(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    this.api.authenticate(req, reply);
    return publicSpecification();
  }
}
