---
title: "P0-3 Inventory transfer atomic"
date: 2026-07-24
type: technical-journal
status: completed
authority: historical-only
---

# P0-3 Inventory transfer atomic

## Context

Journal ghi lai lich su hoan tat P0-3 ngay 2026-07-24; khong phai authority hien hanh. Truoc thay doi, API transfer ghi `quantity` vao ledger/audit nhung di chuyen ca batch, thieu scope nguon/dich, va co the lost update hoac double-ledger khi request dong thoi.

## What Happened

1. Tach transaction helper `inventory-transfer.ts`; partial transfer giam batch nguon va tao child tai ke dich, full transfer giu batch ID va chi doi shelf.
2. Dua doc nguon/dich, authorize, mutation, ledger va audit vao cung Prisma transaction; controller truyen warehouse scope tu JWT.
3. Enforce scope kho cho ca nguon va dich. Scope null van chi cho phep lien kho trong cung organization va commune cua actor.
4. Tu choi batch co loan mo, dong thoi harden de tu choi `circulation=ON_LOAN` ngay ca khi loan record bi lech/thieu.
5. Them unit va PostgreSQL E2E cho partial/full, IDOR, invalid quantity/same shelf, CAS race, rollback, loan, audit lineage, readiness hau commit va cleanup fixture.
6. Khong doi route, DTO hay Prisma schema; khong migration, seed hoac reset du lieu.

## Key Decisions/Tradeoffs

- Partial dung CAS decrement theo batch ID, source shelf va `quantity >= requested`; full dung CAS move theo batch ID, source shelf va exact quantity. Request thua race tra conflict va khong ghi ledger/audit rac.
- Full transfer giu ID de bao toan lineage; partial tao child code UUID de tranh collision ma khong can schema moi.
- Organization + commune la bien scope toi thieu cho actor khong bi khoa vao mot warehouse; `scopeWarehouseId=null` khong tro thanh bypass toan he thong.
- Loan mo va trang thai `ON_LOAN` deu chan transfer. Cach nay fail-closed khi loan record va circulation khong nhat quan, doi lai co the can sua du lieu lech truoc khi transfer.
- Audit `before/after` duoc tao tu trang thai sau khi CAS lock/mutation thanh cong, nen phan anh dung thu tu cac transfer dong thoi.
- Readiness chi recalc sau commit, dedupe warehouse nguon/dich va degrade best-effort; loi readiness khong dao transfer da commit.

## Verification

- Focused unit `transfer-atomic.spec.ts`: **14/14**.
- PostgreSQL E2E `inventory-transfer-atomic.e2e-spec.ts`: **13/13**.
- Toan bo backend Jest: **229/229**; backend build: pass.
- Review: **PASS**, khong con blocker trong scope P0-3.
- Fixture cleanup: ca **6 nhom entity** deu ve **0 residual**; `git diff --check` pass; scoped secret scan khong co match.
- Dependency audit van bao cac advisory co san tu truoc: **1 critical, 35 high, 39 moderate, 9 low**; khong phat sinh tu thay doi transfer nay.

## Residual Risks

- Race borrow-vs-transfer van ngoai scope: mot borrow moi co the bat dau dong thoi voi transfer cho den khi luong loan atomic duoc harden. Chan open-loan/`ON_LOAN` giam rui ro du lieu da biet nhung khong thay the dong bo giua hai workflow.

## Next

- Theo doi trang thai va backlog bang plan/checklist authority hien hanh; journal nay chi la lich su thuc thi.
- AgentWiki publish/share bo qua: runtime khong co CLI hoac MCP AgentWiki cau hinh san; khong cai dat va khong network-discover.

## Cau hoi chua giai quyet

- Khong co.
