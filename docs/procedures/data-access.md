# Data Access APIs

How to access real-time vessel data from various services.

## SignalK REST API

**Base URL:** `http://localhost:3100/signalk/v1/api/`

```bash
# Get all vessel data
curl http://localhost:3100/signalk/v1/api/vessels/self

# Specific paths
curl http://localhost:3100/signalk/v1/api/vessels/self/navigation/position
curl http://localhost:3100/signalk/v1/api/vessels/self/electrical/batteries/0/

# List all vessels (including AIS targets)
curl http://localhost:3100/signalk/v1/api/vessels/

# Data sources
curl http://localhost:3100/signalk/v1/api/sources
```

**Documentation:** https://signalk.org/specification/latest/doc/rest_api.html

## Inverter Monitor API

**Base URL:** `http://localhost:3000/api/`

```bash
# Current data snapshot
curl http://localhost:3000/api/data

# Server-Sent Events (real-time stream)
curl http://localhost:3000/events
```

**See:** `apps/inverter-monitor/README.md`

## MQTT (Publish/Subscribe)

**Broker:** `localhost:1883`

```bash
# Subscribe to all inverter data
mosquitto_sub -h localhost -t 'vessels/self/#' -v

# Subscribe to specific topic
mosquitto_sub -h localhost -t 'vessels/self/electrical/batteries/0/voltage'

# Publish example
mosquitto_pub -h localhost -t 'vessels/self/test' -m '{"value": 123}'
```

## NMEA2000 (CAN Bus)

```bash
# Check interface status
ip link show can0

# Monitor raw CAN frames
candump can0

# Monitor via SignalK (better)
curl http://localhost:3100/signalk/v1/api/vessels/self
```
