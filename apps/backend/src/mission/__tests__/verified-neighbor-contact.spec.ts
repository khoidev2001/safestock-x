import {
  getPublicCommuneContacts,
  getVerifiedNeighborContact,
} from "../../../prisma/verified-neighbor-contact";

describe("verified neighbor contact configuration", () => {
  it.each([
    ["Tuy An Bắc", "NEIGHBOR_CONTACT_TUY_AN_BAC", "0912 345 678", "0912345678"],
    ["Tuy An Tây", "NEIGHBOR_CONTACT_TUY_AN_TAY", "092.3456.789", "0923456789"],
    ["Xuân Phước", "NEIGHBOR_CONTACT_XUAN_PHUOC", "0934-567-890", "0934567890"],
  ])(
    "reads and normalizes the configured phone for %s",
    (commune, envKey, configuredPhone, expectedPhone) => {
      expect(getVerifiedNeighborContact(commune, { [envKey]: configuredPhone })).toBe(
        `Chủ tịch UBND xã: ${expectedPhone}`,
      );
    },
  );

  it.each(["Xuân Thọ", "Xuân Lãnh", "Phú Mỡ"])(
    "keeps %s without an external contact",
    (commune) => {
      expect(getVerifiedNeighborContact(commune, {})).toBeNull();
    },
  );

  it("fails closed when a configured phone is invalid", () => {
    expect(() =>
      getVerifiedNeighborContact("Tuy An Bắc", {
        NEIGHBOR_CONTACT_TUY_AN_BAC: "không-hợp-lệ",
      }),
    ).toThrow("NEIGHBOR_CONTACT_TUY_AN_BAC");
  });

  it("returns Đồng Xuân and all six neighboring communes for the public contact list", () => {
    const contacts = getPublicCommuneContacts({
      COMMUNE_CONTACT_DONG_XUAN: "0200 000 0000",
      NEIGHBOR_CONTACT_TUY_AN_BAC: "0900 000 001",
    });

    expect(contacts).toEqual([
      {
        communeName: "Đồng Xuân",
        scope: "HOME",
        contactTitle: "Chủ tịch UBND xã",
        phone: "02000000000",
      },
      {
        communeName: "Xuân Thọ",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
      },
      {
        communeName: "Tuy An Bắc",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: "0900000001",
      },
      {
        communeName: "Tuy An Tây",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
      },
      {
        communeName: "Xuân Lãnh",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
      },
      {
        communeName: "Phú Mỡ",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
      },
      {
        communeName: "Xuân Phước",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
      },
    ]);
  });
});
