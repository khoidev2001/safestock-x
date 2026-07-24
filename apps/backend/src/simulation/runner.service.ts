import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildTimeline, getScenario, ScenarioEvent } from "@safestock/scenario-definitions";
import { PrismaService } from "../prisma/prisma.service";
import { SimulationService } from "./simulation.service";
import { SimulationAccessService } from "./simulation-access.service";

interface ActiveRun {
  timeline: ScenarioEvent[];
  idx: number; // event kế tiếp
  timer: NodeJS.Timeout | null;
  startWall: number; // mốc wall-clock (ms) tương ứng cursor=0
  warehouseId: string;
  scenarioKey: string;
  speed: number;
  actorUserId: string;
  inFlight: Promise<void> | null;
  stopRequested: boolean;
}

/** Payload sự kiện runner phát ra WebSocket gateway. */
export interface RunnerEventPayload {
  runId: string;
  deviceCode: string;
  eventType: string;
  value: number;
  offsetMs: number;
  saved: boolean;
}

// Runner timeline-scrubber: con trỏ chạy qua list event có offsetMs.
// Deterministic theo (scenario, seed). Tua = nhân tốc độ vào khoảng chờ.
@Injectable()
export class RunnerService {
  private readonly log = new Logger(RunnerService.name);
  private active = new Map<string, ActiveRun>();
  private resumeIndices = new Map<string, number>();
  private controlQueues = new Map<string, Promise<unknown>>();
  // Callback bắn event ra ngoài (WebSocket gateway đăng ký ở B2)
  onEvent?: (warehouseId: string, payload: RunnerEventPayload) => void;

  constructor(
    private prisma: PrismaService,
    private sim: SimulationService,
    private access: SimulationAccessService,
  ) {}

  async createRun(
    actorUserId: string,
    scenarioKey: string,
    warehouseId: string,
    seed = 42,
    speed = 1,
  ) {
    if (![1, 10].includes(speed)) throw new BadRequestException("speed chỉ 1 hoặc 10");
    const def = getScenario(scenarioKey);
    if (!def) throw new NotFoundException(`Scenario không tồn tại: ${scenarioKey}`);
    await this.access.assertMutationAccess(actorUserId, warehouseId);

    // Scenario definition lưu dạng JSON — ép qua unknown vì Scenario là object thuần.
    const definition = def as unknown as Prisma.InputJsonValue;
    const scenario = await this.prisma.simulationScenario.upsert({
      where: { key: def.key },
      create: { key: def.key, name: def.name, description: def.description, definition },
      update: { definition },
    });
    const run = await this.prisma.simulationRun.create({
      data: { scenarioId: scenario.id, warehouseId, seed, speed, status: "IDLE" },
    });
    return run;
  }

  play(actorUserId: string, runId: string) {
    return this.withRunControl(runId, () => this.playUnlocked(actorUserId, runId));
  }

