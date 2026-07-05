# SignFlow on Raspberry Pi 4 — setup guide

This guide walks through installing SignFlow on a **Raspberry Pi 4B** with **SSD boot**, enabling **4K60** on one display, and configuring **automatic startup** of the signage viewer plus LAN access to the config UI at `http://<pi-ip>:8773`.

---

## What runs on the Pi

SignFlow on the Pi does **not** use Electron. Instead:

| Component | Purpose |
|-----------|---------|
| **Node server** (`dist/pi/server.cjs`) | Config UI, API, images/fonts, live updates — port **8773** |
| **Chromium kiosk** | Fullscreen display at `http://127.0.0.1:8773/display/` |

From any computer or phone on your network:

- **Edit slides:** `http://192.168.x.x:8773`
- **Preview display:** `http://192.168.x.x:8773/display/`

Replace `192.168.x.x` with your Pi’s IP address.

---

## Hardware checklist

- Raspberry Pi **4B** (4 GB RAM recommended)
- SSD in a **USB 3.0** enclosure (or native USB boot drive)
- Official or quality **USB-C power supply** (5V 3A)
- **Micro-HDMI → HDMI** cable rated for **HDMI 2.0** (required for 4K60)
- Display connected to **HDMI0** (the micro-HDMI port **next to the USB-C power**)
- Small heatsink or fan (4K output runs warmer)

---

## Part 1 — Flash the OS to SSD

These steps use **Raspberry Pi OS Lite (64-bit)** or **DietPi**. Both work; DietPi boots slightly leaner.

### Option A — Raspberry Pi OS Lite (recommended if new to Pi)

1. On your Mac/PC, download **Raspberry Pi Imager**: https://www.raspberrypi.com/software/
2. Insert the SSD (via USB adapter if needed).
3. Choose device: **Raspberry Pi 4**.
4. Choose OS: **Raspberry Pi OS Lite (64-bit)**.
5. Click the **gear icon** (Advanced options):
   - Set **hostname** (e.g. `signflow`)
   - Enable **SSH** with password or public key
   - Set **username/password** (e.g. user `pi`)
   - Configure **Wi‑Fi** if not using Ethernet
   - Set locale/timezone
6. Write to the SSD.
7. Connect SSD to the Pi’s **USB 3.0** port (blue), connect HDMI and power.

### Option B — DietPi

1. Download DietPi for Pi 4: https://dietpi.com/#download
2. Flash to SSD with Raspberry Pi Imager.
3. On first boot, DietPi runs a setup wizard over SSH or attached keyboard.

### Enable USB boot (if the Pi still boots from SD first)

If you previously used an SD card:

1. Boot once from SD with the Pi connected to the SSD.
2. Run `sudo raspi-config` → **Advanced Options** → **Boot Order** → **USB Boot**.
3. Remove the SD card and reboot from SSD only.

---

## Part 2 — Initial Pi configuration

SSH into the Pi (replace with your IP or hostname):

```bash
ssh pi@signflow.local
# or
ssh pi@192.168.1.50
```

Update the system:

```bash
sudo apt update && sudo apt full-upgrade -y
```

Install required packages:

```bash
sudo apt install -y \
  git \
  curl \
  chromium \
  fontconfig \
  xserver-xorg \
  x11-xserver-utils \
  xinit \
  openbox \
  unclutter
```

