---
title: "P0-5 Report approve atomic"
date: 2026-07-24
type: technical-journal
status: completed
authority: historical-only
---

# P0-5 Report approve atomic

## Context

Journal ghi lai lich su hoan tat P0-5 ngay 2026-07-24; khong phai authority hien hanh. Truoc thay doi, approve report chi reconcile batch dau tien cua moi SKU, sau do moi doi status report. Loi giua luong co the de lai inventory/count/audit da ghi nhung report van `PENDING`; request dong thoi co the lap mutation, ghi de stock tu snapshot cu, hoac tach loan snapshot khoi phep doi chieu.

Pham vi giu nguyen route, DTO/controller, frontend contract, Prisma schema va permission model. Khong seed, reset, schema push, migration hay network operation.

## What Happened

1. Dua conditional claim `PENDING`, multi-batch allocation, reconcile, inventory count, audit va transition `APPROVED` vao mot Prisma transaction. Retry da `APPROVED` tra `applied: []` va khong ghi them; approve/reject race chi co mot winner.
2. Validate persisted rows truoc mutation; reject row loi va SKU trung theo normalized key. SKU duoc xu ly theo thu tu normalized deterministic; batch theo `createdAt`, sau do `id`. Response van theo thu tu row goc.
3. Phan bo counted quantity oldest-first theo physical in-stock; batch cuoi hap thu phan du. Moi batch khop SKU deu duoc reconcile, ke ca allocation bang 0 hoac khong doi quantity. Loan dang mo van nam trong system quantity, khong nam trong physical count.
4. Tach `reconcileInTx` de caller so huu transaction. Reconcile dung original allocation snapshot lam CAS baseline; concurrent inventory mutation lam transaction conflict va rollback thay vi bi ghi de. Readiness chi recalculate mot lan sau commit, best-effort.
5. Vong review 1 phat hien `onLoan` co the stale trong luc approve va public `reconcile()` bi regression do count-only/no-discrepancy path cung ghi `ItemBatch`. Fix bang coordination lock cho loan writer va chi CAS no-op khi caller yeu cau stable snapshot; public count-only no-op duoc khoi phuc.
6. Vong review 2 phat hien borrow da chup snapshot truoc approve van co the lot qua, reconcile co the CAS tren snapshot moi tach roi allocation snapshot, va nhieu approval co the lay lock SKU khac thu tu. Fix bang `ROW EXCLUSIVE` truoc moi borrow/return business read, truyen original batch snapshot vao reconcile CAS, va sort normalized SKU truoc khi lay batch locks.

## Reflection

Atomic transaction rieng le chua du de bao dam dung khi cac workflow doc cung inventory va loan theo thu tu khac nhau. Hai vong review huu ich vi test rollback/idempotency ban dau van khong chung minh duoc snapshot consistency. PostgreSQL E2E co gate dong thoi moi phoi bay stale borrow va disconnected snapshot ma fake transaction unit test khong the hien.

Thiet ke cuoi uu tien tinh dung P0 va contract compatibility. Doi lai, table lock loan la coarse. Day la trade-off minh bach, de kiem chung va phu hop scope hien tai hon mot co che lock chi tiet can schema/protocol lon hon.

## Decisions Made

| Decision | Rationale | Impact |
|---|---|---|
| Approval lay `LOCK TABLE "LoanRecord" IN SHARE MODE` | Giu loan snapshot on dinh trong toan bo allocation/reconcile transaction | Loan writes cho den khi approval commit/rollback; ordinary reads van duoc phep |
| Borrow/return lay `ROW EXCLUSIVE` truoc business read | Borrow chup snapshot truoc approval cung phai hoan tat truoc khi approval doc loan | Moi loan writer hien tai cung tham gia mot lock protocol |
| Reconcile CAS dung original allocation snapshot | Allocation va mutation phai cung dua tren mot batch state | Concurrent inventory change gay conflict va rollback toan approval |
| SKU normalized va sort deterministic; batch sort `createdAt`, `id` | Giu lock acquisition order nhat quan | Giam deadlock risk; response van bao toan row order goc |
| Public count-only reconcile giu no-op tren `ItemBatch` | Bao toan contract cu; stable no-op CAS chi la nhu cau cua approval | Count van duoc ghi, nhung khong mutation/audit quantity ngoai y dinh |
| Readiness chay mot lan sau commit, best-effort | Khong de derived-state failure dao nguoc transaction da dung | Approval thanh cong van duoc tra ve neu readiness tam loi |

## Limitations

- `SHARE` lock tam dung moi `LoanRecord` writer tren PostgreSQL trong thoi gian monthly approval, khong chi loan cua warehouse/SKU dang duyet. Coarse global loan-write pause nay duoc chap nhan cho P0 de doi lay snapshot dung va implementation nho.
- Lock contract phu thuoc moi borrow/return path tuong lai cung dung helper `ROW EXCLUSIVE` truoc khi doc business state.
- Allocation la synthetic vi report khong co batch identity; oldest-first va final-batch excess la policy da chap nhan.
- Journal chi luu local. Khong publish/share ben ngoai va khong dung AgentWiki vi user khong uy quyen.

## Verification

- Focused unit: 3 suites, **20/20** pass.
- Report PostgreSQL E2E: **9/9** pass, gom rollback, retry/race, loan coordination, stale allocation CAS va organization scope.
- Transfer PostgreSQL E2E regression: **13/13** pass.
- Full backend Jest: 36 suites, **249/249** pass; backend build pass.
- `git diff --check` pass; untracked whitespace scan pass.
- Fixture cleanup pass; ca **13 category** kiem tra deu ve zero residual.
- Final review: **9.5/10 PASS**, khong blocker.

## Next Steps

- Chon backlog P0 tiep theo: P0-1 WebSocket auth hoac P0-2 simulator isolation.
- Neu loan throughput tro thanh bottleneck, danh gia lock protocol chi tiet hon bang evidence; khong tu y bo coordination lock hien tai.

## Unresolved Questions

- Khong co cau hoi chan P0-5.
