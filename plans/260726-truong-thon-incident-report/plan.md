---
title: Multi-hamlet incident report to warehouse fulfillment
status: in_progress
priority: P0
tags: [backend, mobile, frontend, mission, audio, hamlet, warehouse]
created: 2026-07-26
---

# Multi-hamlet incident report to warehouse fulfillment

## Outcome

Each hamlet has a database-backed REPORTER login derived from its stable warehouse location key (`<hamlet>_baocao`) and a database-backed WAREHOUSE login (`kho<hamlet>`). A reporter submits a report with optional concrete location and original browser WAV; the system identifies the originating hamlet from the current User profile, analyzes material needs in place with AI, lets an ADMIN review/edit/approve the plan, notifies one global RESCUE account and only the warehouses assigned an allocation, and tracks each warehouse request through accepted and prepared states. Reporter history remains owner/organization scoped, and authorized operators can open private audio without weakening IDOR boundaries.

## Constraints

- Reuse the existing Mission model and workflow/state machine; the submitted Mission ID remains the workflow record.
- Scope reporter list/detail access by the authenticated creator and return identical not-found semantics for missing and another reporter's records. Reporter responses may expose only an audio-present flag/metadata; REPORTER cannot retrieve audio bytes.
- Do not grant REPORTER generic `MISSION_VIEW` or expose the global Mission list.
- Replace REPORTER's current broad `MISSION_CREATE` grant with narrow permissions: own-report read, incident-report transcription, and incident submission; REPORTER must not be able to call generic parse/generate-plan/dispatch/defer/resend/cancel or any other generic Mission route. Add an operator-only private-audio-read permission for ADMIN and an explicit in-place report-analysis permission for ADMIN. The permission layer must derive the current role from the database-backed authenticated User (a JWT subject alone is not sufficient), and every sensitive Mission operation must reload the actor and current organization before authorization. The analysis service must require the actor's current database organization to match the Mission warehouse organization in the same service/query boundary. Audio retrieval requires both the ADMIN permission and the same organization predicate; missing, unauthorized, and cross-organization report resources use identical not-found semantics.
- ETA is nullable and comes only from persisted backend action-plan data; no client, LLM, random-coordinate, or rescue-arrival inference.
- Process reporter Missions in place in the web workflow; do not create a replacement Mission during analysis. Add a dedicated in-place analysis operation that preserves the ID, creator, report text, audio, and creation time, claims concurrent analysis safely, and remains compatible with generic plan creation.
- Preserve original WAV bytes privately with strict type/size validation and authenticated access. Use bounded PostgreSQL `Bytes` storage with a 5 MiB decoded payload limit, strict base64/WAV PCM validation, and a database byte-length check so Mission/audio persistence can be atomic without introducing filesystem-volume or orphan-cleanup requirements.
- Keep Expo Web/browser recording only; native recording is out of scope.
- Preserve all existing dirty warehouse-location, map, schema, migration, and documentation changes. Add only an ordered migration after the existing warehouse-location migration, including safe defaults/backfill for existing Mission rows.
- Do not run destructive seed/reset commands or log credentials, hashes, or tokens.
- Incident-report notifications must be organization-scoped for list, mark-one-read, mark-all-read, update-and-push, and WebSocket delivery; persist an optional `organizationId` on `Notification` for this narrow path, populated from the verified Mission warehouse organization rather than client input. The service reloads the actor's current database role and organization, filters `INCIDENT_REPORTED` rows by non-null organization equality, and uses the predicate `(kind != INCIDENT_REPORTED) OR (kind = INCIDENT_REPORTED AND organizationId = currentOrganizationId)` for both read mutations; orphaned/null-organization incident rows match neither branch. Missing and unauthorized mark-one operations have identical not-found semantics. `updateAndPush` must re-read and enforce the same organization predicate before changing an incident notification; it may not update an orphan or cross-organization row. The gateway uses `org:<organizationId>:role:<role>` rooms for organization-tagged notifications, including `updateAndPush`, and never sends `INCIDENT_REPORTED` through a legacy role-only room; legacy role rooms remain only for intentionally organization-neutral notifications. Post-commit notification failure is best effort and must not turn a committed Mission/audio submission into a retryable failure.
- Reporter submissions must use the authenticated reporter's assigned warehouse in their organization; no global first-warehouse fallback.
- Missing or partial incident coordinates remain null and never receive a generated point or ETA.
- Reporter and warehouse login identifiers are generated from the stable `Warehouse.locationKey` (ASCII slug), never from mutable display names: `<locationKey>_baocao` for REPORTER and `kho<locationKey>` for WAREHOUSE. The API login request continues to use the `email` field and the identifier remains stored in `User.email`. Existing legacy special/numbered identities are migrated only by an explicit guarded updater or additive migration; no password is printed, logged, documented, or placed in tests/commands.
- There is one RESCUE account per organization/workspace. RESCUE receives mission details and has no reject, confirm, complete, prepare, or other state-changing workflow action. Warehouse fulfillment is modeled per allocation/source warehouse, so the originating hamlet and supplement hamlets receive only their own quantities.

