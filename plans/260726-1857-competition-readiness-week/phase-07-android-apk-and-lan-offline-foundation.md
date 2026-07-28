---
phase: 7
title: "Android APK and LAN offline foundation"
status: pending
priority: P0
effort: "1.5d"
dependencies: [1, 3]
---

# Phase 7: Android APK and LAN offline foundation

## Overview

Biến Expo prototype thành APK Android cài ngoài Expo Go, kết nối backend bằng địa chỉ LAN cấu hình release. Luồng hứa hẹn chạy khi public Internet tắt; mất LAN phải báo rõ và không âm thầm xếp hàng mutation.

## Requirements

- Functional: REPORTER login + gửi typed report; RESCUE nhận inbox/notification, mở mission, confirm/reject/complete.
- Offline boundary: backend/PostgreSQL/Redis/frontend/AI/Ollama/local tiles chạy trên máy chủ LAN; Android truy cập private IP/hostname, không dùng `localhost`.
- Security: session hydrate qua Expo SecureStore; API URL lấy env/profile; không hard-code token/host.
- Acceptance: APK install trên fresh device, health/login/mission smoke khi Wi-Fi LAN còn nhưng public Internet bị ngắt; app restart hydrate session và tìm lại mission từ owned notification/inbox; mất LAN hiển thị stale/offline state.

## Architecture

Android → private Wi-Fi → backend LAN API/WS. Backend dùng local DB, Redis, Ollama/RAG và local map assets. App chỉ cache dữ liệu inbox/mission đọc gần nhất; không offline-write queue tuần này.

## Related Code Files

- Modify: `apps/mobile/config.ts`, `apps/mobile/api.ts`, `apps/mobile/App.tsx`, session/auth screens and mission/report screens.
- Create/modify: `apps/mobile/eas.json`, Android network security/cleartext LAN config and release env example.
- Modify: `apps/mobile/README.md`, root/runbook offline preflight.
- Verify: `apps/frontend/src/components/dashboard/map-canvas.tsx`, incident map, `app/layout.tsx` for CDN/font/tile dependencies.

## Implementation Steps

1. Add `EXPO_PUBLIC_API_BASE_URL`/release profile and Android LAN HTTP policy; prove hello APK before feature polish.
2. Persist/restore auth with SecureStore; add server status, retry, stale timestamp and offline banner.
3. Cache last inbox/mission read-only; disable or explain mutations when server unreachable.
4. Bundle/select local fonts, tiles and Ollama/RAG; remove network-required assets from promised screens.
5. Build signed/local APK, install twice on target phone, run typed REPORTER → RESCUE mission smoke after app restart.

## Todo

- [ ] Hello APK installs and reaches LAN backend with Internet disabled.
- [ ] Release config has no localhost hard-code and no committed secrets.
- [ ] SecureStore session hydration and read-only cache pass restart/offline checks.
- [ ] Typed report + RESCUE mission transition pass on a real Android device.
- [ ] REPORTER thấy reference hoặc lỗi/retry rõ sau submit; RESCUE thấy lỗi transition/WS reconnect rõ, không false success.
- [ ] App restart tìm lại cùng mission từ notification/inbox, không copy ID.
- [ ] Local AI/map/font preflight passes without public Internet.
- [ ] APK checksum and device/version evidence recorded.

## Success Criteria

- [ ] Fresh-device APK install succeeds twice without Expo Go.
- [ ] Core mobile flow works over LAN with public Internet disconnected.
- [ ] LAN outage is visible and safe; no silent state transition or false success.
- [ ] APK artifact, checksum, target Android version and LAN preflight are attached to release evidence.

## Risk Assessment

Android build/network is the Day-2 go/no-go. If hello APK cannot install or reach LAN, stop polish and fix toolchain/config first. Full offline writes, iOS and QR are explicitly out of scope.
