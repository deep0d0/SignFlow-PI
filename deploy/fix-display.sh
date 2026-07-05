#!/usr/bin/env bash
# Fix "no screens found" / startx failures on DietPi + Pi 4 for SignFlow kiosk.
# Run: sudo bash /opt/signflow/deploy/fix-display.sh --user dietpi
set -euo pipefail

KIOSK_USER="dietpi"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      shift
      KIOSK_USER="${1:-dietpi}"
      ;;
  esac
  shift || true
done

log() { printf '\n[signflow-display] %s\n' "$*"; }

is_dietpi() {
  [[ -d /etc/dietpi ]] || [[ -f /boot/dietpi/.dietpi_version ]]
}

[[ "${EUID:-0}" -eq 0 ]] || { echo "Run with sudo"; exit 1; }
id "$KIOSK_USER" &>/dev/null || { echo "User not found: $KIOSK_USER"; exit 1; }

boot_cfg() {
  if [[ -f /boot/firmware/config.txt ]]; then echo /boot/firmware/config.txt
  elif [[ -f /boot/config.txt ]]; then echo /boot/config.txt
  else echo ""; fi
}

ensure_config() {
  local cfg="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$cfg" 2>/dev/null; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$cfg"
  elif grep -qE "^#${key}=" "$cfg" 2>/dev/null; then
    sed -i "s/^#${key}=.*/${key}=${value}/" "$cfg"
  else
    printf '\n# SignFlow display fix\n%s=%s\n' "$key" "$value" >>"$cfg"
  fi
}

log "Installing X11 / GPU packages for Pi 4…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y \
  xserver-xorg \
  xserver-xorg-core \
  xserver-xorg-input-libinput \
  xserver-xorg-video-all \
  xinit \
  openbox \
  chromium \
  unclutter \
  mesa-utils \
  libgl1-mesa-dri \
  libgles2-mesa \
  firmware-misc-nonfree

CFG="$(boot_cfg)"
if [[ -n "$CFG" ]]; then
  log "Configuring $CFG for HDMI + KMS (Pi 4)…"
  ensure_config "$CFG" "dtoverlay" "vc4-kms-v3d"
  ensure_config "$CFG" "max_framebuffers" "2"
  ensure_config "$CFG" "hdmi_force_hotplug" "1"
  grep -qE '^hdmi_enable_4kp60=' "$CFG" || ensure_config "$CFG" "hdmi_enable_4kp60" "1"
else
  log "WARNING: boot config.txt not found — skip firmware HDMI tweaks"
fi

log "Writing Xorg config (modesetting / KMS)…"
mkdir -p /etc/X11/xorg.conf.d
cat >/etc/X11/xorg.conf.d/10-signflow-pi4.conf <<'EOF'
Section "Device"
    Identifier "Pi4KMS"
    Driver "modesetting"
    Option "AccelMethod" "glamor"
EndSection

Section "Screen"
    Identifier "Screen0"
    Device "Pi4KMS"
    DefaultDepth 24
EndSection

Section "ServerLayout"
    Identifier "Layout0"
    Screen "Screen0"
EndSection
EOF

HOME_DIR="$(eval echo "~$KIOSK_USER")"
log "Fixing Xauthority for $KIOSK_USER…"
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 700 "$HOME_DIR"
touch "$HOME_DIR/.Xauthority"
chown "$KIOSK_USER:$KIOSK_USER" "$HOME_DIR/.Xauthority"
chmod 600 "$HOME_DIR/.Xauthority"

if is_dietpi; then
  log "DietPi: ensure GPU is not headless → sudo dietpi-config → Display Options"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Done. Reboot, then SignFlow should show on the TV."
echo ""
echo "  sudo reboot"
echo ""
echo "  Edit slides from phone/laptop: http://${IP:-192.168.1.143}:8773"
echo "  If X still fails, check: cat ~/.local/share/xorg/Xorg.0.log | grep EE"
