import { Global, Module } from "@nestjs/common";
import { AiClientService } from "./ai-client.service";

/** Client gọi ai-service — dùng chung Mission + Incident. */
@Global()
@Module({
  providers: [AiClientService],
  exports: [AiClientService],
})
export class AiModule {}
