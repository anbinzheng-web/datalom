import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        serializers: {
          req: (req: { method: string; url?: string }) => ({
            method: req.method,
            url: req.url?.split('?')[0],
          }),
        },
      },
      bodyLimit: 1024 * 1024,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4317), process.env.HOST ?? '127.0.0.1');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
