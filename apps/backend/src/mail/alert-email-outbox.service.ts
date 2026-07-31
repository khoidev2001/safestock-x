import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AlertEmailStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AlertMailService } from "./alert-mail.service";

const POLL_INTERVAL_MS = 15_000;
const STALE_SENDING_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const BATCH_SIZE = 10;

@Injectable()
export class AlertEmailOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AlertEmailOutboxService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: AlertMailService,
  ) {}

  onModuleInit(): void {
    void this.processDue();
    this.timer = setInterval(() => void this.processDue(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Safe to call after an Incident is committed; a concurrent timer cannot send it twice. */
  async processDue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      await this.recoverStaleClaims(now);
      const candidates = await this.prisma.alertEmailOutbox.findMany({
        where: { status: AlertEmailStatus.PENDING, nextAttemptAt: { lte: now } },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const candidate of candidates) await this.processOne(candidate.id);
    } catch (error) {
      this.log.warn(`Không thể quét email outbox: ${messageOf(error)}`);
    } finally {
      this.processing = false;
    }
  }

  private async processOne(id: string): Promise<void> {
    const claimedAt = new Date();
    const claim = await this.prisma.alertEmailOutbox.updateMany({
      where: {
        id,
        status: AlertEmailStatus.PENDING,
        nextAttemptAt: { lte: claimedAt },
      },
      data: {
        status: AlertEmailStatus.SENDING,
        attempts: { increment: 1 },
        lastAttemptAt: claimedAt,
        lastError: null,
      },
    });
    if (claim.count !== 1) return;

    const job = await this.prisma.alertEmailOutbox.findUnique({
      where: { id },
      include: { incident: { include: { evidence: { orderBy: { occurredAt: "asc" } } } } },
    });
    if (!job) return;

    const sentAt = new Date();
    try {
      await this.mail.sendIncidentAlert(
        {
          title: job.incident.title,
          severity: job.incident.severity,
          confidence: job.incident.confidence,
          kind: job.incident.kind,
          evidence: job.incident.evidence,
        },
        job.incident.explanation,
        job.recipientEmails,
        { observedAt: job.observedAt, receivedAt: job.receivedAt, sentAt },
      );
      await this.prisma.alertEmailOutbox.update({
        where: { id },
        data: { status: AlertEmailStatus.SENT, sentAt, lastError: null },
      });
    } catch (error) {
      const reason = messageOf(error);
      const nextAttemptAt = new Date(sentAt.getTime() + retryDelayMs(job.attempts));
      await this.prisma.alertEmailOutbox.update({
        where: { id },
        data: {
          status: AlertEmailStatus.PENDING,
          nextAttemptAt,
          lastError: reason.slice(0, 1_000),
        },
      });
      this.log.warn(
        `Email incident ${job.incidentId} chưa gửi được; retry lúc ${nextAttemptAt.toISOString()}: ${reason}`,
      );
    }
  }

  private recoverStaleClaims(now: Date): Promise<Prisma.BatchPayload> {
    return this.prisma.alertEmailOutbox.updateMany({
      where: {
        status: AlertEmailStatus.SENDING,
        updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
      },
      data: { status: AlertEmailStatus.PENDING, nextAttemptAt: now },
    });
  }
}

function retryDelayMs(previousAttempts: number): number {
  const exponent = Math.min(Math.max(previousAttempts - 1, 0), 8);
  return Math.min(1_000 * 2 ** exponent, MAX_BACKOFF_MS);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
