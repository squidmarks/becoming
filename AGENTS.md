# AI Agent Quick Start

Essential information for AI agents working with the M/Y Becoming repository.

## What This Is

**Monorepo for a 48' Jefferson motor yacht** - Software, documentation, and operational records for an AI-accessible vessel.

**Primary Mission:** Enable AI to understand, monitor, assist with, and advise on all vessel operations.

## TL;DR

- **Repository:** Complete vessel knowledge base + software apps
- **Raspberry Pi:** `ssh geoff@becoming-hub` (key-based auth only)
- **Web Access:** http://becoming-hub/ (unified interface via nginx)
- **Real-time Data:** SignalK API at `/signalk/v1/api/vessels/self`
- **Services:** Managed via systemd, logs via `journalctl`

## Quick Navigation

**Find things fast:**
- **Software:** `apps/` - All running applications
- **Current state:** `systems/` - How systems are configured NOW
- **History:** `logs/` - What happened and when
- **Reference:** `docs/` - Manuals, procedures, surveys
- **README files:** Every folder has one - read them first

**Key files:**
- `README.md` - Repository overview and mission
- `AGENTS.md` - This file (you are here)
- `systems/README.md` - How living documentation works
- `docs/procedures/` - Common operational tasks

## Raspberry Pi Access

**SSH Connection:**
```bash
ssh geoff@becoming-hub  # or 192.168.1.7
```

⚠️ **Key-based auth only** - No passwords. If SSH fails, your device needs its public key added to `~/.ssh/authorized_keys` on the Pi.

**Platform:** Raspberry Pi 5 (8GB), Debian Trixie ARM64, Node.js v24

**Details:** See `docs/setup/raspberry-pi-setup.md`

## Architecture Overview

**Data Flow:**
```
Hardware → SignalK → HTTP API
  ├─ NMEA2000 (CAN)
  ├─ Inverter (Modbus → MQTT)
  └─ AIS (RTL-SDR → UDP)
```

**Web Access:**
- http://becoming-hub/ → Central hub (nginx routes all apps)
- http://becoming-hub/signalk/ → Marine data
- http://becoming-hub/inverter/ → Power monitoring
- http://becoming-hub/ais/ → Vessel tracking

**Details:** See `docs/procedures/service-management.md` and `docs/procedures/data-access.md`

## Common Tasks

### Check Service Status
```bash
sudo systemctl status inverter-monitor ais-catcher signalk --no-pager
```

### View Logs
```bash
sudo journalctl -u inverter-monitor -f  # Live tail
sudo journalctl -u inverter-monitor -n 50  # Recent 50 lines
```

### Access Real-Time Data
```bash
# SignalK (all vessel data)
curl http://localhost:3100/signalk/v1/api/vessels/self

# Inverter data
curl http://localhost:3000/api/data
```

**Full details:** `docs/procedures/service-management.md` and `docs/procedures/data-access.md`

## Making Changes

### Deploy Code
```bash
# On local machine
git add <files> && git commit -m "Description" && git push

# On Pi
ssh geoff@becoming-hub
cd ~/becoming && git pull
cd apps/inverter-monitor  # whichever app changed
npm install  # if dependencies changed
sudo systemctl restart inverter-monitor
```

### Update System Documentation
When systems change, update **both**:
1. `systems/` - Current state (how it is NOW)
2. `logs/` - Historical record (what changed WHEN)

Commit together with descriptive message.

## Safety Guidelines

**DO NOT:**
- ❌ Force push to main (`git push --force`)
- ❌ Modify historical logs in `logs/` (they're records, not docs)
- ❌ Change surveys in `docs/surveys/` (baseline reference)
- ❌ Restart services without checking status first

**DO:**
- ✅ Read documentation before making assumptions
- ✅ Check git history to understand "why"
- ✅ Test changes before restarting services
- ✅ Update both `systems/` and `logs/` when things change
- ✅ Ask user for confirmation on destructive operations

## When You Need More Info

- **Service management:** `docs/procedures/service-management.md`
- **Data access APIs:** `docs/procedures/data-access.md`
- **Pi setup details:** `docs/setup/raspberry-pi-setup.md`
- **App-specific info:** `apps/*/README.md`
- **System details:** `systems/*/README.md`
- **Historical context:** `git log` and `logs/`

## Philosophy

- **`systems/`** = Current state (what IS now)
- **`logs/`** = Historical record (what HAPPENED)
- **Git commits** = Ship's log (tracks evolution)

When systems change: Update `systems/` docs + create `logs/` entry + commit together.

---

*This repository is designed for AI collaboration. Keep this file concise - detailed info lives in dedicated docs.*
