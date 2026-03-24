# SignalK Configuration

This directory contains SignalK server plugins, configurations, and setup documentation.

## Installation

SignalK server is installed globally on the Raspberry Pi:

```bash
sudo npm install -g signalk-server
```

## Configuration Location

SignalK stores its configuration in:
- **Settings:** `~/.signalk/settings.json`
- **Plugins:** `~/.signalk/node_modules/`
- **Plugin configs:** `~/.signalk/plugin-config-data/`

## Current Setup

### Data Sources

1. **NMEA2000 (CAN bus)** - Primary boat network
   - Interface: `can0`
   - Position, heading, depth, wind, autopilot, etc.

2. **MQTT** - Inverter data from inverter-monitor app
   - Broker: mosquitto on localhost:1883
   - Topic prefix: `signalk/inverter/`
   - Client ID: `sungold-inverter`

3. **UDP NMEA0183** - AIS data from AIS-catcher
   - Port: 10110
   - Format: NMEA sentences (AIVDM messages)

### Installed Plugins

See `plugins/` directory for custom plugins:
- **signalk-inverter-state-text** - Converts numeric inverter state codes to text

## Service Management

```bash
# Status
sudo systemctl status signalk

# Restart
sudo systemctl restart signalk

# Logs
sudo journalctl -u signalk -f
```

## Web Interfaces

- **Admin UI:** http://becoming-hub/admin
- **Data Browser:** http://becoming-hub/admin (Dashboard → Data Browser)
- **REST API:** http://becoming-hub/signalk/v1/api/

## Backup

To backup SignalK configuration:

```bash
cd ~/.signalk
tar -czf signalk-backup-$(date +%Y%m%d).tar.gz settings.json plugin-config-data/ plugins.json
```

To restore, extract the tarball to `~/.signalk/` and restart the service.

## Adding New Plugins

Custom plugins should be developed in this directory and symlinked:

```bash
cd apps/signalk/plugins/my-new-plugin
npm link
cd ~/.signalk/node_modules
npm link my-new-plugin
sudo systemctl restart signalk
```

---

*SignalK provides the unified data layer for all boat systems.*
