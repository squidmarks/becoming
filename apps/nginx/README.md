# Nginx Reverse Proxy

Nginx serves as the HTTP reverse proxy for all vessel web applications, providing a unified entry point at http://becoming-hub.

## Purpose

- **Unified domain** - All apps accessible under becoming-hub
- **Clean URLs** - Path-based routing (/signalk, /inverter, /ais)
- **Port consolidation** - Only port 80 exposed externally
- **Future-ready** - Foundation for SSL/TLS and authentication

## Architecture

```
Port 80 (nginx) → Routes by path:
  ├─ /              → Vessel Hub (static site)
  ├─ /inverter/     → Inverter Monitor (port 3000)
  └─ /ais/          → AIS-catcher (port 8100)

Port 3100 (direct) → SignalK Server
  └─ Cannot be proxied - requires direct port access
```

### Why SignalK is Direct Access

SignalK's web interface hardcodes API paths (e.g., `/v1/api/`, `/admin/`) in its JavaScript and cannot be served under a subpath like `/signalk/`. Attempts to proxy it result in broken functionality. Therefore, SignalK must be accessed directly on port 3100.

## What nginx Does NOT Route

nginx only handles HTTP traffic. The following remain unchanged:
- **MQTT (port 1883)** - Inverter data to SignalK
- **UDP (port 10110)** - AIS NMEA sentences to SignalK
- **NMEA2000 (can0)** - CAN bus hardware interface

## Installation

```bash
# Install nginx
sudo apt update
sudo apt install -y nginx

# Backup default config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Copy vessel configuration
sudo cp becoming-hub.conf /etc/nginx/sites-available/becoming-hub

# Enable the site
sudo ln -sf /etc/nginx/sites-available/becoming-hub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

## Configuration

See `becoming-hub.conf` for the complete nginx configuration.

## Port Changes

When nginx is deployed:
- **SignalK**: Port 80 → Port 3100 (direct access required, not proxied)
- **Inverter Monitor**: Stays on port 3000 (proxied at /inverter/)
- **AIS-catcher**: Stays on port 8100 (proxied at /ais/)
- **Vessel Hub**: Static site served by nginx at /

## Access URLs

After nginx deployment:
- **Vessel Hub:** http://becoming-hub/ (nginx proxied)
- **SignalK:** http://becoming-hub:3100 (direct port access)
- **Inverter Monitor:** http://becoming-hub/inverter/ (nginx proxied)
- **AIS Viewer:** http://becoming-hub/ais/ (nginx proxied)

### SignalK Webapps

SignalK plugins that provide web interfaces must also be accessed via direct port:
- **Freeboard-SK:** http://becoming-hub:3100/@signalk/freeboard-sk/
- **KIP Dashboard:** http://becoming-hub:3100/@signalk/kip/
- **SailGauge:** http://becoming-hub:3100/@signalk/sailgauge/

**Note:** Install plugins via SignalK Admin → Appstore before accessing them.

## Troubleshooting

```bash
# Check nginx status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log

# View access logs
sudo tail -f /var/log/nginx/access.log

# Reload after config changes
sudo nginx -s reload
```

## Security Notes

- nginx runs as www-data user
- All apps run on localhost-only ports (not exposed externally)
- Only nginx listens on port 80 (external)
- Future: Add SSL/TLS with Let's Encrypt
- Future: Add authentication for external access

---

*nginx provides professional HTTP routing while keeping data protocols (MQTT, UDP, CAN) unchanged.*
