import type { Request } from "express";

export function getAuthSourceIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}
