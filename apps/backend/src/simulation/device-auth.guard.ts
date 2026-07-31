import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { DeviceCredentialService } from "./device-credential.service";
import type { HardwareTelemetryActor } from "./telemetry-actor";

export interface DeviceAuthenticatedRequest extends Request {
  device: HardwareTelemetryActor;
}

/**
 * Xác thực gateway phần cứng. Thiết bị KHÔNG dùng JWT người dùng: nó có khoá
 * riêng, thu hồi được độc lập, và không mang theo quyền của bất kỳ tài khoản nào.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly credentials: DeviceCredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceAuthenticatedRequest>();
    request.device = await this.credentials.authenticate(extractDeviceToken(request));
    return true;
  }
}

function extractDeviceToken(request: Request): string | undefined {
  const header = request.headers["x-device-token"];
  const direct = Array.isArray(header) ? header[0] : header;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = request.headers.authorization;
  const match =
    typeof authorization === "string" ? /^Device\s+(.+)$/i.exec(authorization.trim()) : null;
  return match?.[1]?.trim();
}
