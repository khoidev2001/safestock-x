import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { LoanController } from "./loan.controller";
import { LoanService } from "./loan.service";
import { InterCommuneLoanService } from "./inter-commune-loan.service";

@Module({
  imports: [ReadinessModule, InventoryModule],
  controllers: [LoanController],
  providers: [LoanService, InterCommuneLoanService],
  exports: [LoanService, InterCommuneLoanService],
})
export class LoanModule {}
