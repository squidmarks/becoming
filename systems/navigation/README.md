# Navigation & Electronics System

## Overview

Navigation and electronic systems including GPS, chart plotters, instruments, radar, AIS, VHF radio, and data networks.

**Last Updated:** March 2026

## Systems

### Chart Plotters & Displays
[To be documented]

### GPS
[To be documented]

### Depth Sounder
- **Status:** Active
- **Connection:** NMEA2000
[Additional details to be documented]

### AIS
- **Reception:** RTL-SDR Blog V4 with AIS-catcher software
- **Range:** 10-40 nautical miles (typical)
- **Integration:** UDP NMEA → SignalK
- **Web Interface:** http://becoming-hub:8100
- **Documentation:** `apps/ais-receiver/README.md`

### VHF Radio
[To be documented]

### Autopilot
- **Status:** Active  
- **Connection:** NMEA2000
[Additional details to be documented]

### Radar
[To be documented]

### NMEA2000 Network
- **Interface:** can0 (CAN bus)
- **Devices Connected:**
  - GPS
  - Depth sounder
  - Autopilot
  - [Additional devices to be documented]

### SignalK Server
- **Platform:** Raspberry Pi 5
- **IP:** 192.168.1.7 (becoming-hub)
- **Web Interface:** http://becoming-hub/
- **Data Sources:**
  - NMEA2000 (CAN bus)
  - MQTT (inverter data)
  - UDP NMEA (AIS)
- **Documentation:** `apps/signalk/README.md`

## Network Architecture

[To be documented - diagram of NMEA2000, WiFi, Ethernet connections]

## Maintenance

[To be documented]

---

*Navigation systems are critical for safe operation. Keep documentation current.*
