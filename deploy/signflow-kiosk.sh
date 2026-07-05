#!/bin/bash
# Chromium kiosk launcher for SignFlow (called by signflow-kiosk.service)
set -euo pipefail

URL="${SIGNFLOW_KIOSK_URL:-http://127.0.0.1:8773/display/}"

# Bookworm / DietPi package name varies
if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM=chromium-browser
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM=chromium
else
  echo "Chromium not found. Install: sudo apt install chromium" >&2
  exit 1
fi

exec "$CHROMIUM" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --check-for-update-interval=31536000 \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  "$URL"
