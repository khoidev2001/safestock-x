import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AiClientService } from "../../ai/ai-client.service";
import { JwtAuthGuard } from "../../auth/guards";
import { PermissionGuard } from "../../rbac/permission.guard";
import { MissionController } from "../mission.controller";
import { MissionService } from "../mission.service";
import { UserRole } from "@safestock/shared-types";

describe("MissionController report transcription contract", () => {
  let app: INestApplication;
  const transcribeReportAudio = jest.fn().mockResolvedValue({ text: "Nội dung đã nhận dạng" });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MissionController],
      providers: [
        { provide: MissionService, useValue: { transcribeReportAudio } },
        { provide: AiClientService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: { switchToHttp(): { getRequest(): { user?: unknown } } }) {
          context.switchToHttp().getRequest().user = {
            userId: "reporter-a",
            email: "reporter-a",
            role: "REPORTER",
            organizationId: "org-a",
            warehouseId: "warehouse-a",
          };
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns { text: string } over HTTP", async () => {
    await request(app.getHttpServer())
      .post("/missions/transcribe")
      .send({ audioBase64: "UklGRiQAAABXQVZFZm10", mimeType: "audio/wav" })
      .expect(201)
      .expect({ text: "Nội dung đã nhận dạng" });

    expect(transcribeReportAudio).toHaveBeenCalledWith(
      "reporter-a",
      "UklGRiQAAABXQVZFZm10",
      "audio/wav",
    );
  });
});

describe("MissionController rescue read-only route matrix", () => {
  it("does not expose rescue confirm, reject, complete or mission-wide prepare handlers", () => {
    const controller = MissionController.prototype as unknown as Record<string, unknown>;
    for (const handler of ["confirm", "reject", "complete", "prepare"]) {
      expect(controller[handler]).toBeUndefined();
    }
  });

  it("rejects REPORTER from generic mission route contracts", async () => {
    const controller = new MissionController({} as never, {} as never);
    const request = {
      user: {
        userId: "reporter-a",
        email: "reporter-a",
        role: UserRole.REPORTER,
        organizationId: "org-a",
        warehouseId: "warehouse-a",
      },
    } as never;
    expect(() => controller.list(request)).toThrow("Không tìm thấy nhiệm vụ");
    expect(() => controller.get(request, "mission-a")).toThrow("Không tìm thấy nhiệm vụ");
    expect(() => controller.clusterWarehouses(request, "warehouse-a")).toThrow(
      "Không tìm thấy nhiệm vụ",
    );
    expect(() => controller.actionPlan(request, "mission-a")).toThrow(
      "Không tìm thấy nhiệm vụ",
    );
    await expect(controller.explain(request, "mission-a")).rejects.toThrow(
      "Không tìm thấy nhiệm vụ",
    );
  });
});

describe("MissionController warehouse request review contract", () => {
  it("passes database-current ADMIN actor and reviewed quantity to the service", async () => {
    const missions = { reviewWarehouseRequest: jest.fn().mockResolvedValue({ id: "request-a" }) };
    const controller = new MissionController(missions as never, {} as never);

    await controller.reviewWarehouseRequest(
      { user: { userId: "admin-a" } } as never,
      "request-a",
      { requestedQuantity: 8, adminNote: "Đã duyệt lại" },
    );

    expect(missions.reviewWarehouseRequest).toHaveBeenCalledWith(
      "request-a",
      "admin-a",
      { requestedQuantity: 8, adminNote: "Đã duyệt lại" },
    );
  });
});
