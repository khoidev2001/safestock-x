import { Module } from "@nestjs/common";
import { CommuneContactController } from "./commune-contact.controller";

@Module({
  controllers: [CommuneContactController],
})
export class CommuneContactModule {}