Install **Node.js 20 LTS** (required):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x
```

---

## Part 3 — Enable 4K @ 60 Hz (single display)

1. Open the boot config file:

   ```bash
   sudo nano /boot/firmware/config.txt
   ```

   On older images the path may be `/boot/config.txt`.

2. Add at the end (or see `deploy/pi4-4k60-config.txt.snippet` in this repo):

   ```ini
   hdmi_enable_4kp60=1
   ```

3. Save and reboot:

   ```bash
   sudo reboot
   ```

4. After reboot, verify:

   ```bash
   tvservice -s
   ```

   You should see `3840x2160 @ 60Hz` (or your monitor’s 4K mode).

**Troubleshooting 4K60**

- Use **HDMI0** (port nearest USB-C power).
- Try a different **HDMI 2.0** cable.
- Some TV inputs only support 4K30 — try another HDMI port on the TV.
- Run `sudo raspi-config` → **Advanced Options** → **Pi 4 Video Output** → enable 4K60.

---

## Part 4 — Install SignFlow

### 4.1 Create the signflow system user and directories

```bash
sudo useradd --system --home /var/lib/signflow --shell /usr/sbin/nologin signflow || true
sudo mkdir -p /var/lib/signflow /opt/signflow
sudo chown signflow:signflow /var/lib/signflow
```

### 4.2 Copy the app to the Pi

**From your development machine** (in the SignFlow project folder):

```bash
# Build for Pi (renderer + standalone server)
npm run build:all

# Copy to the Pi — adjust IP and exclude dev folders
rsync -av --progress \
  --exclude node_modules \
  --exclude release \
  --exclude .git \
  ./ pi@192.168.1.50:/opt/signflow/
```

**Or clone on the Pi** if the project is in a git repository:

```bash
sudo git clone <your-repo-url> /opt/signflow
sudo chown -R pi:pi /opt/signflow
cd /opt/signflow
npm ci
npm run build:all
```

### 4.3 Install production dependencies on the Pi

**If you copied a pre-built tree from your Mac** (after `npm run build:all`):

- The Pi only needs **Node.js 20+** — no `npm install` required on the Pi.

**If you cloned the repo and build on the Pi:**

```bash
cd /opt/signflow
npm ci
npm run build:all
```

### 4.4 Test manually

```bash
cd /opt/signflow
SIGNFLOW_APP_ROOT=/opt/signflow SIGNFLOW_DATA_DIR=/var/lib/signflow node dist/pi/server.cjs
```

You should see:

```
[config-server] Listening on http://all interfaces:8773
```

From another machine on the network, open:

- `http://<pi-ip>:8773` — config editor
- `http://<pi-ip>:8773/display/` — signage viewer

Press `Ctrl+C` to stop the test server.

---

## Part 5 — Auto-start the server on boot

```bash
sudo cp /opt/signflow/deploy/signflow.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable signflow
sudo systemctl start signflow
sudo systemctl status signflow
```

Check logs:

```bash
journalctl -u signflow -f
```

Data (slides, images, fonts) is stored in:

```
/var/lib/signflow/signage/
```

---

## Part 6 — Auto-start Chromium kiosk (display)

The kiosk needs a minimal X session. Set up auto-login and X on boot for user `pi`:

```bash
sudo raspi-config
```

- **System Options** → **Boot / Auto Login** → **Console Autologin** (or Desktop Autologin if you installed a desktop)

Create `.xinitrc` for user `pi`:

```bash
cat > ~/.xinitrc << 'EOF'
#!/bin/sh
exec openbox-session
EOF
chmod +x ~/.xinitrc
```

Configure Openbox to start the kiosk. Create `~/.config/openbox/autostart`:

```bash
mkdir -p ~/.config/openbox
cat > ~/.config/openbox/autostart << 'EOF'
# Hide mouse cursor when idle
unclutter -idle 3 -root &

# Wait for SignFlow server
for i in $(seq 1 60); do
  curl -sf http://127.0.0.1:8773/api/state >/dev/null && break
  sleep 1
done

/opt/signflow/deploy/signflow-kiosk.sh &
EOF
```

Make the kiosk script executable:

```bash
chmod +x /opt/signflow/deploy/signflow-kiosk.sh
```

Auto-start X on login. Add to `~/.bash_profile` (or `~/.profile`):

```bash
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
```

Reboot:

```bash
sudo reboot
```

After ~20–40 seconds the display should show SignFlow fullscreen.

### Alternative: systemd kiosk service

If you already have `graphical.target` (desktop installed):

