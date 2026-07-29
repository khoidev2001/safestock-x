"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  formatPublicPhone,
  getPublicCommuneContacts,
  type PublicCommuneContact,
} from "@/lib/contact-api";

export default function PublicContactsPage() {
  const contactsQuery = useQuery({
    queryKey: ["public-commune-contacts"],
    queryFn: getPublicCommuneContacts,
    staleTime: 5 * 60_000,
  });

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)]">
      <a className="skip-link" href="#danh-sach-lien-he">
        Chuyển đến danh sách liên hệ
      </a>

      <header className="border-b bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-7">
          <Link aria-label="Ứng phó nhanh - về trang đăng nhập" href="/login">
            <Image
              alt="Ứng phó nhanh"
              className="h-auto w-[190px] md:w-[220px]"
              height={1080}
              priority
              sizes="(min-width: 768px) 220px, 190px"
              src="/brand/ung-pho-nhanh-logo.png"
              width={1920}
            />
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
            href="/login"
          >
            Đăng nhập
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-10 md:px-7 md:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-accent)]">
          Thông tin công khai
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.025em] md:text-4xl">
          Liên hệ UBND Đồng Xuân và các xã lân cận
        </h1>
        <p className="mt-4 max-w-3xl text-base text-[var(--text-muted)]">
          Người dân và lực lượng điều phối có thể gọi trực tiếp các số đã được xác minh. Danh sách
          này chỉ cung cấp thông tin liên hệ, không phản ánh số lượng vật tư cứu trợ.
        </p>

        <div className="app-panel mt-8 overflow-hidden" id="danh-sach-lien-he">
          <div className="border-b bg-[var(--surface-2)] px-5 py-4 md:px-6">
            <h2 className="text-lg font-semibold">Số điện thoại theo xã</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Chạm vào số điện thoại để thực hiện cuộc gọi.
            </p>
          </div>

          {contactsQuery.isPending ? <ContactsLoading /> : null}
          {contactsQuery.isError ? <ContactsError onRetry={() => contactsQuery.refetch()} /> : null}
          {contactsQuery.data ? <ContactList contacts={contactsQuery.data} /> : null}
        </div>
      </section>
    </main>
  );
}

function ContactList({ contacts }: { contacts: PublicCommuneContact[] }) {
  if (contacts.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--text-muted)]" role="status">
        Chưa có thông tin liên hệ.
      </p>
    );
  }

  return (
    <ul className="divide-y" role="list">
      {contacts.map((contact) => (
        <li
          className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,auto)] md:items-center md:px-6"
          key={contact.communeName}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">Xã {contact.communeName}</h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  contact.scope === "HOME"
                    ? "bg-[var(--accent-soft)] text-[var(--color-accent)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                }`}
              >
                {contact.scope === "HOME" ? "Xã chủ quản" : "Xã lân cận"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{contact.contactTitle}</p>
            <p className="mt-2 text-sm font-medium">{contact.referencePoint.name}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {contact.referencePoint.address}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  contact.availability === "LOCAL_INVENTORY"
                    ? "bg-[var(--accent-soft)] text-[var(--color-ready)]"
                    : "bg-[var(--surface-3)] text-[var(--color-attention)]"
                }`}
              >
                {contact.availability === "LOCAL_INVENTORY"
                  ? "Kho nội xã"
                  : "Chưa xác minh tồn kho"}
              </span>
              <a
                className="font-semibold text-[var(--color-accent)] underline-offset-4 hover:underline"
                href={contact.referencePoint.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Mở trên Google Maps
              </a>
            </div>
          </div>

          {contact.phone ? (
            <a
              aria-label={`Gọi ${contact.contactTitle} ${contact.communeName} qua số ${formatPublicPhone(contact.phone)}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px md:justify-self-end"
              href={`tel:${contact.phone}`}
            >
              <ColorIcon name="phone" size={20} tone="green" />
              <span className="tabular">{formatPublicPhone(contact.phone)}</span>
            </a>
          ) : (
            <span className="text-sm font-medium text-[var(--text-muted)] md:justify-self-end">
              Chưa có số điện thoại
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ContactsLoading() {
  return (
    <div aria-busy="true" aria-label="Đang tải danh sách liên hệ" className="divide-y">
      {[0, 1, 2, 3].map((item) => (
        <div
          className="grid animate-pulse gap-3 px-5 py-5 md:grid-cols-[1fr_260px] md:px-6"
          key={item}
        >
          <div className="h-6 max-w-56 rounded bg-[var(--surface-3)]" />
          <div className="h-12 rounded bg-[var(--surface-3)]" />
        </div>
      ))}
    </div>
  );
}

function ContactsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-5 py-8 md:px-6" role="alert">
      <div className="flex items-center gap-2 font-semibold text-[var(--color-critical)]">
        <ColorIcon name="warning" size={20} tone="red" />
        Chưa tải được danh sách liên hệ
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Vui lòng kiểm tra kết nối đến hệ thống và thử lại.
      </p>
      <button
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border bg-[var(--surface)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-2)]"
        onClick={onRetry}
        type="button"
      >
        Thử lại
      </button>
    </div>
  );
}
