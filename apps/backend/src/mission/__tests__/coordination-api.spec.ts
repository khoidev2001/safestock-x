import { validate } from "class-validator";
import { MissionController } from "../mission.controller";
import { AnalyzeMissionDto, FieldUpdateDto } from "../dto";

describe("coordination API controller contract", () => {
  const missions = {};
  const ai = {};
  const coordination = {
    listAnalysisSnapshots: jest.fn(),
    listFieldUpdates: jest.fn(),
    recordFieldUpdate: jest.fn(),
  };
  const analysis = { analyze: jest.fn() };
  const whatIf = { simulate: jest.fn() };
  const fieldAssistant = { submit: jest.fn() };
  const controller = new MissionController(
    missions as never,
    ai as never,
    coordination as never,
    analysis as never,
    whatIf as never,
    fieldAssistant as never,
    {} as never,
  );
  const request = { user: { userId: "admin-1", warehouseId: null } } as never;

  beforeEach(() => jest.clearAllMocks());

  it("delegates POST analyses without mutating the mission controller", async () => {
    analysis.analyze.mockResolvedValue({ snapshot: { id: "snapshot-1" } });
    const dto = Object.assign(new AnalyzeMissionDto(), { requestId: "analysis-req-0001" });

    await expect(controller.analyze(request, "mission-1", dto)).resolves.toEqual({
      snapshot: { id: "snapshot-1" },
    });
    expect(analysis.analyze).toHaveBeenCalledWith("mission-1", "admin-1", null, dto);
  });

  it("returns the newest baseline without letting a newer What-if replace it", async () => {
    coordination.listAnalysisSnapshots.mockResolvedValue([
      { id: "what-if-new", kind: "WHAT_IF" },
      { id: "baseline", kind: "BASELINE" },
      { id: "baseline-old", kind: "BASELINE" },
    ]);

    await expect(controller.latestAnalysis(request, "mission-1")).resolves.toEqual({
      id: "baseline",
      kind: "BASELINE",
    });
  });

  it("requires confirmation and a stable request key for a field update DTO", async () => {
    const invalid = Object.assign(new FieldUpdateDto(), {
      requestId: "short",
      inputMode: "TEXT",
      confirmedText: "Da den",
      confirmedByUser: false,
    });

    const errors = await validate(invalid);
    expect(errors.map((error) => error.property).sort()).toEqual(
      expect.arrayContaining(["confirmedByUser", "requestId"]),
    );
  });
});
