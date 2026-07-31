import { EXTERNAL_CONTACT_DISCLAIMER } from "@safestock/shared-types";
import { CoordinationSnapshotService } from "../coordination-snapshot.service";

const mission = {
  id: "mission-1",
  warehouseId: "central",
  location: "Thôn Phước Lộc",
  incidentType: "FLOOD",
  affectedPeople: 18,
  durationHours: 24,
  fulfillment: 60,
  incidentLat: 13.36,
  incidentLng: 109.1,
  reportText: "Lũ tại thôn Phước Lộc, 18 người bị ảnh hưởng.",
  warehouse: { id: "central", name: "Kho UBND Đồng Xuân", lat: 13.3782, lng: 109.1043 },
  requirements: [
    {
      sku: "water",
      itemName: "Nước uống",
      unit: "chai",
      required: 36,
      allocated: 20,
      shortage: 16,
      allocations: [{ warehouseId: "central", warehouseName: "Kho UBND Đồng Xuân", qty: 20 }],
    },
  ],
};

function extraction() {
  return {
    schemaVersion: "situation-extraction.v1" as const,
    facts: [
      {
        id: "F1",
        key: "INCIDENT_TYPE" as const,
        provenance: "REPORTED" as const,
        value: "FLOOD",
        qualifier: "EXACT" as const,
        source: {
          sourceType: "USER_REPORT" as const,
          sourceId: "mission-1",
          excerpt: "Lũ",
          capturedAt: null,
        },
      },
      {
        id: "F2",
        key: "AFFECTED_PEOPLE" as const,
        provenance: "REPORTED" as const,
        value: 18,
        qualifier: "EXACT" as const,
        source: {
          sourceType: "USER_REPORT" as const,
          sourceId: "mission-1",
          excerpt: "18 người",
          capturedAt: null,
        },
      },
    ],
    missingData: [],
    conflicts: [],
    priorityQuestion: null,
  };
}

function makeService() {
  const prisma = {
    mission: { findUnique: jest.fn().mockResolvedValue(mission) },
    warehouse: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: "central", name: "Kho UBND Đồng Xuân", lat: 13.3782, lng: 109.1043 },
        ]),
    },
    missionAnalysisSnapshot: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    missionFieldUpdate: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  const weather = {
    forecastRain: jest.fn().mockResolvedValue({
      totalRainMm: 125,
      alert: true,
      periodHours: 72,
      fetchedAt: "2026-07-28T01:00:00.000Z",
      source: "open-meteo",
      daily: [],
    }),
  };
  const routing = {
    route: jest.fn().mockResolvedValue({
      status: "ROUTED",
      distanceKm: 2.4,
      etaMinutes: 8,
      graphVersion: "dong-xuan-v1",
      geometry: {
        type: "LineString",
        coordinates: [
          [109.1043, 13.3782],
          [109.1, 13.36],
        ],
      },
      engine: "local-osrm",
    }),
  };
  return {
    prisma,
    weather,
    routing,
    service: new CoordinationSnapshotService(prisma as never, weather as never, routing as never),
  };
}

describe("CoordinationSnapshotService", () => {
  it("computes a reproducible read-only snapshot from backend data", async () => {
    const { service, prisma } = makeService();

    const result = await service.compute("mission-1", extraction(), {
      now: new Date("2026-07-28T01:05:00.000Z"),
    });

    expect(result.analysis.requirements.status).toBe("COMPUTED");
    expect(result.analysis.coordination.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ warehouseId: "central", quantity: 20, routeStatus: "AVAILABLE" }),
      ]),
    );
    expect(result.analysis.forecasts).toEqual(
      expect.arrayContaining([expect.objectContaining({ horizonHours: 72, status: "COMPUTED" })]),
    );
    expect(result.snapshotInput.routeSnapshots).toEqual([
      {
        routeId: "route:mission-1:central",
        geometry: {
          type: "LineString",
          coordinates: [
            [109.1043, 13.3782],
            [109.1, 13.36],
          ],
        },
        roadRefs: [],
      },
    ]);
    expect(prisma.missionAnalysisSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.missionFieldUpdate.create).not.toHaveBeenCalled();
  });

  it("offers external contacts only after local shortage and never claims external stock", async () => {
    const { service } = makeService();

    const result = await service.compute("mission-1", extraction(), {
      now: new Date("2026-07-28T01:05:00.000Z"),
    });

    expect(result.analysis.coordination.externalContacts.length).toBeGreaterThan(0);
    expect(result.analysis.coordination.externalContacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          availability: "UNKNOWN",
          disclaimer: EXTERNAL_CONTACT_DISCLAIMER,
        }),
      ]),
    );
  });

  it("keeps an unavailable weather source unknown instead of turning it into zero", async () => {
    const { service, weather } = makeService();
    weather.forecastRain.mockResolvedValue(null);

    const result = await service.compute("mission-1", extraction(), {
      now: new Date("2026-07-28T01:05:00.000Z"),
    });

    expect(result.analysis.forecasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ horizonHours: 72, status: "UNAVAILABLE", risk: null }),
      ]),
    );
  });
});
