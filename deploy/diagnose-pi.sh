#!/usr/bin/env bash
# SignFlow Pi display diagnostics. Run: sudo bash /opt/signflow/deploy/diagnose-pi.sh
set -uo pipefail

KIOSK_USER="${SIGNFLOW_KIOSK_USER:-dietpi}"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

section() { printf '\n======== %s ========\n' "$*"; }
ok() { printf '  OK   %s\n' "$*"; }
fail() { printf '  FAIL %s\n' "$*"; }
hint() { printf '  →    %s\n' "$*"; }

section "SignFlow server"
if curl -sf http://127.0.0.1:8773/api/state >/dev/null 2>&1; then
  ok "HTTP server on :8773"
  SLIDES="$(curl -sf http://127.0.0.1:8773/api/state | grep -o '"slides":\[[^]]*\]' | head -c 40)"
  echo "       $SLIDES..."
  if curl -sf http://127.0.0.1:8773/api/state | grep -q '"slides":\[\]'; then
    hint "No slides yet — open http://${IP}:8773 and add content (empty = beige, not black)"
  fi
else
  fail "Server not responding on :8773"
  hint "sudo systemctl start signflow && journalctl -u signflow -n 20"
fi

if curl -sf http://127.0.0.1:8773/display/ | grep -q '<div id="root">'; then
  ok "Display page /display/ serves HTML"
else
  fail "Display page missing or not built"
  hint "cd /opt/signflow && npm run build:pi-deploy"
fi

section "Processes"
if pgrep -x Xorg >/dev/null || pgrep -f "Xorg" >/dev/null; then
  ok "Xorg running ($(pgrep -c -f Xorg 2>/dev/null || echo 1) process)"
else
  fail "Xorg not running"
  hint "Log in as $KIOSK_USER on tty1, or run: sudo -u $KIOSK_USER startx"
fi

if pgrep -af chromium 2>/dev/null | head -3; then
  ok "Chromium running"
else
  fail "Chromium not running"
  hint "sudo -u $KIOSK_USER DISPLAY=:0 /opt/signflow/deploy/signflow-kiosk.sh"
fi

section "User $KIOSK_USER kiosk files"
HOME_DIR="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
for f in .xinitrc .profile .config/openbox/autostart; do
  if [[ -f "$HOME_DIR/$f" ]]; then ok "$f exists"; else fail "$f missing"; fi
done
if grep -q startx "$HOME_DIR/.profile" 2>/dev/null; then
  ok ".profile starts startx on tty1"
else
  fail ".profile does not auto-start X"
  hint "Re-run: sudo bash /opt/signflow/deploy/install-pi.sh --user $KIOSK_USER"
fi

section "Xorg log ($KIOSK_USER)"
XLOG="$HOME_DIR/.local/share/xorg/Xorg.0.log"
if [[ -f "$XLOG" ]]; then
  grep EE "$XLOG" | tail -5 || ok "No EE lines in Xorg log"
else
  fail "No Xorg log — X never started as $KIOSK_USER"
  hint "sudo -u $KIOSK_USER startx 2>&1 | tee /tmp/startx.log"
fi

section "HDMI / GPU"
if [[ -f /boot/firmware/config.txt ]]; then
  grep -E '^(dtoverlay|hdmi_force_hotplug|hdmi_enable_4kp60)' /boot/firmware/config.txt 2>/dev/null || true
elif [[ -f /boot/config.txt ]]; then
  grep -E '^(dtoverlay|hdmi_force_hotplug|hdmi_enable_4kp60)' /boot/config.txt 2>/dev/null || true
fi
command -v tvservice >/dev/null && tvservice -s 2>/dev/null || hint "tvservice not available"

section "Quick fixes"
echo "  1. Edit slides:     http://${IP:-<pi-ip>}:8773"
echo "  2. Preview display: http://${IP:-<pi-ip>}:8773/display/"
echo "  3. Fix X/GPU:       sudo bash /opt/signflow/deploy/fix-display.sh --user $KIOSK_USER && sudo reboot"
echo "  4. Manual kiosk:    sudo -u $KIOSK_USER startx"
echo "  5. DietPi GPU:      sudo dietpi-config → Display → disable Headless"
