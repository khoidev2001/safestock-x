import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { findPeerByKey, parseCommunePeers, type CommunePeer } from "./commune-peer-registry";

/** Xã lân cận đã xác thực, gắn vào request cho controller dùng. */
export interface PeerRequest extends Request {
  peer?: CommunePeer;
}

/**
 * Cho phép máy chủ xã lân cận gọi vào, xác thực bằng khoá chia sẻ.
 *
 * KHÔNG dùng JWT ở đây: bên gọi là một máy chủ, không phải người đăng nhập. Bắt
 * nó cầm token của một tài khoản nào đó nghĩa là phải tạo tài khoản giả cho từng
 * xã, và token đó hết hạn giữa đêm thì cả đường truyền chết mà không ai hay.
 *
 * So khoá bằng `timingSafeEqual` chứ không bằng `===`: so chuỗi thường thoát ra
 * ngay ở ký tự đầu khác nhau, nên thời gian trả lời rò rỉ dần từng ký tự của
 * khoá đúng. Đây là khoá duy nhất bảo vệ một endpoint TRỪ ĐƯỢC KHO của xã khác.
 */
@Injectable()
export class CommunePeerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PeerRequest>();
    const presented = request.header("x-commune-key");
    if (!presented) throw new UnauthorizedException("Thiếu khoá liên xã");

    // Tra theo KHOÁ, không theo tên xã gửi kèm header. Header HTTP chỉ mang được
    // latin-1, mà tên xã nào ở đây cũng có dấu — gửi tên qua header là hỏng với
    // mọi xã thật, và chỉ chạy được khi thử bằng tên không dấu.
    const peer = findPeerByKey(parseCommunePeers(process.env), presented, safeEqual);
    // Không tiết lộ xã nào đã khai và xã nào chưa: câu trả lời khác nhau là đủ
    // để dò ra danh sách xã lân cận từ bên ngoài.
    if (!peer) throw new UnauthorizedException("Khoá liên xã không hợp lệ");

    request.peer = peer;
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Độ dài khác nhau thì `timingSafeEqual` ném; vẫn phải so một lần để thời gian
  // trả lời không tiết lộ luôn cả độ dài khoá đúng.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
