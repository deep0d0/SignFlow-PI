#!/usr/bin/env bash
#
# SignFlow Raspberry Pi installer
#
# Installs dependencies, enables 4K60 (optional), clones SignFlow from GitHub,
# builds on-device, and configures systemd + Chromium kiosk autostart.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/deep0d0/SignFlow-PI/main/deploy/install-pi.sh | sudo bash -s -- --user dietpi
#
# Or from a cloned repo:
#   sudo bash deploy/install-pi.sh
#   sudo bash deploy/install-pi.sh --update          # pull latest + rebuild
#   sudo bash deploy/install-pi.sh --no-4k             # skip 4K60 boot config
#   sudo bash deploy/install-pi.sh --skip-kiosk        # server only, no display kiosk
#   sudo bash deploy/install-pi.sh --user dietpi      # kiosk user (auto-detected on DietPi)
#
set -euo pipefail

INSTALLER_VERSION=2

REPO_URL="${SIGNFLOW_REPO_URL:-https://github.com/deep0d0/SignFlow-PI.git}"
REPO_BRANCH="${SIGNFLOW_REPO_BRANCH:-main}"
INSTALL_DIR="${SIGNFLOW_INSTALL_DIR:-/opt/signflow}"
DATA_DIR="${SIGNFLOW_DATA_DIR:-/var/lib/signflow}"
SERVICE_NAME="signflow"

ENABLE_4K=true
SKIP_KIOSK=false
UPDATE_ONLY=false
PRUNE_DEV=false
KIOSK_USER="${SIGNFLOW_KIOSK_USER:-}"

log() { printf '\n[signflow-install] %s\n' "$*"; }
warn() { printf '\n[signflow-install] WARNING: %s\n' "$*" >&2; }
die() { printf '\n[signflow-install] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update) UPDATE_ONLY=true ;;
    --no-4k) ENABLE_4K=false ;;
    --skip-kiosk) SKIP_KIOSK=true ;;
    --prune) PRUNE_DEV=true ;;
    --user)
      shift
      [[ $# -gt 0 ]] || die "--user requires an argument"
      KIOSK_USER="$1"
      ;;
    -h|--help) usage ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root: sudo bash $0"
}

is_dietpi() {
  [[ -f /boot/dietpi/.dietpi_version ]] \
    || [[ -f /etc/dietpi/.dietpi_version ]] \
    || [[ -d /etc/dietpi ]]
}

user_exists() {
  getent passwd "$1" &>/dev/null
}

first_login_user() {
  getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 && $1 != "nobody" { print $1; exit }'
}

detect_kiosk_user() {
  log "Installer v${INSTALLER_VERSION}"

  # DietPi default when nothing else specified (curl | sudo bash has no SUDO_USER)
  if [[ -z "$KIOSK_USER" ]] && is_dietpi; then
    KIOSK_USER="dietpi"
  fi

  if [[ -n "$KIOSK_USER" ]]; then
    user_exists "$KIOSK_USER" || die "User not found: $KIOSK_USER"
    log "Using kiosk user: $KIOSK_USER"
    return
  fi

  local candidates=()
  [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]] && candidates+=("$SUDO_USER")
  candidates+=("dietpi" "pi")
  local fallback
  fallback="$(first_login_user)"
  [[ -n "$fallback" ]] && candidates+=("$fallback")

  local u
  for u in "${candidates[@]}"; do
    [[ -z "$u" ]] && continue
    if user_exists "$u"; then
      KIOSK_USER="$u"
      log "Using kiosk user: $KIOSK_USER"
      return
    fi
  done

  warn "Could not auto-detect kiosk user. Login users on this system:"
  getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 { print "  - " $1 }' >&2 || true
  die "Pass --user <name>  (DietPi: sudo bash -s -- --user dietpi)"
}

boot_config_file() {
  if [[ -f /boot/firmware/config.txt ]]; then
    echo /boot/firmware/config.txt
  elif [[ -f /boot/config.txt ]]; then
    echo /boot/config.txt
  else
    echo ""
  fi
}

