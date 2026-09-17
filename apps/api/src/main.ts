import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Consistent error envelope across the whole API.
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Restaurant Management System API')
    .setDescription('REST API for the Restaurant Management System')
    .setVersion('0.0.0')
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
