import { Test } from "@nestjs/testing";
import request from "supertest";
import { CommuneContactController } from "../commune-contact.controller";

const CONTACT_ENV_KEYS = [
  "COMMUNE_CONTACT_DONG_XUAN",
  "NEIGHBOR_CONTACT_XUAN_THO",
  "NEIGHBOR_CONTACT_TUY_AN_BAC",
  "NEIGHBOR_CONTACT_TUY_AN_TAY",
  "NEIGHBOR_CONTACT_XUAN_LANH",
  "NEIGHBOR_CONTACT_PHU_MO",
  "NEIGHBOR_CONTACT_XUAN_PHUOC",
] as const;

describe("CommuneContactController", () => {
  const originalEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of CONTACT_ENV_KEYS) {
      originalEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of CONTACT_ENV_KEYS) {
      const original = originalEnvironment.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    originalEnvironment.clear();
  });

  it("serves the list over HTTP without authentication", async () => {
    process.env.COMMUNE_CONTACT_DONG_XUAN = "0200 000 0000";
    const moduleRef = await Test.createTestingModule({
      controllers: [CommuneContactController],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();

    await request(app.getHttpServer())
      .get("/api/public/commune-contacts")
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(7);
        expect(response.body[0]).toMatchObject({
          communeName: "Đồng Xuân",
          scope: "HOME",
          phone: "02000000000",
        });
      });

    await app.close();
  });

  it("returns configured public numbers and preserves missing contacts as null", () => {
    process.env.COMMUNE_CONTACT_DONG_XUAN = "0200 000 0000";
    process.env.NEIGHBOR_CONTACT_TUY_AN_TAY = "090.0000.001";

    const contacts = new CommuneContactController().list();

    expect(contacts).toHaveLength(7);
    expect(contacts[0]).toMatchObject({
      communeName: "Đồng Xuân",
      scope: "HOME",
      phone: "02000000000",
    });
    expect(contacts.find((contact) => contact.communeName === "Tuy An Tây")).toMatchObject({
      scope: "NEIGHBOR",
      phone: "0900000001",
    });
    expect(contacts.find((contact) => contact.communeName === "Xuân Thọ")?.phone).toBeNull();
  });
});
