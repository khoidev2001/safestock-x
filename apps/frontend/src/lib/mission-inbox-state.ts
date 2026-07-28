import type { MissionStatus } from "./mission-api";

export type MissionInboxView = "active" | "closed";
export type MissionInboxRole = "ADMIN" | "RESCUE" | "WAREHOUSE";

export interface MissionInboxPreparation {
  warehouseId: string;
  preparedAt: string | null;
}

export interface MissionInboxItem {
  id: string;
  warehouseId: string;
  incidentType: string;
  location?: string | null;
  hamletName?: string | null;
  affectedPeople: number;
  status: MissionStatus;
  createdAt: string;
  warehousePreparations?: MissionInboxPreparation[];
}

interface MissionInboxFilterOptions {
  view: MissionInboxView;
  search: string;
  role?: MissionInboxRole | string;
  warehouseId?: string | null;
}

const CLOSED_STATUSES = new Set<MissionStatus>(["COMPLETED", "CANCELLED"]);
const INCIDENT_SEARCH_LABELS: Record<string, string> = {
  FLOOD: "lũ lụt",
  STORM: "bão",
  LANDSLIDE: "sạt lở",
  FIRE: "cháy",
  ISOLATION: "cô lập",
  OTHER: "khác",
};

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("vi")
    .trim();

export function missionNeedsAction(
  mission: MissionInboxItem,
  role?: MissionInboxRole | string,
  warehouseId?: string | null,
) {
  if (role === "ADMIN") {
    return ["DRAFT", "REJECTED", "DEFERRED"].includes(mission.status);
  }

  if (role === "RESCUE") {
    return mission.status === "PENDING_RESCUE" || mission.status === "READY";
  }

  if (role !== "WAREHOUSE" || mission.status !== "PENDING_WAREHOUSE" || !warehouseId) {
    return false;
  }

  const preparations = mission.warehousePreparations ?? [];
  if (preparations.length === 0) {
    return mission.warehouseId === warehouseId;
  }

  return preparations.some(
    (preparation) =>
      preparation.warehouseId === warehouseId && preparation.preparedAt === null,
  );
}

export function filterMissionInbox(
  missions: MissionInboxItem[],
  options: MissionInboxFilterOptions,
) {
  const query = normalizeSearchText(options.search);

  return missions
    .filter((mission) => {
      const isClosed = CLOSED_STATUSES.has(mission.status);
      if ((options.view === "closed") !== isClosed) {
        return false;
      }

      if (!query) {
        return true;
      }

      return normalizeSearchText(
        [
          mission.incidentType,
          INCIDENT_SEARCH_LABELS[mission.incidentType] ?? "",
          mission.location ?? "",
          mission.status,
          mission.affectedPeople.toString(),
        ].join(" "),
      ).includes(query);
    })
    .sort((left, right) => {
      const leftNeedsAction = missionNeedsAction(
        left,
        options.role,
        options.warehouseId,
      );
      const rightNeedsAction = missionNeedsAction(
        right,
        options.role,
        options.warehouseId,
      );

      if (leftNeedsAction !== rightNeedsAction) {
        return leftNeedsAction ? -1 : 1;
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
}

export function missionDeepLink(missionId: string) {
  const normalizedId = missionId.trim();
  return normalizedId ? `/mission?mission=${encodeURIComponent(normalizedId)}` : "/mission";
}
