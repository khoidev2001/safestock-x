import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // Nới giới hạn body JSON (mặc định 100kb) để nhận audio base64 cho /missions/transcribe
  // (WAV 16kHz mono ~32KB/s → clip vài phút vượt xa 100kb). Trần 25mb khớp cap ai-service.
  app.useBodyParser("json", { limit: "25mb" });
  app.setGlobalPrefix("api");
  // whitelist: strip mọi field ngoài DTO → client KHÔNG gửi được createdAt/timestamp,
  // server (Prisma @default(now()) / new Date()) là nguồn thời gian duy nhất (#31).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.API_PORT ?? 3000;
  await app.listen(port);

  console.log(`Ứng phó nhanh API chạy tại http://localhost:${port}/api`);
}
bootstrap();
