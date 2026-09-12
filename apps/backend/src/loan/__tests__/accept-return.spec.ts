import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { InterCommuneLoanService } from "../inter-commune-loan.service";

/**
 * Bước "xác nhận đã nhận lại" — chỗ DUY NHẤT cộng kho ở chiều về.
 *
 * Vì sao có bước này: chiều đi vốn hai nhịp (bên cho mượn đồng ý → bên mượn xác
 * nhận đã nhận), nên giữa hai nhịp hàng không nằm ở kho nào — đúng thực tế nó
 * đang trên đường. Chiều về trước đây chỉ một nhịp, và kho bên cho mượn được
 * cộng ngay theo LỜI KHAI của bên mượn, chưa ai bên này đối chiếu.
 */
describe("acceptReturn", () => {
  const LOAN = {
    id: "loan-1",
    organizationId: "org-cho-muon",
    direction: "OUTGOING",
    itemSku: "FIRSTAID-01",
    peerCommuneName: "Đồng Xuân",
    warehouseId: "kho-trung-tam",
    quantity: 40,
    returnedQuantity: 15,
    returnAcceptedQuantity: 0,
  };

  function dungService(loan: Record<string, unknown> | null) {
    const daGhi: { quantity: number }[] = [];
    const capNhat: Record<string, unknown>[] = [];
    const prisma = {
      user: { findUnique: async () => ({ organizationId: "org-cho-muon" }) },
      interCommuneLoan: {
        findFirst: async () => loan,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capNhat.push(data);
          return { ...loan, ...data };
        },
      },
      itemBatch: { findFirst: async () => ({ id: "lo-1" }) },
      warehouse: { findFirst: async () => ({ id: "kho-trung-tam" }) },
    };
    const inventory = {
      import: async (_u: string, _b: string, quantity: number) => {
        daGhi.push({ quantity });
      },
      export: async () => {
        throw new Error("chiều về không được TRỪ kho bên cho mượn");
      },
    };
    const service = new InterCommuneLoanService(
      prisma as never,
      inventory as never,
      { create: async () => undefined } as never,
    );
    return { service, daGhi, capNhat };
  }

  it("cộng đúng phần nhận lần này và ghi lại số đã xác nhận", async () => {
    const { service, daGhi, capNhat } = dungService({ ...LOAN });

    await service.acceptReturn({ loanId: "loan-1", userId: "u1", quantity: 10 });

    expect(daGhi).toEqual([{ quantity: 10 }]);
    expect(capNhat).toEqual([{ returnAcceptedQuantity: 10 }]);
  });

  it("bỏ trống số lượng thì nhận hết phần đang chờ", async () => {
    const { service, daGhi } = dungService({ ...LOAN, returnAcceptedQuantity: 5 });

    await service.acceptReturn({ loanId: "loan-1", userId: "u1" });

    // Bên kia khai trả 15, mình đã xác nhận 5 → còn chờ 10.
    expect(daGhi).toEqual([{ quantity: 10 }]);
  });

  it("chặn nhận nhiều hơn phần bên kia đã báo trả", async () => {
    const { service, daGhi } = dungService({ ...LOAN });

    await expect(
      service.acceptReturn({ loanId: "loan-1", userId: "u1", quantity: 16 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Nhận khống là cộng vào kho phần hàng chưa ai đưa — kho tự sinh ra hàng.
    expect(daGhi).toEqual([]);
  });

  it("chặn khi không còn phần nào đang chờ", async () => {
    const { service } = dungService({ ...LOAN, returnAcceptedQuantity: 15 });

    await expect(service.acceptReturn({ loanId: "loan-1", userId: "u1" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("bên ĐI MƯỢN không nhận lại được — họ không có gì để nhận về", async () => {
    const { service } = dungService({ ...LOAN, direction: "INCOMING" });

    await expect(service.acceptReturn({ loanId: "loan-1", userId: "u1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("không thấy khoản mượn thì báo rõ, không cộng bừa", async () => {
    const { service, daGhi } = dungService(null);

    await expect(service.acceptReturn({ loanId: "loan-1", userId: "u1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(daGhi).toEqual([]);
  });
});