install_apt_packages() {
  log "Installing system packages…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y \
    git \
    curl \
    ca-certificates \
    chromium \
    fontconfig \
    xserver-xorg \
    x11-xserver-utils \
    xinit \
    openbox \
    unclutter \
    build-essential
  # raspi-config exists on Raspberry Pi OS but not on DietPi
  apt-get install -y raspi-config 2>/dev/null || true
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "$major" -ge 20 ]]; then
      log "Node.js $(node -v) already installed"
      return
    fi
    warn "Node $(node -v) is too old; installing Node 20…"
  fi

  log "Installing Node.js 20 LTS…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs

  command -v node >/dev/null || die "Node installation failed"
  log "Node $(node -v) npm $(npm -v)"
}

set_config_option() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$file"
  else
    printf '\n# Added by SignFlow install-pi.sh\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

configure_4k() {
  if [[ "$ENABLE_4K" != true ]]; then
    log "Skipping 4K60 boot config (--no-4k)"
    return
  fi

  local cfg
  cfg="$(boot_config_file)"
  [[ -n "$cfg" ]] || { warn "Boot config not found; skipping 4K60"; return; }

  log "Enabling 4K @ 60 Hz in $cfg"
  if grep -qE '^hdmi_enable_4kp60=1' "$cfg"; then
    log "hdmi_enable_4kp60 already enabled"
  else
    set_config_option "$cfg" "hdmi_enable_4kp60" "1"
    log "Added hdmi_enable_4kp60=1 (reboot required for HDMI changes)"
  fi
}

configure_autologin() {
  log "Enabling console autologin for user $KIOSK_USER"

  if command -v raspi-config >/dev/null 2>&1; then
    # B2 = console autologin on Raspberry Pi OS
    raspi-config nonint do_boot_behaviour B2 2>/dev/null && return
    warn "raspi-config autologin failed — trying systemd drop-in"
  fi

  # DietPi / generic Debian: autologin via getty drop-in
  local dropin_dir="/etc/systemd/system/getty@tty1.service.d"
  mkdir -p "$dropin_dir"
  cat >"$dropin_dir/autologin.conf" <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${KIOSK_USER} --noclear %I \$TERM
EOF
  systemctl daemon-reload
  log "Configured systemd autologin on tty1 for $KIOSK_USER"
}

configure_boot_optimizations() {
  log "Applying optional boot optimizations…"
  systemctl disable bluetooth.service 2>/dev/null || true
  systemctl disable hciuart.service 2>/dev/null || true
  systemctl disable avahi-daemon.service 2>/dev/null || true

  configure_autologin
}

setup_signflow_user() {
  log "Creating signflow service user and data directory…"
  if ! id signflow &>/dev/null; then
    useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin signflow
  fi
  mkdir -p "$DATA_DIR"
  chown signflow:signflow "$DATA_DIR"
  chmod 750 "$DATA_DIR"
}

clone_or_update_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Updating $INSTALL_DIR from $REPO_URL ($REPO_BRANCH)…"
    git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
  else
    log "Cloning $REPO_URL → $INSTALL_DIR…"
    rm -rf "$INSTALL_DIR"
    git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi

  chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"
}

build_signflow() {
  log "Building SignFlow on Pi (this may take several minutes)…"
  local build_cmd="npm run build:pi-deploy"
  if ! grep -q '"build:pi-deploy"' "$INSTALL_DIR/package.json" 2>/dev/null; then
    warn "build:pi-deploy not in package.json; falling back to build:all"
    build_cmd="npm run build:all"
  fi

  sudo -u "$KIOSK_USER" env \
    HOME="$(eval echo "~$KIOSK_USER")" \
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    bash -c "cd '$INSTALL_DIR' && npm ci && $build_cmd"

  if [[ "$PRUNE_DEV" == true ]]; then
    log "Pruning devDependencies to save disk space…"
    sudo -u "$KIOSK_USER" bash -c "cd '$INSTALL_DIR' && npm prune --omit=dev"
  fi

  # Service user must read the install tree
  chmod -R a+rX "$INSTALL_DIR/dist"
  chmod a+rX "$INSTALL_DIR"
}