## Multi-hamlet workflow contract

1. REPORTER submits text/audio and optional concrete location. The server derives `sourceHamlet` and target/source warehouse from the current database User's assigned warehouse; client warehouse or hamlet input is advisory at most and cannot change scope.
2. AI parses the report and calculates requirements against same-organization stock. The original Mission ID is retained. AI output is a draft recommendation only.
3. ADMIN reviews the report, material quantities, source warehouses, concrete location, and notes. ADMIN may edit allocation quantities/warehouse requests and approves the Mission. Approval is the dispatch event and the only transition that publishes the reviewed plan; there is no second ADMIN dispatch step.
4. Approval creates one RESCUE notification containing hamlet name, concrete location when present, and a consolidated pickup list. RESCUE has read-only access to this mission view. The flow does not wait for RESCUE acknowledgement and RESCUE does not finalize delivery.
5. The same approval creates one warehouse request per source warehouse and per allocation. The originating warehouse gets its own quantity; supplement warehouses get only their supplement quantity. Each request can be `PENDING`, `ACCEPTED`, or `PREPARED`, with optional warehouse/admin note. A warehouse can accept and then mark only its own request prepared.
6. Warehouse discrepancy/shortage notes notify ADMIN for review. ADMIN may adjust requests and re-notify affected warehouses. No request is broadcast to every warehouse. The Mission becomes ready for pickup only when every request is `PREPARED`; final delivery completion is outside this requested read-only RESCUE workflow.

## Per-warehouse fulfillment model

Add a normalized `MissionWarehouseRequest` relation rather than overloading allocation JSON. It stores Mission ID, source warehouse ID, required/allocated quantities by SKU, request status, warehouse/admin notes, actor timestamps, and a unique `(missionId, warehouseId, sku)` key. Request rows always inherit Mission organization through the warehouse relation and are authorized by current DB User role, organization, and assigned warehouse. Mission-level readiness is derived from request rows; the existing `MissionRequirement.allocations` JSON remains a compatibility projection for generic callers.

For new reporter-originated missions, the mission-level path is `DRAFT` during intake/analysis/review, `APPROVED` when ADMIN publishes the reviewed plan, `PENDING_WAREHOUSE` while at least one warehouse request is not prepared, and `READY` when every request is prepared. Historical `REJECTED`/`DEFERRED`/delivery fields remain readable for compatibility, but no new RESCUE reject/confirm/complete route is exposed. Generic non-reporter Missions keep their existing compatibility behavior unless a shared transition must be narrowed for security.

### Persisted processing state

Add a nullable report-processing enum separate from `MissionStatus` for reporter-created Missions: `SUBMITTED`, `ANALYZING`, `ANALYZED`, and `ANALYSIS_FAILED`. Add a nullable unpredictable analysis claim token and claim timestamp. A service-owned constant sets a 10-minute lease and all comparisons use database time in the claim compare-and-swap, avoiding app-clock disagreement. Claims are eligible only for authenticated same-organization reporter-created Missions still in workflow `DRAFT`: claim `SUBMITTED`/`ANALYSIS_FAILED` by compare-and-swap, or reclaim `ANALYZING` only after the lease expires, issuing a new token each time. Perform AI work outside transactions. Success finalization runs one Prisma transaction that first performs a compare-and-swap for Mission ID + `DRAFT` + `ANALYZING` + exact claim token, then replaces parsed Mission fields, action-plan/readiness fields and `MissionRequirement` children, transitions to `ANALYZED`, and clears claim metadata; a zero-row claim update throws and rolls back every child/parent write. Failure finalization atomically matches the same ID/status/state/token before setting `ANALYSIS_FAILED` and clearing claim metadata. Thus an expired analyzer cannot partially write or finalize after a newer analyzer reclaims the Mission.

