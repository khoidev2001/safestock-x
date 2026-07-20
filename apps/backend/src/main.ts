import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix("api");
  // whitelist: strip mọi field ngoài DTO → client KHÔNG gửi được createdAt/timestamp,
  // server (Prisma @default(now()) / new Date()) là nguồn thời gian duy nhất (#31).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Ứng phó nhanh API chạy tại http://localhost:${port}/api`);
}
bootstrap();
