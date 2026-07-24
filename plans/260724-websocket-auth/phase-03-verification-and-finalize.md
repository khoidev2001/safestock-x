# Phase 03 - Verification and Finalize

## Requirements

- Prove rejection, role integrity, warehouse isolation, and legacy event inertness.
- Run focused tests before broad quality gates.
- Review security boundaries and update only owning documentation.

## Validation

- Focused WebSocket tests.
- Full backend Jest and build.
- Frontend, mobile, and desktop checks.
- `git diff --check` and changed-file review.

## Documentation

- Update `docs/PRD.md` and `docs/checklist-cong-viec-con-lai.md` only after verification.
- Update active client instructions that still describe unauthenticated room joins.

## Known Follow-ups

- Disconnect sockets at access-token expiry and support seamless re-authentication.
- Add mobile refresh-token/session rotation.
- Add bounded desktop retry after a transient refresh failure.
- Partition notifications further if deployment moves beyond one database per commune.
