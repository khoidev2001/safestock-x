import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_COMMUNE_WAREHOUSE_LOCATION,
  VERIFIED_COMMUNE_REFERENCE_POINTS,
  VERIFIED_HAMLET_WAREHOUSE_LOCATIONS,
  VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION,
  validateVerifiedWarehouseLocations,
} from "../../../prisma/verified-warehouse-location";

describe("verified warehouse location registry", () => {
  it("has an explicit version for snapshots and audit evidence", () => {
    expect(VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION).toBe("2026-07-28");
  });

  it("uses UBND Đồng Xuân as the operational central warehouse", () => {
    expect(HOME_COMMUNE_WAREHOUSE_LOCATION).toMatchObject({
      name: "UBND Xã Đồng Xuân",
      kind: "COMMUNE_PEOPLES_COMMITTEE",
      lat: 13.3782428,
      lng: 109.104259,
      verificationStatus: "MAP_VERIFIED",
    });
  });

  it("contains exactly seven verified commune reference points", () => {
    expect(Object.keys(VERIFIED_COMMUNE_REFERENCE_POINTS)).toEqual([
      "Đồng Xuân",
      "Xuân Thọ",
      "Tuy An Bắc",
      "Tuy An Tây",
      "Xuân Lãnh",
      "Phú Mỡ",
      "Xuân Phước",
    ]);
  });

  it("contains only the five verified hamlet cultural houses", () => {
    expect(Object.keys(VERIFIED_HAMLET_WAREHOUSE_LOCATIONS)).toEqual([
      "ky-du",
      "phuoc-hue",
      "tan-binh",
      "phu-son",
      "triem-duc",
    ]);
  });

  it("validates coordinate ranges, sources and duplicate coordinates", () => {
    expect(validateVerifiedWarehouseLocations()).toEqual([]);
  });

  it("validates all seed registries before deleting existing data", () => {
    const source = readFileSync(join(__dirname, "../../../prisma/seed.ts"), "utf8");
    const resetIndex = source.indexOf("await resetDatabase()");
    const datasetValidationIndex = source.indexOf("validateSeedDataset()");
    const locationValidationIndex = source.indexOf("validateVerifiedWarehouseLocations()");

    expect(resetIndex).toBeGreaterThan(-1);
    expect(datasetValidationIndex).toBeGreaterThan(-1);
    expect(locationValidationIndex).toBeGreaterThan(-1);
    expect(datasetValidationIndex).toBeLessThan(resetIndex);
    expect(locationValidationIndex).toBeLessThan(resetIndex);
    expect(source).toContain("location: HOME_COMMUNE_WAREHOUSE_LOCATION.address");
    expect(source).toContain("lat: HOME_COMMUNE_WAREHOUSE_LOCATION.lat");
    expect(source).toContain("lng: HOME_COMMUNE_WAREHOUSE_LOCATION.lng");
  });
});
