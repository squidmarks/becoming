# Initial Raspberry Pi Setup - Complete Rebuild Guide

This guide walks through setting up the Raspberry Pi from scratch for M/Y Becoming.

## Prerequisites

- Raspberry Pi 5 (8GB recommended)
- MicroSD card (64GB+ recommended)
- Ethernet cable for boat network
- RTL-SDR Blog V4 dongle
- USB-C power supply

## Step 1: Install Operating System

1. Download Raspberry Pi Imager
2. Install **Raspberry Pi OS (64-bit) Lite** or **Debian ARM64**
3. Configure:
   - Hostname: `becoming-hub`
   - User: `geoff`
   - Enable SSH
   - Configure WiFi if needed (though ethernet is preferred for stability)
4. Write to SD card and boot

## Step 2: Initial System Configuration

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Set static IP (192.168.1.7)
# Edit /etc/dhcpcd.conf or use NetworkManager

# Install essential tools
sudo apt install -y git curl wget vim htop build-essential
```

## Step 3: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Verify v24.x
```

## Step 4: Clone Becoming Repository

```bash
cd ~
git clone git@github.com:squidmarks/becoming.git
cd becoming
```

## Step 5: Install Applications

Follow the installation instructions in each app's README:

### SignalK Server
```bash
# See apps/signalk/README.md
sudo npm install -g signalk-server
# Configure and enable service
```

### Inverter Monitor
```bash
# See apps/inverter-monitor/README.md
cd apps/inverter-monitor
npm install
# Configure .env file
sudo systemctl enable $(pwd)/inverter-monitor.service
sudo systemctl start inverter-monitor
```

### AIS Receiver
```bash
# See apps/ais-receiver/README.md
# Install RTL-SDR drivers and build AIS-catcher
```

## Step 6: Configure CAN Bus (NMEA2000)

```bash
# Enable CAN interface
sudo ip link set can0 type can bitrate 250000
sudo ip link set can0 up

# Make persistent by adding to /etc/network/interfaces:
# auto can0
# iface can0 inet manual
#   pre-up /sbin/ip link set can0 type can bitrate 250000
#   up /sbin/ip link set can0 up
```

## Step 7: Verify All Services

```bash
sudo systemctl status signalk inverter-monitor ais-catcher
```

All should show "active (running)" and "enabled".

## Port Reference

- **80** - SignalK server
- **3000** - Inverter monitor web dashboard
- **8100** - AIS-catcher web interface
- **10110** - UDP NMEA (AIS-catcher → SignalK)
- **1883** - MQTT broker (for inverter data)

## Testing

1. **SignalK:** http://becoming-hub/admin
2. **Inverter Dashboard:** http://becoming-hub:3000
3. **AIS Viewer:** http://becoming-hub:8100

## Troubleshooting

### Services not starting
```bash
sudo journalctl -u [service-name] -n 50
```

### Network connectivity
```bash
ip addr show
ping google.com
```

### CAN bus issues
```bash
ip link show can0
candump can0
```

---

*Keep this document updated as the setup evolves.*
