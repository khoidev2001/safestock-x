type ContactEnvironment = Record<string, string | undefined>;

export interface PublicCommuneContact {
  communeName: string;
  scope: "HOME" | "NEIGHBOR";
  contactTitle: "Chủ tịch UBND xã";
  phone: string | null;
}

const COMMUNE_CONTACT_CONFIG = [
  {
    communeName: "Đồng Xuân",
    scope: "HOME",
    envKey: "COMMUNE_CONTACT_DONG_XUAN",
  },
  {
    communeName: "Xuân Thọ",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_THO",
  },
  {
    communeName: "Tuy An Bắc",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_TUY_AN_BAC",
  },
  {
    communeName: "Tuy An Tây",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_TUY_AN_TAY",
  },
  {
    communeName: "Xuân Lãnh",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_LANH",
  },
  {
    communeName: "Phú Mỡ",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_PHU_MO",
  },
  {
    communeName: "Xuân Phước",
    scope: "NEIGHBOR",
    envKey: "NEIGHBOR_CONTACT_XUAN_PHUOC",
  },
] as const;

export function getPublicCommuneContacts(
  environment: ContactEnvironment = process.env,
): PublicCommuneContact[] {
  return COMMUNE_CONTACT_CONFIG.map((contact) => ({
    communeName: contact.communeName,
    scope: contact.scope,
    contactTitle: "Chủ tịch UBND xã",
    phone: readConfiguredPhone(contact.envKey, environment),
  }));
}

export function getVerifiedNeighborContact(
  commune: string,
  environment: ContactEnvironment = process.env,
): string | null {
  const contact = COMMUNE_CONTACT_CONFIG.find(
    (candidate) => candidate.scope === "NEIGHBOR" && candidate.communeName === commune,
  );
  if (!contact) return null;

  const phone = readConfiguredPhone(contact.envKey, environment);
  return phone ? `Chủ tịch UBND xã: ${phone}` : null;
}

function readConfiguredPhone(envKey: string, environment: ContactEnvironment): string | null {
  const configuredPhone = environment[envKey]?.trim();
  if (!configuredPhone) return null;

  const normalizedPhone = configuredPhone.replace(/[\s.()-]/g, "");
  if (!/^0\d{9,10}$/.test(normalizedPhone)) {
    throw new Error(`Invalid verified neighbor contact in ${envKey}`);
  }

  return normalizedPhone;
}
