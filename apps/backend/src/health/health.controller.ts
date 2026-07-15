import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createConnection } from "net";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const ok = db && redis;
    return {
      status: ok ? "ok" : "degraded",
      services: { database: db ? "up" : "down", redis: redis ? "up" : "down" },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private checkRedis(): Promise<boolean> {
    const url = new URL(this.config.get("REDIS_URL") ?? "redis://localhost:6379");
    return new Promise((resolve) => {
      const socket = createConnection(
        { host: url.hostname, port: Number(url.port || 6379) },
        () => {
          socket.write("PING\r\n");
        },
      );
      socket.setTimeout(2000);
      socket.on("data", (d) => {
        socket.destroy();
        resolve(d.toString().includes("PONG"));
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}
