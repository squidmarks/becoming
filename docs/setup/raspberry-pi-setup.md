# Raspberry Pi Setup - Becoming Hub

This document describes how to set up the primary Raspberry Pi 5 that runs all boat monitoring and navigation systems.

## Hardware

- **Model:** Raspberry Pi 5 (8GB RAM)
- **Storage:** [SD card size/type to be added]
- **Network:** Ethernet connection to boat network
- **Hostname:** `becoming-hub`
- **IP Address:** 192.168.1.7 (static)
- **USB Devices:**
  - RTL-SDR Blog V4 (for AIS reception)
  - [Other devices to be documented]

## Operating System

- **OS:** Debian Trixie (ARM64)
- **Kernel:** [To be added]
- **Node.js:** v24.14.0 (via NodeSource repository)

## Base System Installation

### 1. Install Debian

[To be documented - OS image, initial setup, etc.]

### 2. Configure Network

Set static IP address and hostname:

```bash
sudo hostnamectl set-hostname becoming-hub
# Configure static IP via /etc/network/interfaces or NetworkManager
```

### 3. Install Core Dependencies

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl wget vim htop build-essential
```

### 4. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v24.x
```

## System Services

### SignalK Server

```bash
sudo npm install -g signalk-server
# Configure as systemd service
# See apps/signalk/README.md for full setup
```

### Inverter Monitor

```bash
cd /home/geoff/becoming/apps/inverter-monitor
npm install
# Configure .env file
sudo systemctl enable /home/geoff/becoming/apps/inverter-monitor/inverter-monitor.service
sudo systemctl start inverter-monitor
```

See `apps/inverter-monitor/README.md` for complete setup.

### AIS Receiver

```bash
# Install RTL-SDR drivers and AIS-catcher
# Enable systemd service
```

See `apps/ais-receiver/README.md` for complete setup.

## Security

- SSH key-based authentication (password auth disabled)
- Firewall rules: [To be documented]
- User accounts: `geoff` (primary user)

## Backup Strategy

[To be documented]

## Monitoring

- **System logs:** `sudo journalctl -f`
- **Service status:** `sudo systemctl status inverter-monitor ais-catcher signalk`
- **Disk space:** `df -h`
- **Memory:** `free -h`

---

*Last updated: March 2026*
