# P0-3 Inventory Transfer Atomic - Progress Report

**Ngay:** 2026-07-24
**Trang thai:** Hoan tat
**Tien do:** 25/25 checklist (100%)
**Authority:** `docs/plan-p0-inventory-transfer-atomic.md`

## Ket qua

| Hang muc | Trang thai | Bang chung |
|---|---|---|
| Partial/full transfer dung quantity | Hoan tat | Partial tao child; full giu batch ID |
| Scope nguon + dich | Hoan tat | JWT warehouse scope; scope null van gioi han organization/xã |
| Atomicity + concurrency | Hoan tat | CAS, ledger va audit cung transaction |
| Loan safety | Hoan tat | Chan loan mo va `circulation=ON_LOAN` |
| Readiness | Hoan tat | Recalc sau commit, dedupe, best-effort |
| Contract | Bao toan | Khong doi route, DTO, schema hoac migration |

## Verification moi

| Gate | Ket qua |
|---|---|
| Focused unit | 14/14 pass |
| PostgreSQL E2E | 13/13 pass |
| Backend Jest | 229/229 pass |
| Backend build | Pass |
| `git diff --check` | Pass |
| Untracked whitespace | 0 issue tren 6 file |
| Code review | PASS, khong blocker |

Reviewer xac nhan guard `ON_LOAN` dung fail-closed va khong gay regression P0-3. Gap nho khong chan: E2E open-loan dang assert reject chung; circulation-only inconsistency co unit test nhung chua co PostgreSQL case rieng.

## Security Scan

- Pham vi secrets-only: 1.846 tracked + 5 untracked paths; 232 file text code/config sau exclusion; 1 untracked source file duoc scan.
- P0-3: 0 secret finding; `.env` tracked: 0; `.gitignore` co 5 rule env.
- Repo hien co 4 password-pattern finding tu truoc, khong do patch P0-3:
  - `apps/backend/demo/demo.mjs`: 2 demo login.
  - `apps/backend/public/sim.html`: 1 simulator login.
  - `apps/desktop/src/renderer/App.tsx`: 1 hardcoded admin password.
- Khong in gia tri credential. Can xoa/dua sang cau hinh truoc khi mo production/Internet.
- Dependency audit snapshot da co: 1 critical, 35 high, 39 moderate, 9 low; khong phat sinh tu P0-3.

## Docs Impact

- Da cap nhat plan P0-3, checklist backlog va journal lich su.
- Khong co public API, schema, setup hoac command moi; khong can sua evergreen docs khac.

## Rui ro con lai

- Borrow moi bat dau dong thoi voi transfer van thuoc P0 loan atomic; guard hien tai chi fail-closed voi trang thai/loan da quan sat.
- Hardcoded demo credentials va dependency advisories la rui ro repo ton tai truoc, can xu ly trong hardening/release gate.

## Buoc tiep theo

1. P0-5: report approve xu ly moi batch cua SKU va boc reconcile + approve trong mot transaction.
2. Sau P0-5: P0-1 WebSocket auth hoac P0-2 simulator isolation theo uu tien release.

## Cau hoi chua giai quyet

- Khong co cau hoi chan P0-3.
