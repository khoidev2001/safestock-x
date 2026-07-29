import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import {
  applyApiSecurityHeaders,
  resolveAllowedCorsOrigins,
} from "./config/http-security";
import { resolveBindAddress } from "./config/env.validation";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const allowedOrigins = resolveAllowedCorsOrigins(
    config.get<string>("CORS_ALLOWED_ORIGINS"),
    config.get<string>("NODE_ENV"),
  );
  app.disable("x-powered-by");
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Session-Transport"],
  });
  app.use(applyApiSecurityHeaders);
  // Nới giới hạn body JSON (mặc định 100kb) để nhận audio base64 cho /missions/transcribe
  // (WAV 16kHz mono ~32KB/s → clip vài phút vượt xa 100kb). Trần 25mb khớp cap ai-service.
  app.useBodyParser("json", { limit: "25mb" });
  app.setGlobalPrefix("api");
  // whitelist: strip mọi field ngoài DTO → client KHÔNG gửi được createdAt/timestamp,
  // server (Prisma @default(now()) / new Date()) là nguồn thời gian duy nhất (#31).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.API_PORT ?? 3000;
  // Bind đúng host đã validate: mặc định loopback (127.0.0.1); phục vụ LAN chỉ khi
  // BIND_ADDRESS=0.0.0.0 được đặt có chủ đích. Không còn để Node bind mặc định.
  const host = resolveBindAddress(process.env as Record<string, unknown>);
  await app.listen(port, host);

  console.log(`Ứng phó nhanh API chạy tại http://${host}:${port}/api`);
}
bootstrap();
