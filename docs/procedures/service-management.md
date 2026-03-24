# Service Management

Reference guide for managing vessel services on the Raspberry Pi.

## Service Commands

### Status Checks
```bash
# Individual services
sudo systemctl status inverter-monitor
sudo systemctl status ais-catcher
sudo systemctl status signalk
sudo systemctl status nginx

# All vessel services at once
sudo systemctl status inverter-monitor ais-catcher signalk nginx --no-pager
```

### Restart Services
```bash
sudo systemctl restart inverter-monitor
sudo systemctl restart ais-catcher
sudo systemctl restart signalk
sudo systemctl restart nginx
```

### View Logs
```bash
# Live tail (Ctrl+C to exit)
sudo journalctl -u inverter-monitor -f

# Recent logs (last 50 lines)
sudo journalctl -u inverter-monitor -n 50

# Logs since boot
sudo journalctl -u inverter-monitor -b

# Multiple services
sudo journalctl -u inverter-monitor -u ais-catcher -f
```

## Service Locations

| Service | Location | Config |
|---------|----------|--------|
| Inverter Monitor | `~/becoming/apps/inverter-monitor/` | `.env` |
| AIS-catcher | `/usr/local/bin/AIS-catcher` | Service args |
| SignalK | `~/.signalk/` | `settings.json` |
| nginx | System-wide | `/etc/nginx/sites-available/` |

## Port Reference

| Service | Internal Port | External Access |
|---------|--------------|-----------------|
| nginx | 80 | http://becoming-hub/ |
| SignalK | 3100 | http://becoming-hub/signalk/ |
| Inverter Monitor | 3000 | http://becoming-hub/inverter/ |
| AIS Web | 8100 | http://becoming-hub/ais/ |
| MQTT | 1883 | localhost only |
| AIS UDP | 10110 | localhost only |

## Troubleshooting

### Service won't start
```bash
sudo systemctl status service-name
sudo journalctl -u service-name -n 100
```

### Check if port is in use
```bash
sudo netstat -tlnp | grep PORT_NUMBER
```

### Verify process is running
```bash
ps aux | grep node
ps aux | grep AIS-catcher
```
