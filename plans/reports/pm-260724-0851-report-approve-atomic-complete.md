# P0-5 Report Approve Atomic - Completion Report

**Ngay:** 2026-07-24
**Trang thai:** Hoan tat
**Authority:** `plans/260724-report-approve-atomic/plan.md`

## Tom tat

P0-5 hoan tat: approve report atomic, idempotent, multi-batch; khong doi route, DTO, schema, migration hoac frontend contract.

## Thanh tuu

- Phan bo count qua moi batch theo thu tu SKU + batch deterministic.
- Bao toan open-loan quantity khi doi chieu ton vat ly.
- Claim, snapshot-CAS reconcile, audit va transition cung transaction.
- Approve dung `LoanRecord` `SHARE`; borrow/return lay `ROW EXCLUSIVE` truoc khi doc stock/loan.
- Retry approve side-effect free; approve/reject race co mot winner.
- Public count-only reconcile no-op duoc khoi phuc.

## Bang chung

| Gate | Ket qua |
|---|---|
| Focused unit | 3 suites, 20/20 pass |
| Report PostgreSQL E2E | 9/9 pass |
| Transfer PostgreSQL E2E regression | 13/13 pass |
| Full backend | 36 suites, 249/249 pass |
| Backend build | Pass |
| `git diff --check` | Pass |
| Untracked whitespace | 15 file clean |
| Fixture cleanup | 13 category deu zero |
| Review | 9.5/10 PASS, khong blocker |

Khong chay seed, reset, schema push hoac migration.

## Rui ro va gioi han

- Lock contract phu thuoc moi borrow/return path tuong lai cung dung helper lock hien tai.
- Allocation van la chinh sach synthetic vi report khong co batch identity; oldest-first va final-batch excess la quyet dinh da chap nhan.
- P0 loan return contract tong the va dieu kien thoat P0 van mo; khong nam trong P0-5.

## Cau hoi chua giai quyet

- Khong co cau hoi chan P0-5.
