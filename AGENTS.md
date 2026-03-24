# AI Agent Guide - M/Y Becoming

This document provides essential information for AI agents (like Claude, GPT, etc.) working with the M/Y Becoming repository and vessel systems.

## Repository Overview

This is a **monorepo** for a 48' Jefferson motor yacht, combining:
- **Software applications** running on Raspberry Pi
- **Living system documentation** (current state tracked via git)
- **Historical records** (logs of voyages, maintenance, upgrades)
- **Reference materials** (manuals, procedures, surveys)

**Primary Mission:** Create an AI-accessible vessel where artificial intelligence can understand, monitor, assist with, and advise on all aspects of boat operation and maintenance.

## Repository Structure

```
becoming/
├── apps/              # Software applications (Node.js)
│   ├── inverter-monitor/   # Sungold inverter monitoring (Modbus → MQTT)
│   ├── ais-receiver/       # AIS reception via RTL-SDR (documented setup)
│   ├── signalk/            # SignalK plugins and config
│   ├── nginx/              # Reverse proxy configuration
│   └── vessel-hub/         # Central dashboard (planned)
│
├── systems/           # Living technical docs (CURRENT STATE)
│   ├── electrical/         # Power, batteries, inverter, solar
│   ├── propulsion/         # Engines, fuel, transmissions
│   ├── navigation/         # Electronics, NMEA2000, instruments
│   ├── plumbing/           # Water, waste, bilge
│   ├── mechanical/         # Steering, anchoring, windlass
│   └── hvac/               # Climate control
│
├── docs/              # Reference documentation
│   ├── manuals/            # Equipment PDFs and technical manuals
│   ├── procedures/         # Operating procedures and checklists
│   ├── surveys/            # Marine surveys (baseline: Jan 2026)
│   ├── setup/              # Infrastructure setup guides
│   └── vessel-specs.md     # Vessel specifications
│
└── logs/              # Ship's log (HISTORICAL EVENTS)
    ├── voyages/            # Voyage records and passages
    ├── maintenance/        # Maintenance activities performed
    └── upgrades/           # System modifications and installations
```

## Repository Philosophy

### Living Documentation
- **`systems/`** = Current state (what IS) - Always kept up-to-date
- **`logs/`** = Historical events (what HAPPENED) - Never modified after creation
- **Git commits** = Ship's log - Each commit documents a change or event

### When Making Changes
1. Update `systems/` docs to reflect current state
2. Create log entry in `logs/` describing what changed
3. Commit both together with descriptive message
4. Git history provides complete system evolution

### Baseline Reference
- **January 2026 marine survey** in `docs/surveys/` is "ground zero"
- All subsequent changes measured against this baseline

## Accessing the Raspberry Pi

### SSH Connection
```bash
ssh geoff@becoming-hub
# or
ssh geoff@192.168.1.7
```

**Important:** SSH uses **key-based authentication only** (no passwords)
- The device you're using must have its SSH public key added to the Pi's `~/.ssh/authorized_keys`
- If connection fails, user needs to add your key manually on the Pi

### Hostname Resolution
- **Hostname:** `becoming-hub`
- **IP:** 192.168.1.7 (static)
- **Network:** Boat's local network (192.168.1.x)

### Platform Details
- **Hardware:** Raspberry Pi 5 (8GB RAM)
- **OS:** Debian Trixie (ARM64)
- **User:** geoff (primary user with sudo access)
- **Node.js:** v24.14.0

## System Architecture

### Data Backbone (Real-time)
```
NMEA2000 (CAN bus) ──┐
                      ├──→ SignalK Server ──→ HTTP/WebSocket API
Inverter (Modbus) ──→ MQTT ──┘              (vessels.self.* namespace)
AIS (RTL-SDR) ──→ UDP ──────┘
```

### Web Interface (HTTP)
```
Port 80 (nginx) ──→ Routes:
  ├─ /              → Vessel Hub (planned)
  ├─ /signalk/      → SignalK (port 3100)
  ├─ /inverter/     → Inverter Monitor (port 3000)
  └─ /ais/          → AIS-catcher (port 8100)
```

### Port Reference
| Service | Internal Port | External Access | Protocol |
|---------|--------------|-----------------|----------|
| nginx | 80 | http://becoming-hub/ | HTTP |
| SignalK | 3100 | http://becoming-hub/signalk/ | HTTP/WS |
| Inverter Monitor | 3000 | http://becoming-hub/inverter/ | HTTP/SSE |
| AIS-catcher Web | 8100 | http://becoming-hub/ais/ | HTTP |
| MQTT Broker | 1883 | localhost only | MQTT |
| AIS UDP | 10110 | localhost only | UDP |
| NMEA2000 | can0 | hardware interface | CAN bus |

## Working with Services

### Service Management
All vessel applications run as systemd services:

```bash
# Check status
sudo systemctl status inverter-monitor
sudo systemctl status ais-catcher
sudo systemctl status signalk

# View logs
sudo journalctl -u inverter-monitor -f
sudo journalctl -u ais-catcher -f
sudo journalctl -u signalk -f

# Restart services
sudo systemctl restart inverter-monitor
sudo systemctl restart ais-catcher
sudo systemctl restart signalk
```

### Application Locations
```bash
# Repository (sparse checkout - apps only)
~/becoming/

# Inverter Monitor
~/becoming/apps/inverter-monitor/
# Service: /etc/systemd/system/inverter-monitor.service

# AIS-catcher
/usr/local/bin/AIS-catcher
# Service: /etc/systemd/system/ais-catcher.service

# SignalK
~/.signalk/
# Service: /etc/systemd/system/signalk.service + signalk.socket
```

## Accessing Real-Time Data