install_systemd_service() {
  log "Installing systemd service…"
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"
  if [[ -f "$INSTALL_DIR/deploy/signflow.service" ]]; then
    cp "$INSTALL_DIR/deploy/signflow.service" "$unit"
  else
    cat >"$unit" <<EOF
[Unit]
Description=SignFlow signage server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=signflow
Group=signflow
WorkingDirectory=${INSTALL_DIR}
Environment=SIGNFLOW_APP_ROOT=${INSTALL_DIR}
Environment=SIGNFLOW_DATA_DIR=${DATA_DIR}
Environment=SIGNFLOW_BIND_HOST=0.0.0.0
ExecStart=/usr/bin/env node ${INSTALL_DIR}/dist/pi/server.cjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  fi

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

wait_for_server() {
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:8773/api/state" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

setup_kiosk() {
  if [[ "$SKIP_KIOSK" == true ]]; then
    log "Skipping kiosk setup (--skip-kiosk)"
    return
  fi

  local home
  home="$(eval echo "~$KIOSK_USER")"
  [[ -d "$home" ]] || die "Home directory missing for $KIOSK_USER"

  log "Configuring Chromium kiosk for user $KIOSK_USER…"

  chmod +x "$INSTALL_DIR/deploy/signflow-kiosk.sh" 2>/dev/null || true

  cat >"$home/.xinitrc" <<'EOF'
#!/bin/sh
exec openbox-session
EOF
  chown "$KIOSK_USER:$KIOSK_USER" "$home/.xinitrc"
  chmod +x "$home/.xinitrc"

  mkdir -p "$home/.config/openbox"
  cat >"$home/.config/openbox/autostart" <<EOF
# SignFlow kiosk autostart (generated by install-pi.sh)
unclutter -idle 3 -root &

for i in \$(seq 1 90); do
  curl -sf http://127.0.0.1:8773/api/state >/dev/null && break
  sleep 1
done

${INSTALL_DIR}/deploy/signflow-kiosk.sh &
EOF
  chown -R "$KIOSK_USER:$KIOSK_USER" "$home/.config/openbox"

  local profile="$home/.profile"
  touch "$profile"
  if ! grep -q 'SignFlow startx' "$profile" 2>/dev/null; then
    cat >>"$profile" <<'EOF'

# SignFlow startx (generated by install-pi.sh)
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
EOF
    chown "$KIOSK_USER:$KIOSK_USER" "$profile"
  fi
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  log "=========================================="
  log "SignFlow installation complete"
  log "=========================================="
  echo ""
  echo "  Config UI:  http://${ip:-<pi-ip>}:8773"
  echo "  Display:    http://${ip:-<pi-ip>}:8773/display/"
  echo ""
  echo "  Service:    sudo systemctl status $SERVICE_NAME"
  echo "  Logs:       journalctl -u $SERVICE_NAME -f"
  echo "  Data dir:   $DATA_DIR/signage/"
  echo "  App dir:    $INSTALL_DIR"
  echo ""
  if [[ "$SKIP_KIOSK" != true ]]; then
    echo "  Kiosk user: $KIOSK_USER (console autologin + startx on tty1)"
    echo "  Reboot to start the fullscreen display:"
    echo "    sudo reboot"
  fi
  if [[ "$ENABLE_4K" == true ]]; then
    echo ""
    echo "  4K60: verify after reboot with: tvservice -s"
  fi
  echo ""
  echo "  Update later:"
  echo "    sudo bash $INSTALL_DIR/deploy/install-pi.sh --update"
  echo ""
}

main() {
  require_root
  detect_kiosk_user

  if [[ "$UPDATE_ONLY" == true ]]; then
    log "Update mode"
    [[ -d "$INSTALL_DIR" ]] || die "Install dir missing: $INSTALL_DIR (run full install first)"
    clone_or_update_repo
    build_signflow
    systemctl restart "$SERVICE_NAME"
    wait_for_server && log "Server is responding" || warn "Server not responding yet — check: journalctl -u $SERVICE_NAME"
    print_summary
    exit 0
  fi

  install_apt_packages
  install_node
  configure_4k
  configure_boot_optimizations
  setup_signflow_user
  clone_or_update_repo
  build_signflow
  install_systemd_service
  wait_for_server && log "Server is responding on port 8773" || warn "Server not responding yet — check: journalctl -u $SERVICE_NAME"
  setup_kiosk
  print_summary
}

main "$@"
