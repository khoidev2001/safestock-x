import { NotFoundException } from "@nestjs/common";
import { NotificationService } from "../notification.service";

describe("NotificationService organization scope", () => {
  function makeService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-a" }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({
          id: "notification-new",
          organizationId: "org-a",
          recipientRole: "ADMIN",
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mission: {
        findUnique: jest.fn().mockResolvedValue({
          warehouse: { organizationId: "org-a" },
          missionNo: 127,
          incidentType: "FLOOD",
          affectedPeople: 190,
          location: "Long Bình",
          hamletName: "Long Bình",
        }),
      },
    };
    return { prisma, service: new NotificationService(prisma as never) };
  }

  /** Tài khoản gắn với đúng một kho — trưởng thôn giữ kho. */
  function makeWarehouseScopedService() {
    const state = makeService();
    state.prisma.user.findUnique.mockResolvedValue({
      organizationId: "org-a",
      warehouseId: "warehouse-long-chau",
    });
    return state;
  }

  it("chép tình huống của nhiệm vụ vào thông báo để thẻ hiện được biểu tượng và số người", async () => {
    const { prisma, service } = makeService();

    await service.create({
      recipientRole: "RESCUE" as never,
      kind: "MISSION_ASSIGNED" as never,
      title: "Phương án ứng phó mới",
      body: "Lũ lụt — 190 người.",
      missionId: "mission-1",
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        missionNo: 127,
        incidentType: "FLOOD",
        affectedPeople: 190,
        locationName: "Long Bình",
      }),
    });
  });

  it("người gửi đã nói rõ tình huống thì không đọc đè bằng số của nhiệm vụ", async () => {
    // Báo cáo thô của trưởng thôn: nhiệm vụ còn là chỗ trống (OTHER, 0 người),
    // chép vào là thẻ khoe một con số không ai báo.
    const { prisma, service } = makeService();

    await service.create({
      recipientRole: "ADMIN" as never,
      kind: "INCIDENT_REPORTED" as never,
      title: "Báo cáo mới từ trưởng thôn",
      body: "Ngập ngang gối ở đầu thôn",
      missionId: "mission-1",
      incidentType: null,
    });

    // Soi DỮ LIỆU ĐÃ GHI, không soi câu truy vấn. Service vẫn phải đọc nhiệm vụ
    // để lấy SỐ HIỆU — số hiệu là danh tính, luôn chép; thứ bị cấm đọc đè là ba
    // trường mô tả tình huống.
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data.affectedPeople).toBeUndefined();
    expect(data.locationName).toBeUndefined();
  });

  it("báo cáo thô KHÔNG có tình huống nhưng VẪN có số hiệu nhiệm vụ", async () => {
    // Đây đúng là loại thông báo cần danh tính nhất: điều phối mở ra để xử lý một
    // việc cụ thể. Chặn số hiệu cùng nhóm với ba trường mô tả là thẻ mất luôn tên gọi.
    const { prisma, service } = makeService();

    await service.create({
      recipientRole: "ADMIN" as never,
      kind: "INCIDENT_REPORTED" as never,
      title: "Báo cáo mới từ trưởng thôn",
      body: "Ngập ngang gối ở đầu thôn",
      missionId: "mission-1",
      incidentType: null,
    });

    expect(prisma.notification.create.mock.calls[0][0].data.missionNo).toBe(127);
  });

  it("lists only notifications for the authenticated user's organization and role", async () => {
    const { prisma, service } = makeService();

    await service.list("admin-a", "ADMIN" as never, true);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", recipientRole: "ADMIN", read: false },
      // `id` đứng sau `createdAt`: hai thông báo cùng một mili giây (một sự kiện
      // gửi cho nhiều vai) thì thứ tự giữa chúng phải cố định, nếu không con trỏ
      // phân trang rơi vào giữa cặp đó sẽ nhảy cóc hoặc lặp một dòng.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
  });

  it("phân trang theo con trỏ vẫn bị khoá trong đúng tổ chức và vai của người gọi", async () => {
    // Cuộn vô tận trên điện thoại: trang sau không được là một lối đi vòng ra
    // khỏi phạm vi — điều kiện lọc phải y hệt trang đầu.
    const { prisma, service } = makeService();

    await service.list("admin-a", "ADMIN" as never, false, { limit: 20, cursor: "notif-20" });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", recipientRole: "ADMIN" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: "notif-20" },
      skip: 1,
      take: 20,
    });
  });

  it("chặn số dòng một lượt xin, để một cú cuộn không quét cả bảng", async () => {
    const { prisma, service } = makeService();

    await service.list("admin-a", "ADMIN" as never, false, { limit: 100000 });

    expect(prisma.notification.findMany.mock.calls[0][0].take).toBe(100);
  });

  it("does not reveal or mark a notification belonging to another organization", async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markRead("admin-a", "ADMIN" as never, "notification-org-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notification-org-b", organizationId: "org-a", recipientRole: "ADMIN" },
      data: { read: true },
    });
  });

  it("bulk-marks only unread notifications inside the caller's organization and role", async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.markManyRead("admin-a", "ADMIN" as never, [
      "n-1",
      "n-2",
      "n-org-b",
    ]);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["n-1", "n-2", "n-org-b"] },
        organizationId: "org-a",
        recipientRole: "ADMIN",
        read: false,
      },
      data: { read: true },
    });
    expect(result).toEqual({ count: 2 });
  });

  it("does not throw when some ids were already read by a colleague", async () => {
    // Bấm vào tab phải xoá được số kể cả khi danh sách id đã cũ vài giây; ném lỗi
    // ở đây thì con số nằm nguyên tại chỗ dù người dùng đã bấm.
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markManyRead("admin-a", "ADMIN" as never, ["n-da-doc"])).resolves.toEqual({
      count: 0,
    });
  });

  it("marks unread notifications only in the current organization and role", async () => {
    const { prisma, service } = makeService();

    await service.markAllRead("admin-a", "ADMIN" as never);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", recipientRole: "ADMIN", read: false },
      data: { read: true },
    });
  });

  it("reuses the unique notification for an idempotent field-update retry", async () => {
    const { prisma, service } = makeService();
    const existing = {
      id: "notification-existing",
      organizationId: "org-a",
      recipientRole: "ADMIN",
      fieldUpdateId: "field-update-1",
    };
    prisma.notification.findUnique.mockResolvedValue(existing);

    await expect(
      service.create({
        recipientRole: "ADMIN" as never,
        kind: "FIELD_UPDATE_REPORTED" as never,
        title: "Cập nhật hiện trường",
        body: "ADMIN cần xác minh",
        missionId: "mission-1",
        fieldUpdateId: "field-update-1",
      }),
    ).resolves.toEqual(existing);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("kho chỉ đọc được thông báo chung của xã và thông báo gửi đích danh kho mình", async () => {
    /*
      Lỗi đã gặp thật: nhiệm vụ số 824 chỉ cần kho thôn Long Châu xuất hàng, nhưng
      kho Đồng Xuân và kho Tân Bình cũng thấy thông báo "chuẩn bị vật tư" — vì
      thông báo chỉ được đánh địa chỉ theo TỔ CHỨC và VAI, không theo kho.

      Thông báo không ghi kho vẫn tới mọi kho: đó là tin chung thật (nhiệm vụ bị
      huỷ, đội cứu hộ đã rút), và mọi bản ghi cũ đều thuộc nhóm này.
    */
    const { prisma, service } = makeWarehouseScopedService();

    await service.list("warehouse-user", "WAREHOUSE" as never);

    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-a");
    expect(where.OR).toEqual([{ warehouseId: null }, { warehouseId: "warehouse-long-chau" }]);
  });

  it("điều phối và đội cứu hộ không bị chặn theo kho", async () => {
    // Hai vai này không giữ kho nào; chặn theo kho ở đây là bịt tai họ với chính
    // những lệnh họ vừa phát đi.
    const { prisma, service } = makeService();

    await service.list("admin-a", "ADMIN" as never);

    expect(prisma.notification.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("kho không đánh dấu đã đọc được thông báo của kho khác", async () => {
    const { prisma, service } = makeWarehouseScopedService();

    await service.markManyRead("warehouse-user", "WAREHOUSE" as never, [
      "notification-cua-kho-khac",
    ]);

    expect(prisma.notification.updateMany.mock.calls[0][0].where.OR).toEqual([
      { warehouseId: null },
      { warehouseId: "warehouse-long-chau" },
    ]);
  });

  it("bấm đọc hết KHÔNG xoá dấu chưa đọc trên lệnh của kho khác", async () => {
    // Cờ `read` nằm trên chính bản ghi, dùng chung cho cả vai: không lọc ở đây thì
    // kho này bấm một nhát là kho kia mở app lên thấy hộp sạch trơn trong khi đang
    // nợ một chuyến xuất hàng.
    const { prisma, service } = makeWarehouseScopedService();

    await service.markAllRead("warehouse-user", "WAREHOUSE" as never);

    expect(prisma.notification.updateMany.mock.calls[0][0].where.OR).toEqual([
      { warehouseId: null },
      { warehouseId: "warehouse-long-chau" },
    ]);
  });
});
