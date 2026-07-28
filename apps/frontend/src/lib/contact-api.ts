import { apiFetch } from "./api";

export interface PublicCommuneContact {
  communeName: string;
  scope: "HOME" | "NEIGHBOR";
  contactTitle: string;
  phone: string | null;
}

export function getPublicCommuneContacts(): Promise<PublicCommuneContact[]> {
  return apiFetch<PublicCommuneContact[]>("/api/public/commune-contacts");
}

export function formatPublicPhone(phone: string): string {
  if (/^\d{11}$/.test(phone)) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  if (/^\d{10}$/.test(phone)) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone;
}
