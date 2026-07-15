import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { buildTimeline, getScenario, ScenarioEvent } from "@safestock/scenario-definitions";
import { PrismaService } from "../prisma/prisma.service";
import { SimulationService } from "./simulation.service";

interface ActiveRun {
  timeline: ScenarioEvent[];
  idx: number; // event kế tiếp
  timer: NodeJS.Timeout | null;
  startWall: number; // mốc wall-clock (ms) tương ứng cursor=0
  warehouseId: string;
  scenarioKey: string;
  speed: number;
}

// Runner timeline-scrubber: con trỏ chạy qua list event có offsetMs.
// Deterministic theo (scenario, seed). Tua = nhân tốc độ vào khoảng chờ.
@Injectable()
export class RunnerService {
  private readonly log = new Logger(RunnerService.name);
  private active = new Map<string, ActiveRun>();
  // Callback bắn event ra ngoài (WebSocket gateway đăng ký ở B2)
  onEvent?: (warehouseId: string, payload: any) => void;

  constructor(
    private prisma: PrismaService,
    private sim: SimulationService,
  ) {}

  async createRun(scenarioKey: string, warehouseId: string, seed = 42, speed = 1) {
    if (![1, 10].includes(speed)) throw new BadRequestException("speed chỉ 1 hoặc 10");
    const def = getScenario(scenarioKey);
    if (!def) throw new NotFoundException(`Scenario không tồn tại: ${scenarioKey}`);

    const scenario = await this.prisma.simulationScenario.upsert({
      where: { key: def.key },
      create: { key: def.key, name: def.name, description: def.description, definition: def as any },
      update: { definition: def as any },
    });
    const run = await this.prisma.simulationRun.create({
      data: { scenarioId: scenario.id, warehouseId, seed, speed, status: "IDLE" },
    });
    return run;
  }

  async play(runId: string) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: { scenario: true },
    });
    if (!run) throw new NotFoundException("Run không tồn tại");
    if (this.active.has(runId)) return run; // đang chạy

    const timeline = buildTimeline(getScenario(run.scenario.key)!, run.seed);
    // Bỏ qua event đã trước cursor (resume)
    let idx = timeline.findIndex((e) => e.offsetMs >= run.cursorMs);
    if (idx < 0) idx = timeline.length;

    const state: ActiveRun = {
      timeline,
      idx,
      timer: null,
      startWall: Date.now() - run.cursorMs / run.speed,
      warehouseId: run.warehouseId,
      scenarioKey: run.scenario.key,
      speed: run.speed,
    };
    this.active.set(runId, state);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "PLAYING", startedAt: new Date() },
    });
    this.schedule(runId);
    return run;
  }

  private schedule(runId: string) {
    const st = this.active.get(runId);
    if (!st) return;
    if (st.idx >= st.timeline.length) {
      void this.finish(runId);
      return;
    }
    const next = st.timeline[st.idx];
    const targetWall = st.startWall + next.offsetMs / st.speed;
    const delay = Math.max(0, targetWall - Date.now());
    st.timer = setTimeout(() => void this.fire(runId), delay);
  }

  private async fire(runId: string) {
    const st = this.active.get(runId);
    if (!st) return;
    const ev = st.timeline[st.idx];
    try {
      const saved = await this.sim.emit({
        warehouseId: st.warehouseId,
        deviceCode: ev.deviceCode,
        eventType: ev.eventType,
        value: ev.value,
        scenarioId: st.scenarioKey,
        runId,
      });
      // Bắn ra WS kể cả khi bị ngưỡng lọc (UI vẫn muốn thấy) — nhưng đánh dấu saved
      this.onEvent?.(st.warehouseId, {
        runId,
        deviceCode: ev.deviceCode,
        eventType: ev.eventType,
        value: ev.value,
        offsetMs: ev.offsetMs,
        saved: !!saved,
      });
    } catch (e) {
      this.log.warn(`fire lỗi ${ev.deviceCode}: ${(e as Error).message}`);
    }
    st.idx++;
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { cursorMs: ev.offsetMs },
    });
    this.schedule(runId);
  }

  async pause(runId: string) {
    const st = this.active.get(runId);
    if (st?.timer) clearTimeout(st.timer);
    this.active.delete(runId);
    return this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "PAUSED" },
    });
  }

  async reset(runId: string) {
    const st = this.active.get(runId);
    if (st?.timer) clearTimeout(st.timer);
    this.active.delete(runId);
    return this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "IDLE", cursorMs: 0 },
    });
  }

  private async finish(runId: string) {
    const st = this.active.get(runId);
    if (st?.timer) clearTimeout(st.timer);
    this.active.delete(runId);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "DONE" },
    });
  }
}
