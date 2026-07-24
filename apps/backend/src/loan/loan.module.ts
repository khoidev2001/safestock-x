import { Module } from "@nestjs/common";
import { ReadinessModule } from "../readiness/readiness.module";
import { LoanController } from "./loan.controller";
import { LoanService } from "./loan.service";

@Module({
  imports: [ReadinessModule],
  controllers: [LoanController],
  providers: [LoanService],
  exports: [LoanService],
})
export class LoanModule {}