For reporter-created Missions, `ANALYZED` is required before every consumer or transition that relies on parsed/planning data: explanation, approval, action-plan generation, dispatch, and all later rescue/warehouse workflow transitions; prepare/confirm/reject/resend/complete remain reachable only after the normal analyzed transition chain. The only pre-analysis operations are owner/operator detail reads, analyze/retry, and explicit ADMIN cancellation of intake if implemented. Finalization is conditioned on `DRAFT`, so it cannot race a workflow transition.

Migration classifies an existing report Mission only when it has `reportText`, non-null `createdByUserId`, and either (a) its creator's current role is `REPORTER` or (b) it is referenced by an `INCIDENT_REPORTED` notification. Such rows backfill to `ANALYZED` only if they already contain material analyzed evidence (non-empty requirements, a non-null action plan/readiness assessment, or a workflow status other than `DRAFT`); otherwise they backfill to `SUBMITTED`. Unclassifiable and generic non-reporter Missions remain null, are excluded from dedicated reporter/operator-report routes, and remain under the existing generic Mission contract rather than being guessed into the report workflow. Add migration fixtures for existing report, generic, and ambiguous rows plus a concurrency test proving a stale analyzer cannot overwrite a reclaimed analysis.

### Public contracts

Do not return raw Prisma rows. Define explicit reporter summary/detail projections that return the stable public Mission resource ID needed for pagination/detail opening, but exclude nested/internal identifiers, audio bytes, and internal JSON; use stable cursor pagination ordered by `(createdAt, id)`, and select only required fields. Include original text, current `MissionStatus`, processing state, reporter-safe incident fields, `createdAt`, `updatedAt`, `approvedAt`, `completedAt`, delivery outcome/note, rejection reason, admin note, audio-present metadata, and persisted ETA estimates with optional source/timestamp; suppress legacy ETA entries without provenance. These sources are already persisted on `Mission` in `schema.prisma`: `rejectionReason` (line 487), `adminNote` (488), `deliveryOutcome` (489), `deliveryNote` (490), and `completedAt` (491). Existing writers are `rejectByRescue`, `deferByAdmin`/`resendByAdmin`/`cancelByAdmin`, and `completeByRescue` in `mission.service.ts`; add no duplicate fields. A separate authenticated operator-only blob endpoint returns fixed safe WAV headers and no public URL.

### Atomic submission boundary

Validate/decode the upload before writes. In one Prisma transaction create the Mission and optional one-to-one audio row (unique Mission foreign key, cascade delete). Commit before notification persistence/delivery; if notification creation or push fails, log a safe warning and still return the committed Mission ID. If notification guarantee is later required, use an outbox rather than pretending post-commit best effort is atomic.

### Organization boundary

Resolve every actor from the current User row by JWT subject, and use that row—not JWT role/warehouse claims—for permission, role, organization, and warehouse scope; a deleted/disabled/missing actor or role downgrade fails closed. Resolve the reporter's assigned warehouse from the database, require it to belong to the same current organization, and reject client warehouse overrides that do not exactly match. Reporter own list/detail predicates require both `createdByUserId = actor.id` and `mission.warehouse.organizationId = actor.organizationId`.

Apply database-current identity and organization predicates to every sensitive Mission/warehouse route, not only reads: parse/transcribe permission checks, generate-plan warehouse selection, list/detail, cluster warehouses, action-plan, explain/set-explanation, approve, dispatch, confirm, reject, defer, resend, cancel, prepare, and complete. The initial read and every state-changing compare-and-swap must include Mission warehouse organization scope; warehouse-bound WAREHOUSE actors additionally require their current assigned warehouse, while ADMIN/RESCUE preserve their existing role workflows only inside their current organization. Missing actor/scope, missing resources, and cross-organization resources fail closed with identical non-disclosing not-found semantics at resource boundaries. Generic `generate-plan` validates the requested warehouse against the actor's current organization before creation, and generic routes never accept null/global scope as a fallback.

The in-place analysis operation must require the explicit ADMIN report-analysis permission and same-organization predicate in the service/query layer. Private audio uses the same database-derived scope and ADMIN-only permission. The reporter workflow uses dedicated own-report and operator-report routes, never a global list/detail fallback. Existing generic role-scoped notification behavior must not leak incident report IDs across organizations. Add route-matrix negative tests proving REPORTER cannot access generic Mission endpoints and cross-organization actors cannot read or mutate Missions, warehouses, audio, or incident notifications.

