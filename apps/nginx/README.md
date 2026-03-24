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
  ├─ /              → Vessel Hub (port 8080)
  ├─ /signalk/      → SignalK Server (port 3100)
  ├─ /inverter/     → Inverter Monitor (port 3000)
  └─ /ais/          → AIS-catcher (port 8100)
```

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
- **SignalK moves**: Port 80 → Port 3100 (internal only, proxied at /signalk/)
- **Inverter Monitor**: Stays on port 3000 (internal only, proxied at /inverter/)
- **AIS-catcher**: Stays on port 8100 (internal only, proxied at /ais/)
- **Vessel Hub**: New on port 8080 (internal only, proxied at /)

## Access URLs

After nginx deployment:
- **Vessel Hub:** http://becoming-hub/
- **SignalK:** http://becoming-hub/signalk/
- **Inverter Monitor:** http://becoming-hub/inverter/
- **AIS Viewer:** http://becoming-hub/ais/

### SignalK Webapps

SignalK plugins that provide web interfaces are automatically accessible through the `/signalk/` path:
- **Freeboard-SK:** http://becoming-hub/signalk/@signalk/freeboard-sk/
- **KIP Dashboard:** http://becoming-hub/signalk/@signalk/kip/
- **SailGauge:** http://becoming-hub/signalk/@signalk/sailgauge/

These work because nginx's `sub_filter` directive rewrites HTML asset paths to preserve the `/signalk/` prefix.

Direct port access still works for debugging:
- http://becoming-hub:3100 (SignalK)
- http://becoming-hub:3000 (Inverter)
- http://becoming-hub:8100 (AIS)

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
