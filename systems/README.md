# Systems Documentation

This directory contains living technical documentation for all boat systems. Each system folder contains current configurations, schematics, diagrams, and technical details.

## Philosophy

**Living Documentation** - These docs represent the current state of the vessel. When systems change:
1. Update the relevant system documentation
2. Create a log entry in `logs/upgrades/` or `logs/maintenance/`
3. Commit both together

Git history provides a complete record of system evolution.

## System Categories

- **`electrical/`** - Power generation, distribution, batteries, inverter, solar
- **`propulsion/`** - Engines, fuel system, transmissions, props
- **`navigation/`** - Electronics, instruments, NMEA networks, charts
- **`plumbing/`** - Fresh water, waste, bilge, AC, heating
- **`mechanical/`** - Steering, anchoring, windlass, davits
- **`hvac/`** - Climate control, ventilation

## What to Include

Each system folder should contain:
- **Overview** (`README.md`) - System description and current configuration
- **Schematics** - Wiring diagrams, plumbing diagrams (PDF, PNG, or draw.io)
- **Equipment List** - Installed equipment with models and specs
- **Specifications** - Technical details, capacities, ratings
- **Procedures** - Operating procedures specific to this system
- **Troubleshooting** - Common issues and solutions
- **Maintenance Schedule** - Routine maintenance tasks

## Example Structure

```
electrical/
├── README.md                    # Overview of electrical system
├── house-power-schematic.pdf    # Wiring diagram
├── inverter-config.md          # Inverter setup and configuration
├── battery-system.md           # Battery bank specifications
├── solar-array.md              # Solar panel layout and specs
└── shore-power.md              # Shore power connections
```

## Cross-References

System docs should reference:
- **Applications** (`apps/`) - Software monitoring these systems
- **Logs** (`logs/`) - When changes were made
- **Manuals** (`docs/manuals/`) - Equipment documentation
- **Procedures** (`docs/procedures/`) - How to operate/maintain

---

*Good documentation is as valuable as good maintenance.*