### ETA provenance and coordinates

Persist `source` (`google` or `haversine`) and a calculation timestamp for newly generated warehouse logistics estimates. Reporter-facing copy must say this is an estimated logistics time from prepared warehouse(s), not rescue-team arrival. In-place reporter analysis must never call the web random-coordinate helper; no coordinates means no action-plan ETA.

### Migration and client verification

Inspect the additive SQL before applying it after `20260725000000_add_warehouse_location_provenance`; initialize existing `updatedAt` from `createdAt`; classify/backfill existing report Missions exactly as defined in the processing-state section while leaving generic Missions null; and backfill existing `INCIDENT_REPORTED` notification `organizationId` through `Notification.missionId -> Mission.warehouseId -> Warehouse.organizationId`. Any orphaned/unresolvable incident notification remains inaccessible: incident-report list/read/update predicates require non-null organization equality, and the gateway never sends `INCIDENT_REPORTED` through a legacy role-only room. Add indexes supporting `(createdByUserId, createdAt, id)` reporter history, Mission warehouse organization lookups, and `(recipientRole, kind, organizationId, read, createdAt)` incident notification access. Validate on a database containing existing report Missions, generic Missions, and incident notifications. Because mobile/frontend have limited test harnesses, add focused pure/state tests where practical and require package lint/typecheck/build plus explicit manual/browser smoke evidence for audio retention, polling, authenticated blob playback, and object-URL cleanup.

## Non-goals

- No new username column or competing incident-report subsystem.
- No live rescue-team tracking, assigned responder ETA, route departure time, or `EN_ROUTE` status.
- No native mobile audio implementation or mobile audio playback requirement.
- No monthly stock-report changes.
- No dynamic/DB permission-system redesign; the existing role-permission map remains authoritative, but authenticated requests reload the current User role/scope from the database so revoked or changed access cannot survive until JWT expiry.

## Acceptance criteria

- Fresh seed creates one REPORTER and one WAREHOUSE account per HAMLET warehouse using its stable location key and keeps exactly one organization-wide RESCUE account. Reporter and warehouse passwords enter only through secret-safe seed/provisioning inputs. A replacement guarded multi-account provisioner dry-runs by default, rejects missing/duplicate keys or login collisions, preserves existing organization/warehouse scope, and never prints credentials. The obsolete singleton reporter provisioner is not executed.
- Mission has a reliable last-updated timestamp and a private one-to-one audio record with original WAV bytes and metadata; submission rejects invalid type/size and does not leave partial Mission/audio state.
- The AI adapter/controller contract and route response return `{ text: string }` end to end, with a regression test for the HTTP response shape; mobile keeps the original clip through transcription or submission failure, clearing it only after successful submission.
- Reporter list/detail APIs cover every current MissionStatus value, include reporter-safe mission details/notes/timestamps/delivery outcome, expose only audio metadata, and never return another reporter's Mission or audio bytes.
- Reporter ETA is absent/null when no backend-generated logistics ETA exists and identifies estimate source when present; missing coordinates never receive a fabricated ETA.
- ADMIN users with the narrow private-audio permission can fetch bytes only for Missions in their current organization; unauthorized or cross-organization access fails without public static exposure.
- Web notification opening and analysis update the original reporter Mission in place, preserving its history ID and report text; analysis requires ADMIN report-analysis permission plus same-organization service authorization. Web audio playback uses authenticated blob fetching and cleans up object URLs.
- ADMIN approval publishes exactly the reviewed per-warehouse requests. RESCUE receives a read-only consolidated pickup plan. Each WAREHOUSE account can read/accept/prepare only requests for its current assigned warehouse; inventory export and the `PREPARED` transition are atomic and idempotent.
- Typed concrete location is stored and displayed without inventing coordinates or ETA. The originating hamlet name and stable identity come from the authenticated profile/warehouse relation, never from the request body or username parsing.
- New RESCUE rejection/confirm/completion mutations and UI controls are absent; historical rejection/delivery data may remain readable.
- Focused backend, mobile, frontend type/lint/build, and regression tests pass; no unrelated dirty changes are overwritten.

## Implementation phases

