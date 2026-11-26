import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  // Express's 100 KB default is too small for the base64 UPI QR image (≤ 1 MB, REST-88); the
  // upload schema caps the payload, so the global limit only needs headroom above that.
  app.useBodyParser('json', { limit: '2mb' });

  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Consistent error envelope across the whole API.
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Restaurant Management System API')
    .setVersion('0.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token returned by POST /auth/login (valid for 24 hours).',
    })
    .addTag('status', 'Health check')
    .addTag('authentication', 'Registration, login, verification and password recovery')
    .addTag('profile', "The signed-in user's own account: details and password")
    .addTag('staff', "Manage the restaurant's staff accounts (owners and managers)")
    .addTag('guests', 'Look up guest profiles')
    .addTag('reservations', 'Manage reservation records')
    .addTag('walk-ins', 'Register walk-in guests')
    .addTag('qr ordering (guest)', 'Public QR table ordering: menu, cart, rounds, bill and split')
    .addTag('qr ordering (staff)', 'Captain approval queue, escalation, QR payments and settings')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('API_PORT') ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/api/docs`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
