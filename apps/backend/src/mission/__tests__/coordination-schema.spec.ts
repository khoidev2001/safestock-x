import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");
const seed = readFileSync(join(__dirname, "../../../prisma/seed.ts"), "utf8");

describe("coordination AI persistence schema", () => {
  it("adds immutable analysis snapshots and confirmed field updates without changing Mission", () => {
    expect(schema).toContain("enum MissionAnalysisSnapshotKind");
    expect(schema).toContain("enum FieldUpdateInputMode");
    expect(schema).toContain("model MissionAnalysisSnapshot");
    expect(schema).toContain("model MissionFieldUpdate");
    expect(schema).toContain("@@unique([missionId, requestId])");
    expect(schema).toContain("@@unique([missionId, actorId, requestId])");
    expect(schema).toContain("baselineSnapshotId");
    expect(schema).toContain("confirmedText");
    expect(schema).not.toContain("assigneeId");
    expect(schema).not.toContain("gpsTrack");
    expect(schema).not.toContain("imageUrl");
  });

  it("deletes dependent coordination records before missions during an explicit seed reset", () => {
    expect(seed.indexOf("prisma.missionFieldUpdate.deleteMany()")).toBeGreaterThan(-1);
    expect(seed.indexOf("prisma.missionAnalysisSnapshot.deleteMany()")).toBeGreaterThan(-1);
    expect(seed.indexOf("prisma.missionFieldUpdate.deleteMany()")).toBeLessThan(
      seed.indexOf("prisma.mission.deleteMany()"),
    );
    expect(seed.indexOf("prisma.missionAnalysisSnapshot.deleteMany()")).toBeLessThan(
      seed.indexOf("prisma.mission.deleteMany()"),
    );
  });
});
