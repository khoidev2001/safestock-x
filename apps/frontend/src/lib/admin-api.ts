import { apiFetch } from "./api";
import type { UserRole } from "@safestock/shared-types";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  warehouseId: string | null;
  createdAt?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  warehouseId?: string;
}

export function listUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>("/api/admin/users");
}

export function createUser(input: CreateUserInput): Promise<AdminUser> {
  return apiFetch<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(input) });
}

export function deleteUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}
