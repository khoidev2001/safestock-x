import { IncidentWatchdogService } from "../incident-watchdog.service";

describe("IncidentWatchdogService", () => {
  const prisma = { virtualDevice: { findMany: jest.fn() } };
  const incidents = { scanWarehouse: jest.fn(), scanSilentDevices: jest.fn() };
  const config = { get: jest.fn() };

  const build = () =>
    new IncidentWatchdogService(prisma as never, incidents as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    prisma.virtualDevice.findMany.mockResolvedValue([]);
    incidents.scanSilentDevices.mockResolvedValue({ detected: 0 });
  });

  it("quét mọi kho đang có thiết bị khai báo chu kỳ báo", async () => {
    prisma.virtualDevice.findMany.mockResolvedValue([
      { warehouseId: "warehouse-1" },
      { warehouseId: "warehouse-2" },
    ]);

    await build().sweep();

    expect(incidents.scanSilentDevices).toHaveBeenCalledWith("warehouse-1");
    expect(incidents.scanSilentDevices).toHaveBeenCalledWith("warehouse-2");
  });

  it("đồng hồ nền chỉ quét im lặng, không dựng lại sự cố vừa được xử lý", async () => {
    // Quét lại toàn bộ cửa sổ 60 phút mỗi lượt sẽ tạo lại sự cố mà người vận hành
    // vừa đóng, khi sự kiện gốc còn nằm trong cửa sổ.
    prisma.virtualDevice.findMany.mockResolvedValue([{ warehouseId: "warehouse-1" }]);

    await build().sweep();

    expect(incidents.scanWarehouse).not.toHaveBeenCalled();
  });

  it("một kho lỗi không được chặn các kho còn lại", async () => {
    prisma.virtualDevice.findMany.mockResolvedValue([
      { warehouseId: "warehouse-1" },
      { warehouseId: "warehouse-2" },
    ]);
    incidents.scanSilentDevices.mockRejectedValueOnce(new Error("mất kết nối database"));

    await expect(build().sweep()).resolves.toBeUndefined();
    expect(incidents.scanSilentDevices).toHaveBeenCalledTimes(2);
  });

  it("lỗi liệt kê thiết bị không làm sập tiến trình nền", async () => {
    prisma.virtualDevice.findMany.mockRejectedValue(new Error("database đang khởi động"));

    await expect(build().sweep()).resolves.toBeUndefined();
  });

  it("không chồng lượt quét khi lượt trước còn chạy", async () => {
    let release: () => void = () => {};
    prisma.virtualDevice.findMany.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([{ warehouseId: "warehouse-1" }]);
      }),
    );

    const service = build();
    const first = service.sweep();
    await service.sweep(); // lượt thứ hai phải bị bỏ qua ngay
    release();
    await first;

    expect(prisma.virtualDevice.findMany).toHaveBeenCalledTimes(1);
  });

  it("chỉ tắt hẳn khi cấu hình đúng giá trị 0", () => {
    config.get.mockReturnValue("0");
    const disabled = build();
    disabled.onModuleInit();
    expect(hasTimer(disabled)).toBe(false);
    disabled.onModuleDestroy();
  });

  it("giá trị cấu hình rác KHÔNG được âm thầm tắt việc canh cảm biến", () => {
    // Gõ nhầm biến môi trường mà mất luôn cảnh báo mất tín hiệu là hỏng nguy hiểm.
    config.get.mockReturnValue("sáu mươi");
    const service = build();
    service.onModuleInit();
    expect(hasTimer(service)).toBe(true);
    service.onModuleDestroy();
  });

  it("dừng sạch timer khi module đóng", () => {
    const service = build();
    service.onModuleInit();
    service.onModuleDestroy();
    expect(hasTimer(service)).toBe(false);
  });
});

function hasTimer(service: IncidentWatchdogService): boolean {
  return (service as unknown as { timer: NodeJS.Timeout | null }).timer !== null;
}
