import { Body, Controller, HttpException, Inject, Post, Req } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Store } from '@datalom/shared/storage/store';

const pathPattern = /^\/api\/v1\/(?:tiktok|instagram|facebook|x|youtube|doubao)\/web\/[a-z0-9/-]+$/;

@Controller('api/docs')
export class DocsTryController {
  constructor(@Inject(Store) private readonly store: Store) {}

  @Post('try')
  async try(@Req() req: FastifyRequest, @Body() body: unknown) {
    const supplied = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '';
    const session = req.headers['x-datalom-session'];
    const user = typeof session === 'string' ? this.store.userForSession(session) : null;
    const token = this.store.getSetting<string>('auth') ?? '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(token);
    const machine = Boolean(token && supplied && a.length === b.length && timingSafeEqual(a, b));
    if (!user && !machine) throw new HttpException({ error: { message: '请先登录' } }, 401);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new HttpException({ error: { message: '请求无效' } }, 400);
    const method = 'method' in body ? body.method : undefined;
    const path = 'path' in body ? body.path : undefined;
    const query = 'query' in body ? body.query : undefined;
    const payload = 'body' in body ? body.body : undefined;
    if ((method !== 'GET' && method !== 'POST') || typeof path !== 'string' || !pathPattern.test(path))
      throw new HttpException({ error: { message: '接口不在文档目录中' } }, 400);
    if (method === 'POST' && path !== '/api/v1/doubao/web/chat/completion')
      throw new HttpException({ error: { message: '该接口不接受请求体' } }, 400);
    const params = new URLSearchParams();
    if (query !== undefined) {
      if (!query || typeof query !== 'object' || Array.isArray(query))
        throw new HttpException({ error: { message: '查询参数无效' } }, 400);
      for (const [key, value] of Object.entries(query)) {
        if (!/^[a-z0-9_]{1,40}$/.test(key) || typeof value !== 'string' || value.length > 4096)
          throw new HttpException({ error: { message: `参数无效：${key}` } }, 400);
        params.set(key, value);
      }
    }
    const key = process.env.DATALOM_PUBLIC_API_KEY;
    if (!key || key.length < 32)
      throw new HttpException({ error: { message: '公开 API 尚未配置' } }, 503);
    const url = new URL(path, `http://127.0.0.1:${process.env.PORT ?? 4317}`);
    url.search = params.toString();
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
      redirect: 'manual',
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 4000) };
    }
    return { status: response.status, body: parsed };
  }
}
