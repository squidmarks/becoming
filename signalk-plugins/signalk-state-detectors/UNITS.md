# SignalK Units Reference

SignalK uses SI (International System) units for all values. This document provides conversions for common vessel monitoring scenarios.

## Quick Reference

### Speed
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| 1 knot | 0.514444 m/s | kts × 0.514444 |
| 0.5 knots | 0.257222 m/s | (common "underway" threshold) |
| 5 knots | 2.572222 m/s | |
| 10 knots | 5.144444 m/s | |

### Revolutions (Engine/Propeller)
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| RPM | Hz (rev/s) | RPM ÷ 60 |
| 300 RPM | 5 Hz | (low idle) |
| 600 RPM | 10 Hz | (idle) |
| 1800 RPM | 30 Hz | (cruise) |
| 3000 RPM | 50 Hz | (high cruise) |

### Temperature
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| Fahrenheit | Kelvin | (°F - 32) × 5/9 + 273.15 |
| Celsius | Kelvin | °C + 273.15 |
| 68°F (room temp) | 293.15 K | |
| 32°F (freezing) | 273.15 K | |
| 212°F (boiling) | 373.15 K | |

### Pressure
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| PSI | Pascal | PSI × 6894.76 |
| Bar | Pascal | Bar × 100000 |
| 14.7 PSI (1 atm) | 101325 Pa | |

### Distance
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| Nautical miles | Meters | NM × 1852 |
| Feet | Meters | ft × 0.3048 |
| 1 NM | 1852 m | |
| 6 feet (draft) | 1.8288 m | |

### Volume
| Display Unit | SI Unit (SignalK) | Conversion |
|-------------|-------------------|------------|
| Gallons (US) | Cubic meters | gal × 0.00378541 |
| Liters | Cubic meters | L × 0.001 |
| 100 gallons | 0.378541 m³ | |

## Common Detector Examples

### Vessel Underway
```json
{
  "startConditions": {
    "operator": "AND",
    "rules": [
      { "path": "navigation.speedOverGround", "operator": ">", "value": 0.257 },
      { "path": "propulsion.port.revolutions", "operator": ">", "value": 5 }
    ]
  },
  "endConditions": {
    "operator": "OR",
    "rules": [
      { "path": "navigation.speedOverGround", "operator": "<=", "value": 0.154 },
      { "path": "propulsion.port.revolutions", "operator": "<=", "value": 1.67 }
    ]
  }
}
```
- Start: SOG > 0.5 kts AND port engine > 300 RPM
- End: SOG ≤ 0.3 kts OR port engine ≤ 100 RPM

### High Speed Alert
```json
{
  "startConditions": {
    "operator": "AND",
    "rules": [
      { "path": "navigation.speedOverGround", "operator": ">", "value": 10.2889 }
    ]
  },
  "endConditions": {
    "operator": "AND",
    "rules": [
      { "path": "navigation.speedOverGround", "operator": "<=", "value": 9.7778 }
    ]
  }
}
```
- Start: SOG > 20 kts
- End: SOG ≤ 19 kts

### Engine Overheat
```json
{
  "startConditions": {
    "operator": "AND",
    "rules": [
      { "path": "propulsion.port.temperature", "operator": ">", "value": 366.48 }
    ]
  },
  "endConditions": {
    "operator": "AND",
    "rules": [
      { "path": "propulsion.port.temperature", "operator": "<=", "value": 361.48 }
    ]
  }
}
```
- Start: Temp > 200°F (93.33°C)
- End: Temp ≤ 190°F (87.78°C)

## Conversion Tools

### Quick Conversions

**Knots to m/s:**
```javascript
meters_per_second = knots * 0.514444
```

**RPM to Hz:**
```javascript
hertz = rpm / 60
```

**Fahrenheit to Kelvin:**
```javascript
kelvin = (fahrenheit - 32) * 5/9 + 273.15
```

### Online Calculators
- Speed: https://www.unitconverters.net/speed-converter.html
- Temperature: https://www.unitconverters.net/temperature-converter.html
- Pressure: https://www.unitconverters.net/pressure-converter.html

## SignalK Path Units

Common paths and their SI units:

| Path | Unit | Description |
|------|------|-------------|
| `navigation.speedOverGround` | m/s | Speed over ground |
| `navigation.speedThroughWater` | m/s | Speed through water |
| `navigation.courseOverGroundTrue` | radians | Course (0 = north, π/2 = east) |
| `navigation.position.latitude` | degrees | Latitude |
| `navigation.position.longitude` | degrees | Longitude |
| `propulsion.*.revolutions` | Hz | Engine/prop revolutions per second |
| `propulsion.*.temperature` | K | Engine temperature |
| `propulsion.*.oilPressure` | Pa | Oil pressure |
| `electrical.batteries.*.voltage` | V | Battery voltage |
| `electrical.batteries.*.current` | A | Battery current |
| `environment.outside.temperature` | K | Outside air temp |
| `environment.water.temperature` | K | Water temp |
| `environment.depth.belowTransducer` | m | Depth |
| `environment.wind.speedApparent` | m/s | Apparent wind speed |

## Tips

1. **Always verify units in SignalK Data Browser** before creating detectors
2. **Use the SignalK Admin UI → Data Browser** to see live values in SI units
3. **Test your detectors** - watch the SignalK Data Browser to see when state paths change
4. **Add buffer/hysteresis** - use different thresholds for start and end conditions to prevent flapping

## Future Enhancements

We may add unit conversion support in a future version, allowing you to enter values in familiar units (knots, RPM, °F) that are automatically converted to SI units.
