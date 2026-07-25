#!/usr/bin/env bash
#
# Chạy đồng thời toàn bộ service dev của SafeStock trong MỘT terminal:
#   - ai-service (FastAPI + PhoWhisper/Ollama)  → http://localhost:8000
#   - backend    (NestJS)                       → http://localhost:3100
#   - frontend   (Next.js)                      → http://localhost:3200
#   - mobile     (Expo)                         → Expo Dev Server (quét QR bằng Expo Go)
#   - ollama     (LLM cho phân tích/lập phương án, nếu đã cài) → :11434
#
# Log mỗi service được gắn tiền tố màu. Nhấn Ctrl+C MỘT lần để dừng tất cả.
#
# Cách dùng:
#   pnpm dev:all               # chạy đủ (ai, backend, frontend, mobile, ollama)
#   bash scripts/dev-all.sh --no-mobile    # bỏ mobile (Expo nặng, cần TTY riêng)
#   bash scripts/dev-all.sh --no-ollama    # không tự bật Ollama
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AI_PY="$ROOT/apps/ai-service/.venv/bin/python"

WITH_MOBILE=1
WITH_OLLAMA=1
for arg in "$@"; do
  case "$arg" in
    --no-mobile) WITH_MOBILE=0 ;;
    --no-ollama) WITH_OLLAMA=0 ;;
    -h|--help)
      # In khối comment đầu file (bỏ dòng shebang), dừng ở dòng đầu tiên không phải comment.
      awk 'NR==1 && /^#!/ {next} /^#/ {sub(/^#[[:space:]]?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) echo "Tham số không nhận diện: $arg (dùng -h để xem trợ giúp)"; exit 2 ;;
  esac
done

pids=()

# Port đang có tiến trình LISTEN?
port_busy() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

# Kill đệ quy cả cây tiến trình con (pnpm → nest/next → node, uvicorn → worker…).
kill_tree() {
  local pid=$1 sig=${2:-TERM} child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child" "$sig"; done
  kill -"$sig" "$pid" 2>/dev/null
}

cleanup() {
  trap - INT TERM EXIT
  printf '\n\033[1m▶ Đang dừng tất cả service…\033[0m\n'
  for pid in "${pids[@]}"; do kill_tree "$pid" TERM; done
  sleep 1
  for pid in "${pids[@]}"; do kill_tree "$pid" KILL; done
  printf '\033[1;32m✓ Đã dừng.\033[0m\n'
}
trap cleanup INT TERM EXIT

# launch <tên> <mã-màu> <thư-mục> <lệnh>
launch() {
  local name="$1" color="$2" dir="$3" cmd="$4" prefix
  prefix="$(printf '\033[1;%sm%-10s\033[0m│ ' "$color" "[$name]")"
  # Producer chạy nền; stdout+stderr đưa qua awk để gắn tiền tố từng dòng.
  # $! là PID của subshell producer → kill_tree tới được toàn bộ tiến trình con thật.
  ( cd "$dir" && exec bash -c "$cmd" ) > >(awk -v p="$prefix" '{ print p $0; fflush() }') 2>&1 &
  pids+=($!)
  printf '  \033[1;%sm●\033[0m %-9s (pid %s)\n' "$color" "$name" "$!"
}

printf '\033[1m🚀 SafeStock — khởi động môi trường dev\033[0m\n'

# ── ai-service ────────────────────────────────────────────────────────────
if [ ! -x "$AI_PY" ]; then
  printf '  \033[1;33m⚠ ai-service: thiếu venv (%s). Bỏ qua.\033[0m\n' "$AI_PY"
  printf '    Tạo venv & cài deps: cd apps/ai-service && python3 -m venv .venv && \\\n'
  printf '      .venv/bin/pip install -r requirements.txt torch --extra-index-url https://download.pytorch.org/whl/cpu\n'
elif port_busy 8000; then
  printf '  \033[1;33m⚠ ai-service: cổng 8000 đang bận — bỏ qua (đã chạy sẵn?).\033[0m\n'
else
  launch ai-service 36 "$ROOT/apps/ai-service" \
    "exec '$AI_PY' -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info"
fi

# ── ollama (LLM cho parse/plan) ───────────────────────────────────────────
if [ "$WITH_OLLAMA" = 1 ]; then
  if ! command -v ollama >/dev/null 2>&1; then
    printf '  \033[1;33m⚠ ollama: chưa cài — bỏ qua (nút “Phân tích bằng AI” sẽ cần nó).\033[0m\n'
  elif port_busy 11434; then
    printf '  \033[1;33m⚠ ollama: đã chạy sẵn (:11434) — bỏ qua.\033[0m\n'
  else
    launch ollama 34 "$ROOT" "exec ollama serve"
  fi
fi

# ── backend ───────────────────────────────────────────────────────────────
if port_busy 3100; then
  printf '  \033[1;33m⚠ backend: cổng 3100 đang bận — bỏ qua (đã chạy sẵn?).\033[0m\n'
else
  launch backend 32 "$ROOT" "exec pnpm --filter @safestock/backend start:dev"
fi

# ── frontend ──────────────────────────────────────────────────────────────
if port_busy 3200; then
  printf '  \033[1;33m⚠ frontend: cổng 3200 đang bận — bỏ qua (đã chạy sẵn?).\033[0m\n'
else
  launch frontend 35 "$ROOT" "exec pnpm --filter @safestock/frontend dev"
fi

# ── mobile (Expo) ─────────────────────────────────────────────────────────
if [ "$WITH_MOBILE" = 1 ]; then
  launch mobile 33 "$ROOT" "exec pnpm --filter @safestock/mobile start"
  printf '  \033[2mℹ Expo chạy ở chế độ log gộp; muốn phím tắt tương tác (a/i/w) hãy chạy riêng: pnpm mobile:dev\033[0m\n'
fi

if [ ${#pids[@]} -eq 0 ]; then
  printf '\033[1;33mKhông có service nào được khởi động.\033[0m\n'
  exit 0
fi

printf '\033[1m─ Đang chạy %d service. Nhấn Ctrl+C để dừng tất cả. ─\033[0m\n\n' "${#pids[@]}"

# Chờ tới khi bị ngắt; cleanup() lo phần dừng.
wait