```bash
chmod +x /opt/signflow/deploy/signflow-kiosk.sh
sudo cp /opt/signflow/deploy/signflow-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable signflow-kiosk
sudo systemctl start signflow-kiosk
```

---

## Part 7 — Configure slides from another device

1. Find the Pi IP:

   ```bash
   hostname -I
   ```

2. On any laptop/phone on the **same network**, open:

   ```
   http://192.168.x.x:8773
   ```

3. Add slides, upload images/fonts, edit content — changes save automatically.

4. The display at `/display/` updates live (via server-sent events).

**Security:** Port 8773 is plain HTTP with no login. Use only on a trusted home or VLAN network. Do not port-forward it to the internet.

---

## Part 8 — Faster boot (optional)

```bash
# Disable services you don't need
sudo systemctl disable bluetooth avahi-daemon 2>/dev/null || true

# DietPi users
sudo dietpi-config   # Boot wait → 0
```

Expected boot timeline with SSD:

| Stage | Time |
|-------|------|
| Power → SSH up | ~15–25 s |
| SignFlow server listening | ~20–30 s |
| Chromium kiosk showing slides | ~30–45 s |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIGNFLOW_BIND_HOST` | `0.0.0.0` | Listen address (`127.0.0.1` for local-only) |
| `SIGNFLOW_PORT` | `8773` | HTTP port |
| `SIGNFLOW_APP_ROOT` | `process.cwd()` | Path containing `dist/` (set to `/opt/signflow` on Pi) |
| `SIGNFLOW_DATA_DIR` | `~/.config/signflow` | Parent dir for `signage/` data (use `/var/lib/signflow` on Pi) |
| `SIGNFLOW_KIOSK_URL` | `http://127.0.0.1:8773/display/` | URL opened by kiosk script |

---

## Updating SignFlow

On your dev machine:

```bash
npm run build:all
rsync -av --exclude node_modules ./ pi@192.168.1.50:/opt/signflow/
```

On the Pi:

```bash
sudo systemctl restart signflow
# Kiosk picks up changes on next page load; server restart is enough for API/display assets
```

---

## Troubleshooting

### Config UI not reachable from other machines

```bash
# Server running?
sudo systemctl status signflow

# Listening on all interfaces?
ss -tlnp | grep 8773

# Firewall (usually off on Pi OS)
sudo iptables -L
```

### Display is black / Chromium doesn’t start

```bash
# Is the server up?
curl http://127.0.0.1:8773/api/state

# Test kiosk manually
DISPLAY=:0 /opt/signflow/deploy/signflow-kiosk.sh

# X running?
echo $DISPLAY
```

### “Display not built” error

Run on the Pi:

```bash
cd /opt/signflow && npm run build:all
sudo systemctl restart signflow
```

### Fonts dropdown empty on Pi

Install fontconfig (should already be installed):

```bash
sudo apt install fontconfig
fc-list : family | head
```

### 4K looks sluggish during transitions

This is normal on Pi 4 for heavy blur animations. Options:

- Use simpler slides (less blur-heavy content)
- Run 1440p or 1080p if needed (change resolution in `config.txt` or display settings)

### Reset all signage data

```bash
sudo systemctl stop signflow
sudo rm -rf /var/lib/signflow/signage
sudo systemctl start signflow
```

---

## Quick reference

| URL | Purpose |
|-----|---------|
| `http://<pi-ip>:8773` | Config / editor |
| `http://<pi-ip>:8773/display/` | Signage viewer |
| `http://<pi-ip>:8773/api/state` | Raw JSON state |

| Command | Purpose |
|---------|---------|
| `sudo systemctl restart signflow` | Restart server |
| `journalctl -u signflow -f` | Server logs |
| `tvservice -s` | Current HDMI resolution |

---

## Build commands (development machine)

```bash
npm run build:all    # Electron build + renderer + Pi server
npm run start:pi     # Run Pi server locally (no Electron)
```

Local test in a browser:

- Config: http://localhost:8773
- Display: http://localhost:8773/display/
