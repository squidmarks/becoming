# Electrical System

## Overview

The electrical system on M/Y Becoming consists of house power (48V LiFePO4 battery bank with solar inverter), engine starting batteries, shore power, and generator power.

**Last Updated:** March 2026  
**Last Major Upgrade:** September 2025 (LiFePO4 battery and inverter installation)

## System Architecture

```
Shore Power (30A/50A) ────┐
                          │
Solar Panels (PV) ────────┤
                          ↓
                    Sungold Inverter
                    (SPH6548P 6.5kW)
                          │
                    48V Battery Bank
                    (200Ah LiFePO4)
                          │
                    ├─── 120V AC L1 ───→ House Loads
                    └─── 120V AC L2 ───→ House Loads
```

## Components

### Inverter
- **Model:** Sungold SPH6548P
- **Type:** 48V Split-Phase Solar Hybrid Inverter
- **Continuous Power:** 6.5kW
- **Surge Power:** 13kW
- **AC Output:** 120/240V 60Hz split-phase
- **Solar Input:** Dual MPPT controllers
- **Location:** [To be specified]
- **Monitoring:** Modbus TCP → Node.js app → SignalK
- **Manual:** `docs/manuals/6.5KW_48V_Split_Phase_Solar_Inverter_SPH6548P-202500514.pdf`

### Battery Bank
- **Voltage:** 48V nominal
- **Capacity:** 200Ah (9.6kWh usable)
- **Chemistry:** LiFePO4 (Lithium Iron Phosphate)
- **Manufacturer:** [To be specified]
- **BMS:** [To be specified]
- **Configuration:** [To be specified - series/parallel arrangement]
- **Location:** [To be specified]
- **Installation Date:** September 2025

### Solar Array
- **Total Capacity:** [To be specified]
- **Panel Configuration:** [To be specified]
- **Location:** [To be specified]
- **Installation:** [To be specified]

### Shore Power
- **Connections:** [30A and/or 50A - to be specified]
- **Transfer:** Automatic via inverter
- **Location:** [To be specified]

## Monitoring

Real-time monitoring via:
- **Local Dashboard:** http://becoming-hub:3000
- **SignalK:** http://becoming-hub/
- **Data Points:**
  - Battery voltage, current, SoC, temperature
  - AC input/output voltage, current, frequency, power
  - Solar input voltage, current, power
  - Inverter state and temperatures
  - Daily energy statistics

See `apps/inverter-monitor/` for software documentation.

## Specifications

### Battery Specifications
- **Nominal Voltage:** 48V
- **Capacity:** 200Ah
- **Energy:** 9.6kWh
- **Usable Depth:** 80% (to 20% SoC)
- **Usable Energy:** ~7.7kWh
- **Charge Rate:** [Max charging current - to be specified]
- **Discharge Rate:** [Max discharge current - to be specified]
- **Temperature Range:** [Operating range - to be specified]

### Inverter Configuration
- **Output Voltage:** 120VAC (configured)
- **Output Frequency:** 60Hz
- **Battery Type Setting:** Lithium (User-defined)
- **Charge Settings:** [To be documented from current config]

## Wiring

[To be added: Wiring schematics, panel layouts, circuit breaker schedules]

## Maintenance

### Routine Checks
- **Monthly:**
  - Inspect battery connections for corrosion
  - Check inverter display for errors
  - Verify monitoring system operation
- **Quarterly:**
  - Clean solar panels
  - Check all electrical connections for tightness
  - Review energy usage patterns
- **Annually:**
  - Professional electrical system inspection
  - Battery capacity test
  - Update firmware on inverter/BMS if available

### Maintenance Log
See `logs/maintenance/` for maintenance records.

## Troubleshooting

### Common Issues
[To be documented as encountered]

### Emergency Procedures
[To be documented]

## Safety

- **Battery disconnect location:** [To be specified]
- **Inverter shutdown procedure:** [To be specified]
- **Shore power disconnect:** [To be specified]
- **Emergency contacts:** [Electrician, supplier info]

## Upgrade History

- **September 2025:** LiFePO4 battery bank and Sungold inverter installation (See `logs/upgrades/2025-09-lipo-battery-inverter-install.md` when created)
- **March 2026:** Monitoring system deployment (See `logs/upgrades/2026-03-digital-infrastructure-init.md`)

## Future Improvements

- Document complete wiring schematic
- Add battery bank configuration diagram
- Document solar panel layout and wiring
- Create emergency shutdown procedure
- Add battery equalization/balancing procedure

---

*This is a living document. Update as the system evolves.*
