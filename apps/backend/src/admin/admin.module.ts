import { Module } from "@nestjs/common";
import { AdminUserController } from "./admin-user.controller";
import { AdminUserService } from "./admin-user.service";
import { AdminWarehouseController } from "./admin-warehouse.controller";
import { AdminWarehouseService } from "./admin-warehouse.service";

@Module({
  controllers: [AdminUserController, AdminWarehouseController],
  providers: [AdminUserService, AdminWarehouseService],
})
export class AdminModule {}
