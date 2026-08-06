import { Body, Controller, Post, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { CommunePeerGuard, type PeerRequest } from "./commune-peer.guard";
import { InboundInterCommuneLoanDto, PeerStatusDto } from "./dto";
import { InterCommuneLoanService } from "./inter-commune-loan.service";

/**
 * Cửa nhận yêu cầu mượn do máy chủ xã lân cận đẩy sang.
 *
 * Tách khỏi `LoanController` vì cả lớp kia gác bằng JWT và quyền của NGƯỜI dùng,
 * còn cửa này gác bằng khoá chia sẻ giữa hai MÁY CHỦ. Trộn hai kiểu bảo vệ trong
 * một controller là sớm muộn cũng có endpoint thừa hưởng nhầm lớp gác.
 */
@UseGuards(CommunePeerGuard)
@Controller("loans/inter-commune")
export class InboundLoanController {
  constructor(private interCommune: InterCommuneLoanService) {}

  @Post("inbound")
  receive(
    @Request() req: PeerRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: InboundInterCommuneLoanDto,
  ) {
    return this.interCommune.receiveFromPeerServer(req.peer!.communeName, dto);
  }

  /** Xã kia báo trạng thái mới của khoản mượn. */
  @Post("peer-status")
  syncStatus(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: PeerStatusDto,
  ) {
    return this.interCommune.syncStatusFromPeer(dto);
  }
}
