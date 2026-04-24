import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadXfsServerEnv, parseCorsOrigins } from '@atm/shared';
import { AppModule } from './app.module';

/**
 * xfs-server bootstrap.
 *
 * Order matters:
 *   1. Validate env with zod BEFORE Nest constructs anything. A misconfigured
 *      boot should never silently come up and then fail at first DB query.
 *   2. Use nestjs-pino as the app logger so every request and every Nest log
 *      flows through the same structured pipeline.
 *   3. Wire validation, versioning, graceful shutdown.
 */
async function bootstrap() {
  const env = loadXfsServerEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  app.enableCors({
    origin: parseCorsOrigins(env),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // OpenAPI: served at /docs in dev for quick exploration.
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ATM XFS Simulator — xfs-server')
      .setDescription(
        'REST surface for the ATM XFS simulator: sessions, cards, cassettes, XFS admin, logs. ' +
          'XFS command execution + event streaming uses Socket.IO at /xfs.',
      )
      .setVersion('0.1.0')
      .addServer(`http://${env.XFS_SERVER_HOST}:${env.XFS_SERVER_PORT}`)
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(env.XFS_SERVER_PORT, env.XFS_SERVER_HOST);

  const logger = app.get(PinoLogger);
  logger.log(
    `xfs-server listening on http://${env.XFS_SERVER_HOST}:${env.XFS_SERVER_PORT} (${env.NODE_ENV})`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[xfs-server] bootstrap failed:', err);
  process.exit(1);
});
