import { ForbiddenException } from "@nestjs/common";
import { buildTimeline, getScenario, scenarios } from "@safestock/scenario-definitions";
import { RunnerService } from "../runner.service";

describe("RunnerService isolation", () => {
  const prisma = {
    simulationScenario: { upsert: jest.fn() },
    simulationRun: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const sim = { emit: jest.fn() };
  const access = { assertMutationAccess: jest.fn() };
  const runner = new RunnerService(prisma as never, sim as never, access as never);

  beforeEach(() => {
    jest.clearAllMocks();
    sim.emit.mockReset().mockResolvedValue({ id: "event-1" });
    access.assertMutationAccess.mockReset().mockResolvedValue({});
    prisma.simulationRun.update.mockReset().mockResolvedValue({});
    prisma.simulationRun.updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("authorize createRun trước scenario upsert", async () => {
    access.assertMutationAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      runner.createRun("warehouse-user", scenarios[0].key, "warehouse-2"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.simulationScenario.upsert).not.toHaveBeenCalled();
    expect(prisma.simulationRun.create).not.toHaveBeenCalled();
  });

  it.each(["pause", "reset"] as const)("authorize %s qua run.warehouseId", async (method) => {
    prisma.simulationRun.findUnique.mockResolvedValue({ id: "run-1", warehouseId: "warehouse-2" });
    access.assertMutationAccess.mockRejectedValue(new ForbiddenException());

    await expect(runner[method]("warehouse-user", "run-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(access.assertMutationAccess).toHaveBeenCalledWith("warehouse-user", "warehouse-2");
    expect(prisma.simulationRun.update).not.toHaveBeenCalled();
  });

  it("dừng background run khi actor mất quyền", async () => {
    const state = {
      timeline: [{ offsetMs: 0, deviceCode: "temp-a", eventType: "TEMP", value: 30 }],
      idx: 0,
      timer: null,
      startWall: Date.now(),
      warehouseId: "warehouse-1",
      scenarioKey: scenarios[0].key,
      speed: 1,
      actorUserId: "admin-1",
      inFlight: null,
      stopRequested: false,
    };
    (runner as unknown as { active: Map<string, unknown> }).active.set("run-1", state);
    sim.emit.mockRejectedValue(new ForbiddenException());

    await (runner as unknown as { fire(runId: string): Promise<void> }).fire("run-1");

    expect(sim.emit).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({
        warehouseId: "warehouse-1",
        runId: "run-1",
      }),
    );
    expect(prisma.simulationRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { status: "PAUSED" },
    });
    expect(prisma.simulationRun.update).not.toHaveBeenCalled();
  });

  it("reset chờ fire đang chạy rồi mới ghi cursor=0", async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = {
      timeline: [{ offsetMs: 100, deviceCode: "temp-a", eventType: "TEMP", value: 30 }],
      idx: 0,
      timer: null,
      startWall: Date.now(),
      warehouseId: "warehouse-1",
      scenarioKey: scenarios[0].key,
      speed: 1,
      actorUserId: "admin-1",
      inFlight: null,
      stopRequested: false,
    };
    (runner as unknown as { active: Map<string, unknown> }).active.set("run-reset", state);
    sim.emit.mockImplementation(async () => {
      entered();
      await releasePromise;
      return { id: "event-1" };
    });
    prisma.simulationRun.findUnique.mockResolvedValue({
      id: "run-reset",
      warehouseId: "warehouse-1",
    });
    access.assertMutationAccess.mockResolvedValue({});
    (
      runner as unknown as {
        startTracked(runId: string, operation: string, task: () => Promise<void>): void;
        fire(runId: string): Promise<void>;
      }
    ).startTracked("run-reset", "fire", () =>
      (runner as unknown as { fire(runId: string): Promise<void> }).fire("run-reset"),
    );
    await enteredPromise;

    const resetting = runner.reset("admin-1", "run-reset");
    await Promise.resolve();
    expect(prisma.simulationRun.update).not.toHaveBeenCalledWith({
      where: { id: "run-reset" },
      data: { status: "IDLE", cursorMs: 0 },
    });

    release();
    await resetting;

    expect(prisma.simulationRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: "run-reset" },
      data: { cursorMs: 100 },
    });
    expect(prisma.simulationRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: "run-reset" },
      data: { status: "IDLE", cursorMs: 0 },
    });
  });

  it("event cuối chuyển run sang DONE và giải phóng active state", async () => {
    const state = {
      timeline: [{ offsetMs: 100, deviceCode: "temp-a", eventType: "TEMP", value: 30 }],
      idx: 0,
      timer: null,
      startWall: Date.now(),
      warehouseId: "warehouse-1",
      scenarioKey: scenarios[0].key,
      speed: 1,
      actorUserId: "admin-1",
      inFlight: null,
      stopRequested: false,
    };
    const internal = runner as unknown as {
      active: Map<string, unknown>;
      startTracked(runId: string, operation: string, task: () => Promise<void>): void;
      fire(runId: string): Promise<void>;
    };
    internal.active.set("run-done", state);
    internal.startTracked("run-done", "fire", () => internal.fire("run-done"));
    await (state.inFlight as unknown as Promise<void>);

    expect(prisma.simulationRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: "run-done" },
      data: { cursorMs: 100 },
    });
    expect(prisma.simulationRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: "run-done" },
      data: { status: "DONE" },
    });
    expect(internal.active.has("run-done")).toBe(false);
  });

  it("resume từ DB bỏ qua event đã xử lý thay vì replay", async () => {
    const scenario = getScenario(scenarios[0].key)!;
    const timeline = buildTimeline(scenario, 42);
    const cursorMs = timeline[0].offsetMs;
    const nextIndex = timeline.findIndex((event) => event.offsetMs > cursorMs);
    const expectedIndex = nextIndex < 0 ? timeline.length : nextIndex;
    prisma.simulationRun.findUnique.mockResolvedValue({
      id: "run-resume",
      warehouseId: "warehouse-1",
      scenario: { key: scenario.key },
      seed: 42,
      speed: 1,
      cursorMs,
      status: "PAUSED",
    });

    await runner.play("admin-1", "run-resume");

    const internal = runner as unknown as { active: Map<string, { idx: number }> };
    expect(internal.active.get("run-resume")?.idx).toBe(expectedIndex);
    await runner.pause("admin-1", "run-resume");
  });

  it("serialize control commands cùng runId", async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const internal = runner as unknown as {
      withRunControl<T>(runId: string, operation: () => Promise<T>): Promise<T>;
    };
    const first = internal.withRunControl("run-control", async () => {
      entered();
      await releasePromise;
      order.push("pause");
    });
    const second = internal.withRunControl("run-control", async () => {
      order.push("play");
    });
    await enteredPromise;
    await Promise.resolve();
    expect(order).toEqual([]);

    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["pause", "play"]);
  });

  it("không advance cursor khi emit lỗi ngoài authorization", async () => {
    const state = {
      timeline: [{ offsetMs: 100, deviceCode: "temp-a", eventType: "TEMP", value: 30 }],
      idx: 0,
      timer: null,
      startWall: Date.now(),
      warehouseId: "warehouse-1",
      scenarioKey: scenarios[0].key,
      speed: 1,
      actorUserId: "admin-1",
      inFlight: null,
      stopRequested: false,
    };
    const internal = runner as unknown as {
      active: Map<string, unknown>;
      startTracked(runId: string, operation: string, task: () => Promise<void>): void;
      fire(runId: string): Promise<void>;
    };
    internal.active.set("run-error", state);
    sim.emit.mockRejectedValue(new Error("database unavailable"));
    internal.startTracked("run-error", "fire", () => internal.fire("run-error"));
    await (state.inFlight as unknown as Promise<void>);

    expect(prisma.simulationRun.update).not.toHaveBeenCalled();
    expect(prisma.simulationRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run-error" },
      data: { status: "PAUSED" },
    });
  });
});
