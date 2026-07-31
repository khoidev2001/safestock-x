import { BadRequestException } from "@nestjs/common";
import { MissionService } from "../mission.service";

function makeService(input: {
  warehouse?: { organizationId: string; communeId: string } | null;
  hamlets?: unknown[];
}) {
  const prisma = {
    warehouse: { findUnique: jest.fn().mockResolvedValue(input.warehouse ?? null) },
    hamlet: { findMany: jest.fn().mockResolvedValue(input.hamlets ?? []) },
  };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe("MissionService location resolution", () => {
  it("rejects planning when neither a verified place nor coordinates are provided", async () => {
    const { service, prisma } = makeService({});

    await expect(
      (
        service as unknown as {
          resolveIncidentLocation: (
            warehouseId: string,
            location?: string,
            point?: { lat: number; lng: number },
          ) => Promise<unknown>;
        }
      ).resolveIncidentLocation("warehouse-1"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BadRequestException>>({
        message: expect.stringContaining("Cần xác nhận địa điểm ứng phó"),
      }),
    );
    expect(prisma.warehouse.findUnique).not.toHaveBeenCalled();
    expect(prisma.hamlet.findMany).not.toHaveBeenCalled();
  });

  it("resolves an exact normalized alias in the warehouse org and commune", async () => {
    const hamlet = {
      id: "hamlet-1",
      name: "Tân Bình",
      lat: 13.42,
      lng: 109.08,
      verified: true,
    };
    const { service, prisma } = makeService({
      warehouse: { organizationId: "org-1", communeId: "dong-xuan" },
      hamlets: [hamlet],
    });

    await expect(
      (
        service as unknown as {
          resolveIncidentLocation: (warehouseId: string, location: string) => Promise<unknown>;
        }
      ).resolveIncidentLocation("warehouse-1", "TÂN-BÌNH"),
    ).resolves.toEqual({
      hamletId: "hamlet-1",
      name: "Tân Bình",
      point: { lat: 13.42, lng: 109.08 },
    });
    expect(prisma.hamlet.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        communeId: "dong-xuan",
        aliases: { has: "tan binh" },
      },
    });
  });

  it.each([
    [[], "Chưa nhận diện được"],
    [[{ id: "h1" }, { id: "h2" }], "đang mơ hồ"],
    [[{ id: "h1", name: "Tân Bình", verified: false, lat: 13, lng: 109 }], "chưa có điểm ứng phó"],
  ])("rejects unresolved or unverified location", async (hamlets, message) => {
    const { service } = makeService({
      warehouse: { organizationId: "org-1", communeId: "dong-xuan" },
      hamlets,
    });

    await expect(
      (
        service as unknown as {
          resolveIncidentLocation: (warehouseId: string, location: string) => Promise<unknown>;
        }
      ).resolveIncidentLocation("warehouse-1", "Tân Bình"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BadRequestException>>({
        message: expect.stringContaining(message),
      }),
    );
  });
});
