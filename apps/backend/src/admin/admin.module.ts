import { Module } from "@nestjs/common";
import { AdminUserController } from "./admin-user.controller";
import { AdminUserService } from "./admin-user.service";
import { AdminWarehouseController } from "./admin-warehouse.controller";
import { AdminWarehouseService } from "./admin-warehouse.service";
import { AdminHamletController } from "./admin-hamlet.controller";
import { AdminHamletService } from "./admin-hamlet.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  // AuthModule cấp EmailVerificationService — tạo ADMIN phải qua mã 6 số.
  imports: [AuthModule],
  controllers: [AdminUserController, AdminWarehouseController, AdminHamletController],
  providers: [AdminUserService, AdminWarehouseService, AdminHamletService],
})
export class AdminModule {}