1. Extend schema/migration with per-warehouse requests and targeted notifications; replace singleton seed/provisioner contracts with per-location-key reporter/warehouse identities.
2. Add concrete-location submission, retain atomic WAV/Mission creation, materialize allocation rows after AI analysis, and expose ADMIN review/edit/approval contracts on the original Mission.
3. Implement targeted per-warehouse notification/read/accept/prepare paths, atomic inventory export, aggregate readiness, and read-only RESCUE access; remove new rejection/confirm/complete capability.
4. Update mobile REPORTER account/profile/location UX while retaining audio failure behavior and owner-scoped history.
5. Update web ADMIN review and grouped allocations, WAREHOUSE inbox/actions, RESCUE consolidated read-only view, and role-aware navigation.
6. Add focused auth/IDOR/concurrency/migration/UI tests, run package-wide gates, independent review, sync plan/report, and leave commit/push to the user.

## Risks and rollback

- PostgreSQL audio blobs increase row/database size; enforce a small maximum WAV payload and expose metadata only in mission JSON. Rollback is an additive migration rollback after removing code references, with no destructive data reset.
- A short analysis lease prevents permanently stuck claims; stale reclaim uses a new token and token-conditioned finalization, so an old analyzer cannot overwrite a newer result.
- Existing callers depend on generic Mission routes and action-plan JSON; keep their signatures and make `source` additive/optional for old JSON.
- Existing tests construct MissionService directly; avoid new constructor dependencies where possible and update fixtures only for intentional signatures.
- If a verification gate finds a real existing-workflow regression, stop and present the affected contract/options rather than silently weakening it.

## Current verification status — 2026-07-27

The multi-hamlet account and fulfillment implementation is present in the
current dirty workspace. Reporter and warehouse logins are generated per
`Warehouse.locationKey`; the replacement provisioner is guarded and dry-runs by
default. Reporter submission preserves optional concrete location and original
WAV atomically. ADMIN analyzes and approves the original Mission, approval
materializes per-warehouse requests, WAREHOUSE accepts/prepares only its own
requests and may report discrepancies, and RESCUE has no confirm/reject/complete
route or UI action.

Verification after the latest workflow changes:

- 60 backend Jest suites / 405 tests passed, including focused allocation,
  database-current auth, notification room isolation, provisioning, route
  matrix and atomic preparation checks.
- Focused incident workflow verification: 9 suites / 61 tests passed; an
  independent audit rerun covered 10 suites / 72 tests.
- Backend Prisma Client generation, typecheck, lint and production build passed.
- Frontend lint, map tests (11), typecheck and production build passed.
- Mobile TypeScript check and lint passed.
- Desktop TypeScript check, lint and production build passed.
- `git diff --check` passed.

After the final warehouse-target notification hardening, ADMIN request-review
endpoint/UI and admin account-identity derivation, backend build/lint and
frontend typecheck/lint/build passed again. A focused regression run also covered the
reserved simulation identity guard before the final full backend run above.

Final deadline-focused verification after correcting the account warehouse
source and adding request-review/notification isolation regressions:

- 60 backend Jest suites / 411 tests passed.
- Focused Mission, notification, admin-account, seed/provisioner and migration
  run: 6 suites / 48 tests passed.
- Backend build and lint passed.
- Frontend typecheck, lint and production build passed.
- Frontend map tests passed (11/11); mobile typecheck/lint passed; desktop
  typecheck/lint/build passed (desktop build retained its existing Expo base
  config warning).
- `git diff --check` passed.
- ADMIN account creation now uses the organization-wide admin warehouse list,
  scoped by the ADMIN's current database organization, including warehouses
  without coordinates; REPORTER/WAREHOUSE account selection shows HAMLET
  warehouses only. Scoped accounts may omit the API `email` input because the
  backend derives the login after validating the assigned HAMLET warehouse.
- Independent final review found and verified fixes for the scoped-account
  omitted-login contract, CENTRAL warehouse selection mismatch, and cross-org
  admin warehouse list/location IDOR; no remaining critical/important finding
  was reported in the reviewed scope.
- ADMIN request correction is intentionally bounded by the already persisted
  batch allocations: it can reduce/reconfirm a request, resets it to `PENDING`,
  and re-notifies only that warehouse. An increase is rejected because it
  requires a new inventory allocation rather than invented stock.

No seed/reset, migration application, or retained-data provisioner execution
was performed. Live browser/mobile smoke for audio recording failure retention,
notification deep-linking, authenticated WAV playback/object-URL cleanup and
the complete admin/warehouse/rescue happy path remains pending. Migration SQL
was inspected but intentionally not applied, so the plan remains `in_progress`.
