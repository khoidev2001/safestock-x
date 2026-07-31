import { hamletSeedFromWarehouse } from "../../../prisma/hamlet-backfill";

describe("hamlet backfill", () => {
  it("derives the response-point name without copying a fake coordinate", () => {
    expect(
      hamletSeedFromWarehouse({
        organizationId: "org-1",
        communeId: "dong-xuan",
        name: "Kho thôn Long Châu",
      }),
    ).toEqual({
      organizationId: "org-1",
      communeId: "dong-xuan",
      name: "Long Châu",
      normalizedName: "long chau",
      aliases: ["long chau"],
      lat: null,
      lng: null,
      verified: false,
    });
  });
});
