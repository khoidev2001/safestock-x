import { apiFetch } from "./api";

export interface AdminHamlet {
  id: string;
  communeId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  verified: boolean;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface SaveHamletInput {
  name: string;
  communeId?: string;
  aliases?: string[];
  lat?: number | null;
  lng?: number | null;
  verified?: boolean;
}

export function listHamlets(communeId?: string): Promise<AdminHamlet[]> {
  const query = communeId ? `?communeId=${encodeURIComponent(communeId)}` : "";
  return apiFetch<AdminHamlet[]>(`/api/admin/hamlets${query}`);
}

export function createHamlet(input: SaveHamletInput): Promise<AdminHamlet> {
  return apiFetch<AdminHamlet>("/api/admin/hamlets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateHamlet(id: string, input: SaveHamletInput): Promise<AdminHamlet> {
  return apiFetch<AdminHamlet>(`/api/admin/hamlets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
