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

  it.each([
    ["Tuy An Bắc", "0393158933"],
    ["Tuy An Tây", "0889439444"],
    ["Xuân Phước", "0945297456"],
  ])("uses the confirmed public number for %s when no override is configured", (commune, phone) => {
    expect(getVerifiedNeighborContact(commune, {})).toBe(`Chủ tịch UBND xã: ${phone}`);
  });

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

    expect(
      contacts.map(
        ({ communeName, scope, contactTitle, phone, availability, referencePoint }) => ({
          communeName,
          scope,
          contactTitle,
          phone,
          availability,
          referencePoint,
        }),
      ),
    ).toEqual([
      {
        communeName: "Đồng Xuân",
        scope: "HOME",
        contactTitle: "Chủ tịch UBND xã",
        phone: "02000000000",
        availability: "LOCAL_INVENTORY",
        referencePoint: {
          name: "UBND Xã Đồng Xuân",
          kind: "COMMUNE_PEOPLES_COMMITTEE",
          address: "94H3+7PR, La Hai, Đồng Xuân, Đắk Lắk, Việt Nam",
          plusCode: "94H3+7PR",
          lat: 13.3782428,
          lng: 109.104259,
          verificationStatus: "MAP_VERIFIED",
          verifiedAt: "2026-07-28",
          sourceUrl: "https://www.google.com/maps?q=13.3782428,109.104259",
        },
      },
      {
        communeName: "Xuân Thọ",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Xuân Thọ",
          lat: 13.4163942,
          lng: 109.2133158,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
      {
        communeName: "Tuy An Bắc",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: "0900000001",
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Tuy An Bắc",
          lat: 13.3084738,
          lng: 109.2151581,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
      {
        communeName: "Tuy An Tây",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: "0889439444",
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Tuy An Tây",
          lat: 13.3021866,
          lng: 109.1608402,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
      {
        communeName: "Xuân Lãnh",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Xuân Lãnh",
          lat: 13.4890203,
          lng: 109.0306681,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
      {
        communeName: "Phú Mỡ",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: null,
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Phú Mỡ",
          lat: 13.3560758,
          lng: 108.9823087,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
      {
        communeName: "Xuân Phước",
        scope: "NEIGHBOR",
        contactTitle: "Chủ tịch UBND xã",
        phone: "0945297456",
        availability: "UNKNOWN",
        referencePoint: expect.objectContaining({
          name: "UBND Xã Xuân Phước",
          lat: 13.2972273,
          lng: 109.0649619,
          verificationStatus: "MAP_VERIFIED",
        }),
      },
    ]);
  });
});
