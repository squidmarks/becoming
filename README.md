# M/Y Becoming - Digital Infrastructure

This repository contains all software, configuration, and documentation for the 48' Jefferson motor yacht *Becoming*.

## Philosophy

This monorepo serves as the complete digital record of *Becoming*'s systems, using git commits as a ship's log to track:
- Software deployments and updates
- System configurations and changes
- Maintenance activities
- Voyage records
- AI-assisted monitoring and operations

## Repository Structure

```
becoming/
├── apps/              # All software running on boat systems
│   ├── inverter-monitor/   # Sungold 6.5kW inverter monitoring & control
│   ├── ais-receiver/       # AIS reception via RTL-SDR
│   └── signalk/            # SignalK plugins and extensions
├── docs/              # Technical documentation
│   ├── boat/               # Vessel specifications and systems
│   ├── setup/              # Installation and recovery procedures
│   └── maintenance/        # Maintenance logs and procedures
└── logs/              # Ship's log
    └── voyages/            # Voyage records and significant events
```

## Vessel Information

**Vessel:** M/Y Becoming  
**Type:** 48' Jefferson Motor Yacht  
**Year:** 1995  
**LOA:** 48' (14.6m)  
**Beam:** 16' (4.9m)  
**Draft:** 4' (1.2m)  
**Displacement:** ~45,000 lbs  

## Systems Overview

### Primary Computing Platform
- **Raspberry Pi 5** (8GB RAM)
- **OS:** Debian Trixie (ARM64)
- **Network:** Connected to boat's network
- **IP:** 192.168.1.7 (hostname: `becoming-hub`)

### Monitoring & Control Systems
- **Inverter Monitor** - Real-time monitoring and configuration of Sungold SPH6548P 6.5kW solar inverter via Modbus TCP
- **AIS Receiver** - Local AIS vessel tracking via RTL-SDR and VHF antenna
- **SignalK Server** - Marine data hub integrating NMEA2000, MQTT, and web interfaces

### Data Integration
All systems publish to SignalK for unified marine data access:
- NMEA2000 (CAN bus) → SignalK
- Inverter data (Modbus) → MQTT → SignalK
- AIS data (RTL-SDR) → UDP → SignalK

## Quick Start

Each application folder contains its own README with specific setup instructions.

### Disaster Recovery

If the Raspberry Pi needs to be rebuilt from scratch:
1. Follow setup procedures in `docs/setup/`
2. Install applications following instructions in each `apps/*/README.md`
3. Restore SignalK configuration from `apps/signalk/`

## Future Plans

- AI-assisted monitoring and anomaly detection
- Predictive maintenance scheduling
- Automated voyage logging
- Smart energy management
- Advanced navigation assistance

---

*"The sea, once it casts its spell, holds one in its net of wonder forever."*  
— Jacques Cousteau