  private async playUnlocked(actorUserId: string, runId: string) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: { scenario: true },
    });
    if (!run) throw new NotFoundException("Run không tồn tại");
    await this.access.assertMutationAccess(actorUserId, run.warehouseId);
    if (this.active.has(runId)) return run; // đang chạy

    const timeline = buildTimeline(getScenario(run.scenario.key)!, run.seed);
    // Bỏ qua event đã trước cursor (resume)
    const rememberedIndex = this.resumeIndices.get(runId);
    let idx =
      rememberedIndex ??
      timeline.findIndex((e) =>
        run.status === "IDLE" ? e.offsetMs >= run.cursorMs : e.offsetMs > run.cursorMs,
      );
    if (idx < 0) idx = timeline.length;

    const state: ActiveRun = {
      timeline,
      idx,
      timer: null,
      startWall: Date.now() - run.cursorMs / run.speed,
      warehouseId: run.warehouseId,
      scenarioKey: run.scenario.key,
      speed: run.speed,
      actorUserId,
      inFlight: null,
      stopRequested: false,
    };
    this.active.set(runId, state);
    try {
      await this.prisma.simulationRun.update({
        where: { id: runId },
        data: { status: "PLAYING", startedAt: new Date() },
      });
    } catch (error) {
      if (this.active.get(runId) === state) this.active.delete(runId);
      throw error;
    }
    this.schedule(runId);
    return run;
  }

  private schedule(runId: string) {
    const st = this.active.get(runId);
    if (!st || st.stopRequested) return;
    if (st.idx >= st.timeline.length) {
      this.startTracked(runId, "finish", () => this.finish(runId));
      return;
    }
    const next = st.timeline[st.idx];
    const targetWall = st.startWall + next.offsetMs / st.speed;
    const delay = Math.max(0, targetWall - Date.now());
    st.timer = setTimeout(() => this.startTracked(runId, "fire", () => this.fire(runId)), delay);
  }

  private async fire(runId: string) {
    const st = this.active.get(runId);
    if (!st) return;
    const ev = st.timeline[st.idx];
    try {
      const saved = await this.sim.emit(st.actorUserId, {
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
      if (e instanceof ForbiddenException || e instanceof UnauthorizedException) {
        await this.stopUnauthorizedRun(runId);
        return;
      }
      throw e;
    }
    st.idx++;
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { cursorMs: ev.offsetMs },
    });
    if (st.stopRequested) return;
    if (st.idx >= st.timeline.length) {
      await this.finish(runId);
      return;
    }
    this.schedule(runId);
  }

  pause(actorUserId: string, runId: string) {
    return this.withRunControl(runId, () => this.pauseUnlocked(actorUserId, runId));
  }

  private async pauseUnlocked(actorUserId: string, runId: string) {
    const run = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("Run không tồn tại");
    await this.access.assertMutationAccess(actorUserId, run.warehouseId);
    await this.stopActiveExecution(runId);
    return this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "PAUSED" },
    });
  }

  reset(actorUserId: string, runId: string) {
    return this.withRunControl(runId, () => this.resetUnlocked(actorUserId, runId));
  }

  private async resetUnlocked(actorUserId: string, runId: string) {
    const run = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("Run không tồn tại");
    await this.access.assertMutationAccess(actorUserId, run.warehouseId);
    await this.stopActiveExecution(runId);
    this.resumeIndices.delete(runId);
    return this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "IDLE", cursorMs: 0 },
    });
  }

  private async finish(runId: string) {
    const st = this.active.get(runId);
    if (!st) return;
    try {
      await this.access.assertMutationAccess(st.actorUserId, st.warehouseId);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        await this.stopUnauthorizedRun(runId);
        return;
      }
      throw error;
    }
    if (st.timer) clearTimeout(st.timer);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: "DONE" },
    });
    this.resumeIndices.delete(runId);
    if (this.active.get(runId) === st) this.active.delete(runId);
  }

  private async stopUnauthorizedRun(runId: string): Promise<void> {
    const st = this.active.get(runId);
    if (st) {
      st.stopRequested = true;
      if (st.timer) clearTimeout(st.timer);
      this.resumeIndices.set(runId, st.idx);
    }
    this.active.delete(runId);
    await this.prisma.simulationRun.updateMany({
      where: { id: runId },
      data: { status: "PAUSED" },
    });
  }

  private async stopActiveExecution(runId: string): Promise<void> {
    const st = this.active.get(runId);
    if (!st) return;
    st.stopRequested = true;
    if (st.timer) clearTimeout(st.timer);
    await st.inFlight;
    this.resumeIndices.set(runId, st.idx);
    if (this.active.get(runId) === st) this.active.delete(runId);
  }

  private startTracked(runId: string, operation: string, task: () => Promise<void>): void {
    const st = this.active.get(runId);
    if (!st || st.stopRequested || st.inFlight) return;

    const inFlight = task()
      .catch(async (error) => {
        this.log.error(`${operation} lỗi run ${runId}: ${(error as Error).message}`);
        await this.stopUnauthorizedRun(runId).catch((stopError) => {
          this.log.error(`Không thể dừng run ${runId}: ${(stopError as Error).message}`);
        });
      })
      .finally(() => {
        if (st.inFlight === inFlight) st.inFlight = null;
      });
    st.inFlight = inFlight;
  }

  private withRunControl<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.controlQueues.get(runId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.controlQueues.set(runId, current);
    return current.finally(() => {
      if (this.controlQueues.get(runId) === current) this.controlQueues.delete(runId);
    });
  }
}