### SignalK REST API
```bash
# Get all vessel data
curl http://localhost:3100/signalk/v1/api/vessels/self

# Get specific path
curl http://localhost:3100/signalk/v1/api/vessels/self/navigation/position
curl http://localhost:3100/signalk/v1/api/vessels/self/electrical/batteries/0/

# List all vessels (including AIS targets)
curl http://localhost:3100/signalk/v1/api/vessels/
```

### Inverter Monitor API
```bash
# Get current data snapshot
curl http://localhost:3000/api/data

# Server-Sent Events stream (real-time)
curl http://localhost:3000/events
```

### MQTT (for publishing data to SignalK)
```bash
# Subscribe to inverter data
mosquitto_sub -h localhost -t 'vessels/self/#' -v

# Publish example
mosquitto_pub -h localhost -t 'vessels/self/electrical/test' -m '{"value": 123}'
```

## Common Operations

### Deploying Code Changes

**From your local machine:**
```bash
cd ~/code/becoming
git add <files>
git commit -m "Description of changes"
git push
```

**On the Pi:**
```bash
ssh geoff@becoming-hub
cd ~/becoming
git pull
cd apps/inverter-monitor  # or whichever app changed
npm install  # if dependencies changed
sudo systemctl restart inverter-monitor
```

### Checking System Health
```bash
# All services
sudo systemctl status inverter-monitor ais-catcher signalk nginx --no-pager

# Network connectivity
ping -c 3 8.8.8.8

# Disk space
df -h

# Memory
free -h

# CPU/Load
htop
```

### Reading Logs
```bash
# Service logs (live tail)
sudo journalctl -u inverter-monitor -f

# Recent logs (last 50 lines)
sudo journalctl -u inverter-monitor -n 50

# Logs since boot
sudo journalctl -u inverter-monitor -b

# All services combined
sudo journalctl -f
```

## Safety Protocols

### DO NOT:
- ❌ **Force push** to main branch (`git push --force`)
- ❌ **Delete or modify log entries** in `logs/` (they're historical records)
- ❌ **Modify surveys** in `docs/surveys/` (baseline documentation)
- ❌ **Change systemd service configs** without testing
- ❌ **Restart services during critical operations** (underway, docking)
- ❌ **Disable restart policies** (`Restart=always` in services)
- ❌ **Run destructive commands** without explicit user confirmation

### DO:
- ✅ **Test configuration changes** before restarting services
- ✅ **Commit frequently** with clear messages
- ✅ **Update both system docs and logs** when making changes
- ✅ **Check service status** after changes
- ✅ **Read logs** to diagnose issues before making changes
- ✅ **Use git history** to understand system evolution

## Git Workflow

### For System Changes
```bash
# 1. Update current state documentation
vim systems/electrical/README.md

# 2. Create log entry for the change
vim logs/upgrades/2026-03-description.md

# 3. Commit both together
git add systems/electrical/ logs/upgrades/
git commit -m "Upgraded battery bank: Added 2nd battery pack"
git push
```

### Commit Message Style
- **Imperative mood:** "Add feature" not "Added feature"
- **Be specific:** What changed and why
- **Reference systems:** Mention affected systems
- **Include context:** For upgrades, include date/location in log

## Useful Commands

### Find Files
```bash
# Find by name
find ~/becoming -name "*.pdf"
find ~/becoming -name "*battery*"

# Search content
grep -r "battery" ~/becoming/systems/
grep -r "192.168.1" ~/becoming/apps/
```

### Check Processes
```bash
# Find Node.js processes
ps aux | grep node

# Check ports
sudo netstat -tlnp | grep LISTEN
sudo ss -tlnp
```

### Network Diagnostics
```bash
# Check NMEA2000
ip link show can0

# Check UDP port
sudo netstat -ulnp | grep 10110

# Check MQTT
mosquitto_sub -h localhost -t '#' -v
```

## AI Integration Points

### Current Capabilities
1. **Read vessel data** via SignalK REST API
2. **Understand system configuration** via this repository
3. **Analyze historical changes** via git history
4. **Access documentation** for all systems and equipment
5. **Monitor real-time status** via APIs and logs

### Future Integration (MCP Server)
- Layer 3 in AI architecture (planned)
- Will provide structured API for AI agents
- Read/write access to configurable systems
- Audit logging of all AI actions
- Safety bounds and human oversight

### Best Practices for AI Agents
1. **Read documentation first** before making assumptions
2. **Check git history** to understand why things are configured a certain way
3. **Verify service status** before and after changes
4. **Use read-only operations** unless explicitly asked to modify
5. **Explain reasoning** when suggesting changes
6. **Reference source documentation** (manuals, surveys) when advising

## Troubleshooting

### Service Won't Start
```bash
# Check status and logs
sudo systemctl status service-name
sudo journalctl -u service-name -n 100

# Check if port is in use
sudo netstat -tlnp | grep PORT_NUMBER

# Verify file permissions
ls -la /path/to/service/files
```

### Can't Connect to Pi
```bash
# Check network
ping becoming-hub
ping 192.168.1.7

# Check if SSH is running
ssh -v geoff@becoming-hub

# Verify SSH keys (on Pi)
cat ~/.ssh/authorized_keys
```

### Data Not Updating
```bash
# Check SignalK data sources
curl http://localhost:3100/signalk/v1/api/sources

# Check MQTT broker
mosquitto_sub -h localhost -t '#' -v

# Check service logs
sudo journalctl -u inverter-monitor -n 50
```

## Questions?

If you encounter issues or need clarification:
1. Check this document first
2. Read the relevant app's README in `apps/`
3. Check system documentation in `systems/`
4. Review git history for context
5. Ask the user for clarification

---

*This repository is designed for AI collaboration. Update this file as you discover new patterns or useful information.*

**Last Updated:** March 2026
