/**
 * stats-hunter API — Phase 0 skeleton.
 * Global prefix: /api. Default port: 3000.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Signal readiness to Nx when running under `nx serve`.
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      const load = new Function('s', 'return import(s)') as (
        s: string
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed.
    }
  }

  Logger.log(
    `stats-hunter API is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
