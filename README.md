# M/Y Becoming - AI-Accessible Vessel

This repository contains all software, configuration, and documentation for the 48' Jefferson motor yacht *Becoming*.

## Mission: AI-Accessible Boat

The primary goal of this project is to create an **AI-accessible vessel** where artificial intelligence can:
- **Understand** the boat's systems through comprehensive documentation
- **Monitor** real-time state via standardized data interfaces (NMEA2000, SignalK)
- **Assist** with operation, maintenance planning, and troubleshooting
- **Advise** on system optimization and upgrades
- **Learn** from the boat's history through git-tracked evolution

This repository serves dual purposes:
1. **Contextual Knowledge Base** - Complete documentation for AI agents to understand the vessel
2. **Living System Record** - Current state and historical evolution of all systems

## Philosophy

This monorepo serves as the complete digital record of *Becoming*'s systems, using git commits as a ship's log to track:
- Software deployments and updates
- System configurations and changes
- Maintenance activities
- Voyage records
- AI-assisted operations and insights

## Repository Structure

```
becoming/
├── apps/              # All software running on boat systems
│   ├── inverter-monitor/   # Sungold 6.5kW inverter monitoring & control
│   ├── ais-receiver/       # AIS reception via RTL-SDR
│   └── signalk/            # SignalK plugins and extensions
├── systems/           # Living technical documentation (current state)
│   ├── electrical/         # Power systems, inverter, batteries
│   ├── propulsion/         # Engines, fuel, transmissions
│   ├── navigation/         # Electronics, instruments, networks
│   ├── plumbing/           # Water, waste, AC, heating
│   ├── mechanical/         # Steering, anchoring, windlass
│   └── hvac/               # Climate control
├── docs/              # Reference documentation
│   ├── manuals/            # Equipment manuals and PDFs
│   ├── procedures/         # Operating procedures and checklists
│   ├── setup/              # Infrastructure setup guides
│   └── vessel-specs.md     # Vessel specifications
└── logs/              # Ship's log (chronological events)
    ├── voyages/            # Voyage records
    ├── maintenance/        # Maintenance activities
    └── upgrades/           # System upgrades and modifications
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

## AI Integration Architecture

### Data Backbone
- **NMEA2000 (CAN bus)** - Physical layer connecting all marine systems
- **SignalK Server** - Normalized data hub (vessels.self namespace)
- **MQTT** - Message bus for custom sensors and actuators
- **MCP Server** (planned) - AI access layer for real-time boat state

### AI Access Layers

**Layer 1: Repository Context**
- This repository provides complete system knowledge to AI agents
- Documentation, schematics, procedures, and history
- Ground truth established by initial survey (January 2026)
- Evolution tracked through git commits

**Layer 2: Real-Time Data**
- SignalK provides normalized marine data in standard format
- All systems publish to unified namespace (navigation, electrical, propulsion, etc.)
- RESTful API and WebSocket streaming for real-time access
- MCP server (future) will expose boat state to AI agents

**Layer 3: Control Interface** (future)
- Write access to configurable systems (autopilot, inverter, etc.)
- Safety-bounded control with human oversight
- Audit logging of all AI-initiated actions

## Current AI Capabilities

- Real-time monitoring of all connected systems
- Historical analysis via git repository
- Anomaly detection in electrical system
- Documentation-assisted troubleshooting
- Context-aware maintenance recommendations

## Future AI Development

- Predictive maintenance using historical data
- Automated voyage planning and weather routing
- Smart energy management and optimization
- Natural language interface for boat operations
- Integration with external marine data sources

---

*"The sea, once it casts its spell, holds one in its net of wonder forever."*  
— Jacques Cousteau
