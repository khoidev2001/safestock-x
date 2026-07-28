import { UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import {
  assertSeedResetConfirmed,
  buildSeededHamletLeaderInput,
  buildSeededReporterInput,
  getRequiredSecret,
  REPORTER_PASSWORD_ENV,
  requireReportingHamlet,
  reporterLoginForLocationKey,
  warehouseLoginForLocationKey,
  SEED_RESET_CONFIRMATION,
} from "../../../prisma/seed";

describe("per-hamlet REPORTER seed input", () => {
  it("uses the special login and preserves REPORTER warehouse scope", () => {
    const passwordHash = randomBytes(32).toString("base64url");
    const input = buildSeededReporterInput({
      organizationId: "organization-1",
      warehouseId: "warehouse-1",
      warehouseName: "Kho Thôn Một",
      locationKey: "tan-binh",
      passwordHash,
    });

    expect(input).toEqual({
      organizationId: "organization-1",
      email: reporterLoginForLocationKey("tan-binh"),
      passwordHash,
      fullName: "Trưởng thôn Thôn Một",
      role: UserRole.REPORTER,
      warehouseId: "warehouse-1",
    });
  });

  it("keeps hamlet warehouse accounts as WAREHOUSE users", () => {
    const passwordHash = randomBytes(32).toString("base64url");
    expect(
      buildSeededHamletLeaderInput({
        organizationId: "organization-1",
        warehouseId: "warehouse-1",
        warehouseName: "Kho Thôn Một",
        locationKey: "tan-binh",
        passwordHash,
      }),
    ).toEqual({
      organizationId: "organization-1",
      email: warehouseLoginForLocationKey("tan-binh"),
      passwordHash,
      fullName: "Trưởng Thôn Một",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-1",
    });
  });

  it("requires an explicit reset confirmation", () => {
    expect(() => assertSeedResetConfirmed([])).toThrow(SEED_RESET_CONFIRMATION);
    expect(() => assertSeedResetConfirmed([SEED_RESET_CONFIRMATION, "--extra"])).toThrow(
      SEED_RESET_CONFIRMATION,
    );
    expect(() => assertSeedResetConfirmed([SEED_RESET_CONFIRMATION])).not.toThrow();
  });

  it("fails closed when there is no hamlet for the REPORTER", () => {
    expect(() => requireReportingHamlet([])).toThrow("kho thôn");
    expect(requireReportingHamlet([{ id: "warehouse-1" } as never])).toEqual({
      id: "warehouse-1",
    });
  });

  it("requires a non-empty runtime secret", () => {
    const runtimeInput = randomBytes(18).toString("base64url");
    expect(getRequiredSecret(REPORTER_PASSWORD_ENV, { [REPORTER_PASSWORD_ENV]: runtimeInput })).toBe(
      runtimeInput,
    );
    expect(() => getRequiredSecret(REPORTER_PASSWORD_ENV, {})).toThrow(REPORTER_PASSWORD_ENV);
    expect(() =>
      getRequiredSecret(REPORTER_PASSWORD_ENV, { [REPORTER_PASSWORD_ENV]: "   " }),
    ).toThrow(REPORTER_PASSWORD_ENV);
  });
});
