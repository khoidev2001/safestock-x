import { getVerifiedCommuneReferencePoint } from "./verified-warehouse-location";
import type { PublicCommuneContact } from "@safestock/shared-types";

export type { PublicCommuneContact } from "@safestock/shared-types";

type ContactEnvironment = Record<string, string | undefined>;

const COMMUNE_CONTACT_CONFIG = [
  {
    communeName: "Đồng Xuân",
    scope: "HOME",
    envKey: "COMMUNE_CONTACT_DONG_XUAN",
    defaultPhone: "02573872145",
  },
  {
    communeName: "Xuân Thọ",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_THO",
    defaultPhone: null,
  },
  {
    communeName: "Tuy An Bắc",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_TUY_AN_BAC",
    defaultPhone: "0393158933",
  },
  {
    communeName: "Tuy An Tây",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_TUY_AN_TAY",
    defaultPhone: "0889439444",
  },
  {
    communeName: "Xuân Lãnh",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_LANH",
    defaultPhone: null,
  },
  {
    communeName: "Phú Mỡ",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_PHU_MO",
    defaultPhone: null,
  },
  {
    communeName: "Xuân Phước",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_PHUOC",
    defaultPhone: "0945297456",
  },
] as const;

export function getPublicCommuneContacts(
  environment: ContactEnvironment = process.env,
): PublicCommuneContact[] {
  return COMMUNE_CONTACT_CONFIG.map((contact) => {
    const referencePoint = getVerifiedCommuneReferencePoint(contact.communeName);
    if (!referencePoint) {
      throw new Error(`Missing verified commune reference point for ${contact.communeName}`);
    }

    return {
      communeName: contact.communeName,
      scope: contact.scope,
      contactTitle: "Chủ tịch UBND xã",
      phone: readConfiguredPhone(contact.envKey, contact.defaultPhone, environment),
      availability: contact.scope === "HOME" ? "LOCAL_INVENTORY" : "UNKNOWN",
      referencePoint,
    };
  });
}

export function getVerifiedNeighborContact(
  commune: string,
  environment: ContactEnvironment = process.env,
): string | null {
  const contact = COMMUNE_CONTACT_CONFIG.find(
    (candidate) => candidate.scope === "NEIGHBOR" && candidate.communeName === commune,
  );
  if (!contact) return null;

  const phone = readConfiguredPhone(contact.envKey, contact.defaultPhone, environment);
  return phone ? `Chủ tịch UBND xã: ${phone}` : null;
}

function readConfiguredPhone(
  envKey: string,
  defaultPhone: string | null,
  environment: ContactEnvironment,
): string | null {
  const configuredPhone = environment[envKey]?.trim() || defaultPhone;
  if (!configuredPhone) return null;

  const normalizedPhone = configuredPhone.replace(/[\s.()-]/g, "");
  if (!/^0\d{9,10}$/.test(normalizedPhone)) {
    throw new Error(`Invalid verified neighbor contact in ${envKey}`);
  }

  return normalizedPhone;
}
