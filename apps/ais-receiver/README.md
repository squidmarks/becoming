# AIS Receiver

AIS (Automatic Identification System) receiver using RTL-SDR dongle and AIS-catcher software.

## Hardware

- **RTL-SDR Dongle:** RTL-SDR Blog V4 (RTL2838 DVB-T)
- **Antenna:** Connected to boat's VHF antenna (shared)
- **Frequency:** 161.975 MHz & 162.025 MHz (AIS channels A & B)

## Software

- **AIS-catcher** v0.66+ by jvde-github
- **GitHub:** https://github.com/jvde-github/AIS-catcher

## Installation

### 1. Install RTL-SDR Drivers

```bash
sudo apt update
sudo apt install -y rtl-sdr librtlsdr-dev cmake git build-essential pkg-config libpthread-stubs0-dev
```

### 2. Verify SDR Dongle

```bash
lsusb | grep Realtek
# Should show: RTL2838 DVB-T

rtl_test -t
# Should detect RTL-SDR Blog V4
```

### 3. Build and Install AIS-catcher

```bash
cd ~
git clone https://github.com/jvde-github/AIS-catcher.git
cd AIS-catcher
mkdir build && cd build
cmake ..
make -j4
sudo make install
```

This installs the `AIS-catcher` binary to `/usr/local/bin/`.

### 4. Create Systemd Service

Create `/etc/systemd/system/ais-catcher.service`:

```ini
[Unit]
Description=AIS-catcher - AIS receiver for RTL-SDR
After=network.target
Wants=network.target

[Service]
Type=simple
User=geoff
WorkingDirectory=/home/geoff
ExecStart=/usr/local/bin/AIS-catcher -u 127.0.0.1 10110 -N 8100 -q
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Command breakdown:**
- `-u 127.0.0.1 10110` - Send NMEA sentences via UDP to localhost:10110 (SignalK)
- `-N 8100` - Enable web interface on port 8100
- `-q` - Quiet mode (suppress console output)

### 5. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable ais-catcher
sudo systemctl start ais-catcher
```

### 6. Configure SignalK

Add UDP data connection to SignalK settings (`~/.signalk/settings.json`):

```json
{
  "pipedProviders": [
    {
      "id": "ais-udp",
      "pipeElements": [
        {
          "type": "providers/simple",
          "options": {
            "type": "NMEA0183",
            "subOptions": {
              "type": "udp",
              "port": 10110
            },
            "logging": false
          }
        }
      ],
      "enabled": true
    }
  ]
}
```

Then restart SignalK:
```bash
sudo systemctl restart signalk
```

## Usage

### Web Interface

Access the AIS-catcher web interface at:
- **http://becoming-hub:8100** or **http://192.168.1.7:8100**

Features:
- Real-time vessel map
- Vessel list with details
- Signal quality metrics
- Live NMEA feed

### SignalK Integration

AIS vessels appear in SignalK as:
- Namespace: `vessels.urn:mrn:imo:mmsi:XXXXXXXXX`
- Source: `ais-udp.AI`

View in SignalK:
- **Data Browser:** http://becoming-hub/admin (search by MMSI or vessel name)
- **Charts/Maps:** Use Freeboard-SK or other chart apps to see vessels plotted

### Service Management

```bash
# Check status
sudo systemctl status ais-catcher

# View live logs
sudo journalctl -u ais-catcher -f

# Restart service
sudo systemctl restart ais-catcher

# Stop/disable
sudo systemctl stop ais-catcher
sudo systemctl disable ais-catcher
```

## Performance

- **Reception Range:** Typically 10-40 nautical miles (depending on antenna height and terrain)
- **Channels:** Monitors both AIS channel A (161.975 MHz) and B (162.025 MHz) simultaneously
- **CPU Usage:** ~1-3% on Raspberry Pi 5
- **Update Rate:** Real-time (messages typically every 2-30 seconds per vessel)

## Troubleshooting

### No AIS messages received

```bash
# Test SDR dongle
rtl_test -t

# Check if service is running
sudo systemctl status ais-catcher

# View live AIS messages (60 second test)
AIS-catcher -v 60 -o 5
```

### SignalK not showing AIS data

```bash
# Verify AIS-catcher is sending to UDP
sudo netstat -ulnp | grep 10110

# Check SignalK is receiving
curl http://localhost:80/signalk/v1/api/vessels/ | grep mmsi
```

## Legal & Safety Notes

- **Reception only** - This setup receives AIS data only (legal worldwide)
- **Not for collision avoidance** - AIS reception via SDR should supplement, not replace, proper marine radar and visual watch-keeping
- **Antenna sharing** - The RTL-SDR shares the VHF antenna; this is receive-only and does not interfere with VHF radio transmission

## References

- [AIS-catcher GitHub](https://github.com/jvde-github/AIS-catcher)
- [AIS-catcher Documentation](https://github.com/jvde-github/AIS-catcher/wiki)
- [SignalK Documentation](https://signalk.org/documentation/)
- [RTL-SDR Blog](https://www.rtl-sdr.com/)
