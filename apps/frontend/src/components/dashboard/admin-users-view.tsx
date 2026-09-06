"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useMemo, useState } from "react";
import { getClusterWarehouses } from "@/lib/mission-api";
import {
  deleteUser,
  listUsers,
  updateUserPassword,
  updateUserPhone,
  type AdminUser,
} from "@/lib/admin-api";
import { useAuth } from "@/lib/auth-store";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { FIELD_FORCE_ROLE_LABEL, userRoleLabel } from "@safestock/shared-types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { stripDiacritics } from "@/lib/vi-text";
import { CreateUserDialog } from "./create-user-dialog";

/** Cùng luật với hồ sơ cá nhân và với DTO của máy chủ — ba nơi phải nói một luật. */
const PHONE_PATTERN = /^[+0-9][0-9 .()-]{7,19}$/;

/**
 * Bộ lọc gộp super admin chung nhóm "Quản trị": hai bậc chỉ khác nhau ở quyền quản lý
 * tài khoản, còn khi cần trả lời "ai đang có quyền quản trị xã" thì phải thấy cả hai.
 */
const FILTERS = [
  { key: "ALL", label: "Tất cả", match: () => true },
  { key: "ADMIN", label: "Quản trị", match: (u: AdminUser) => u.role === "ADMIN" },
  { key: "WAREHOUSE", label: "Phụ trách kho", match: (u: AdminUser) => u.role === "WAREHOUSE" },
  { key: "RESCUE", label: FIELD_FORCE_ROLE_LABEL, match: (u: AdminUser) => u.role === "RESCUE" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** ADMIN xã quản lý tài khoản: tạo người phụ trách kho, hiện trường và quản trị. */
export function AdminUsersView({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });
  const whQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
  });

  const isSuperAdmin = Boolean(useAuth((state) => state.user?.isSuperAdmin));
  const currentUserId = useAuth((state) => state.user?.id);

  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordEdit, setPasswordEdit] = useState({ userId: "", password: "" });
  const [phoneEdit, setPhoneEdit] = useState({ userId: "", phone: "" });
  /**
   * Việc đang chờ người dùng xác nhận, hoặc `null` khi không hỏi gì.
   *
   * Giữ nguyên hàm sẽ chạy thay vì chỉ giữ một cái cờ: hộp thoại không cần biết
   * nó đang hỏi hộ ai, và mỗi chỗ gọi tự viết câu hỏi đúng với việc của mình.
   */
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Chưa xóa được tài khoản này."),
  });

  const changePassword = useMutation({
    mutationFn: () => updateUserPassword(passwordEdit.userId, passwordEdit.password),
    onSuccess: () => {
      setPasswordEdit({ userId: "", password: "" });
      setErr(null);
      setNotice("Đã đổi mật khẩu. Hãy báo mật khẩu mới cho chủ tài khoản.");
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Chưa đổi được mật khẩu."),
  });

  const changePhone = useMutation({
    mutationFn: () => updateUserPhone(phoneEdit.userId, phoneEdit.phone.trim() || null),
    onSuccess: (updated) => {
      setPhoneEdit({ userId: "", phone: "" });
      setErr(null);
      setNotice(
        updated.phone ? `Đã lưu số ${updated.phone}.` : "Đã xoá số điện thoại của tài khoản này.",
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Chưa lưu được số điện thoại."),
  });

  const warehouses = whQuery.data ?? [];
  const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, users.filter((u) => f.match(u)).length]),
      ) as Record<FilterKey, number>,
    [users],
  );
  const visible = useMemo(() => {
    const byRole = users.filter(FILTERS.find((f) => f.key === filter)!.match);
    const query = stripDiacritics(search);
    if (!query) return byRole;
    // Tìm cả theo tên đăng nhập: nó hiện ngay cạnh họ tên trên cùng một dòng,
    // và người quen hệ thống nhớ "kho.longchau" nhanh hơn nhớ họ tên đầy đủ.
    return byRole.filter(
      (u) => stripDiacritics(u.fullName).includes(query) || stripDiacritics(u.email).includes(query),
    );
  }, [users, filter, search]);
  const pagination = usePagination(visible);

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ColorIcon name="users" size={20} tone="blue" />
          <span>Danh sách tài khoản ({users.length})</span>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px"
          onClick={() => setIsCreateOpen(true)}
          type="button"
        >
          <ColorIcon name="addUser" size={18} tone="green" /> Tạo tài khoản
        </button>
      </div>

      {/* Lọc theo vai và tìm theo tên đứng CHUNG một hàng: cả hai đều là cách thu
          hẹp cùng một danh sách, tách hai tầng thì mắt phải quét hai lần cho một
          việc. Màn hẹp thì ô tìm tự xuống dòng dưới dãy chip. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo vai trò">
          {FILTERS.map((f) => (
            <button
              aria-pressed={filter === f.key}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
                filter === f.key
                  ? "border-transparent bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                pagination.setPage(1);
              }}
              type="button"
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>

        {/* Một xã có hàng chục tài khoản, mà lúc cần gọi gấp thì người trực chỉ
            nhớ tên người chứ không nhớ họ đứng ở trang thứ mấy. */}
        <label className="sr-only" htmlFor="tim-tai-khoan">
          Tìm tài khoản theo tên
        </label>
        <input
          className="min-w-56 flex-1 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 sm:max-w-xs"
          id="tim-tai-khoan"
          onChange={(event) => {
            setSearch(event.target.value);
            pagination.setPage(1);
          }}
          placeholder="Tìm theo tên hoặc tên đăng nhập"
          type="search"
          value={search}
        />
      </div>

      <div aria-live="polite" className="min-h-4 pt-2">
        {err ? <p className="text-xs text-[var(--color-critical)]">{err}</p> : null}
        {notice ? <p className="text-xs text-[var(--color-accent)]">{notice}</p> : null}
      </div>

      <ul className="mt-2 divide-y">
        {pagination.pageItems.length === 0 ? (
          <li className="py-6 text-center text-sm text-[var(--text-muted)]">
            {search
              ? `Không có tài khoản nào khớp “${search}”.`
              : "Không có tài khoản nào thuộc nhóm này."}
          </li>
        ) : null}
        {pagination.pageItems.map((u) => {
          // Tài khoản bậc quản trị chỉ super admin mới đụng vào được — kể cả đổi mật
          // khẩu, vì đổi được mật khẩu là chiếm được tài khoản. Super admin thì không
          // ai xoá. Nút bị ẩn cho khớp với luật ở backend, chứ luật thật nằm ở backend.
          const canManage = isSuperAdmin || u.role !== "ADMIN";
          const canDelete = canManage && !u.isSuperAdmin && u.id !== currentUserId;
          return (
            <li className="py-3" key={u.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.fullName}{" "}
                    <span className="text-xs text-[var(--text-muted)]">· {u.email}</span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {userRoleLabel(u.role, { isSuperAdmin: u.isSuperAdmin })}
                    {u.warehouseId
                      ? ` · ${nameById.get(u.warehouseId) ?? "kho thôn"}`
                      : u.role === "WAREHOUSE"
                        ? " · toàn xã"
                        : ""}
                    {u.notificationEmailVerifiedAt && u.notificationEmail
                      ? ` · ${u.notificationEmail} (đã xác minh)`
                      : ""}
                  </p>
                  {/* Số gọi được, ngay tại dòng của người giữ kho.
                      Lúc cần chi viện thì việc tiếp theo luôn là gọi cho người
                      đó — bắt người trực chép số sang máy khác để bấm là thêm
                      một chỗ chép nhầm giữa lúc đang gấp. */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {u.phone ? (
                      <a
                        className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-accent)] hover:underline"
                        href={`tel:${u.phone.replace(/[^+0-9]/g, "")}`}
                      >
                        <ColorIcon name="phone" size={14} tone="green" />
                        {u.phone}
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">Chưa có số điện thoại</span>
                    )}
                    <button
                      className="text-[var(--text-muted)] underline-offset-2 hover:underline"
                      onClick={() => setPhoneEdit({ userId: u.id, phone: u.phone ?? "" })}
                      type="button"
                    >
                      {u.phone ? "Sửa số" : "Thêm số"}
                    </button>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canManage ? (
                    <button
                      aria-label={`Đổi mật khẩu cho ${u.fullName}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)]"
                      onClick={() => setPasswordEdit({ userId: u.id, password: "" })}
                      title="Đổi mật khẩu"
                      type="button"
                    >
                      <ColorIcon name="key" size={18} tone="amber" />
                    </button>
                  ) : undefined}
                  {canDelete ? (
                    <button
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                      disabled={remove.isPending}
                      onClick={() =>
                        setPendingAction({
                          title: `Xoá tài khoản ${u.fullName}?`,
                          message:
                            "Người này sẽ mất quyền đăng nhập ngay lập tức và không nhận được thông báo điều phối nữa. Tài khoản đã xoá không khôi phục lại được.",
                          confirmLabel: "Xoá tài khoản",
                          run: () => remove.mutate(u.id),
                        })
                      }
                      title="Xóa tài khoản"
                      type="button"
                    >
                      <ColorIcon name="delete" size={18} tone="red" />
                    </button>
                  ) : undefined}
                </div>
              </div>
              {passwordEdit.userId === u.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 bg-[var(--surface-2)] p-3">
                  <input
                    aria-label={`Mật khẩu mới cho ${u.fullName}`}
                    autoComplete="new-password"
                    className="min-w-56 flex-1 rounded-md border bg-[var(--surface)] px-3 text-sm"
                    minLength={8}
                    onChange={(event) =>
                      setPasswordEdit({ ...passwordEdit, password: event.target.value })
                    }
                    placeholder="Mật khẩu mới, ít nhất 8 ký tự"
                    type="password"
                    value={passwordEdit.password}
                  />
                  <button
                    aria-label="Lưu mật khẩu mới"
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-critical)] px-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={passwordEdit.password.length < 8 || changePassword.isPending}
                    onClick={() =>
                      setPendingAction({
                        title: `Đổi mật khẩu của ${u.fullName}?`,
                        message:
                          "Đây là hành động nguy hiểm. Mật khẩu cũ mất hiệu lực ngay, và người này sẽ KHÔNG đăng nhập được cho tới khi bạn báo tận tay mật khẩu mới — kể cả khi họ đang ở ngoài hiện trường. Hệ thống không gửi mật khẩu mới cho họ, và không ai xem lại được nó sau khi bạn rời màn hình này.",
                        confirmLabel: "Đổi mật khẩu",
                        run: () => changePassword.mutate(),
                      })
                    }
                    type="button"
                  >
                    <ColorIcon mono name="save" size={18} /> Đổi mật khẩu
                  </button>
                  <button
                    aria-label="Hủy đổi mật khẩu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-[var(--surface)]"
                    onClick={() => setPasswordEdit({ userId: "", password: "" })}
                    type="button"
                  >
                    <ColorIcon name="close" size={18} tone="red" />
                  </button>
                </div>
              ) : null}

              {phoneEdit.userId === u.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 bg-[var(--surface-2)] p-3">
                  <input
                    aria-label={`Số điện thoại của ${u.fullName}`}
                    className="min-w-56 flex-1 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                    inputMode="tel"
                    onChange={(event) => setPhoneEdit({ ...phoneEdit, phone: event.target.value })}
                    placeholder="Ví dụ: 0912345678 — để trống là xoá số"
                    type="tel"
                    value={phoneEdit.phone}
                  />
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
                    // Số sai định dạng thì chặn ngay tại đây thay vì để máy chủ
                    // trả lỗi: người nhập thấy nút không bấm được là biết số chưa
                    // đúng, không phải đợi một vòng mạng mới biết.
                    disabled={
                      changePhone.isPending ||
                      (phoneEdit.phone.trim().length > 0 &&
                        !PHONE_PATTERN.test(phoneEdit.phone.trim()))
                    }
                    onClick={() => changePhone.mutate()}
                    type="button"
                  >
                    <ColorIcon mono name="save" size={18} /> Lưu số
                  </button>
                  <button
                    aria-label="Huỷ sửa số điện thoại"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-[var(--surface)]"
                    onClick={() => setPhoneEdit({ userId: "", phone: "" })}
                    type="button"
                  >
                    <ColorIcon name="close" size={18} tone="red" />
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={visible.length}
        totalPages={pagination.totalPages}
      />

      <ConfirmDialog
        cancelLabel="Huỷ"
        confirmLabel={pendingAction?.confirmLabel ?? "Xác nhận"}
        message={pendingAction?.message ?? ""}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          pendingAction?.run();
          setPendingAction(null);
        }}
        open={pendingAction !== null}
        title={pendingAction?.title ?? ""}
      />

      <CreateUserDialog
        isOpen={isCreateOpen}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(user) => {
          setIsCreateOpen(false);
          setErr(null);
          setNotice(`Đã tạo tài khoản ${user.fullName}.`);
          qc.invalidateQueries({ queryKey: ["admin-users"] });
        }}
        warehouseId={warehouseId}
      />
    </section>
  );
}
