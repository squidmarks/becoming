# JEXL Expression Guide for State Detectors

This plugin uses [JEXL (JavaScript Expression Language)](https://github.com/TomFrost/Jexl) to evaluate conditions against live SignalK data.

## Quick Start

### Basic Comparison

```javascript
navigation.speedOverGround > 0.257
```

### Logical AND

```javascript
navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5
```

### Logical OR

```javascript
navigation.speedOverGround < 0.1 || propulsion.port.revolutions < 1
```

### Complex Expression

```javascript
(navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5) || electrical.batteries.house.voltage < 11.5
```

## JEXL Operators

### Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `>` | Greater than | `speed > 5` |
| `>=` | Greater than or equal | `temp >= 293.15` |
| `<` | Less than | `voltage < 11.5` |
| `<=` | Less than or equal | `rpm <= 10` |
| `==` | Equal to | `state == true` |
| `!=` | Not equal to | `mode != "anchor"` |

### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `&&` | AND | `a > 5 && b < 10` |
| `\|\|` | OR | `a < 1 \|\| b > 100` |
| `!` | NOT | `!anchored` |

### Mathematical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `a + b > 10` |
| `-` | Subtraction | `a - b < 5` |
| `*` | Multiplication | `a * 2 > 100` |
| `/` | Division | `a / b < 0.5` |
| `%` | Modulo | `count % 2 == 0` |

## SignalK Path References

### Referencing Paths

Simply use the full SignalK path with dots:

```javascript
navigation.speedOverGround > 0.257
propulsion.port.revolutions > 5
electrical.batteries.house.voltage < 11.5
```

### Nested Properties

For nested objects, use dot notation:

```javascript
navigation.position.latitude > 40.0 && navigation.position.longitude < -70.0
```

## Common Use Cases

### Vessel Underway

Both engines running and moving:

```javascript
navigation.speedOverGround > 0.257 && 
propulsion.port.revolutions > 5 && 
propulsion.starboard.revolutions > 5
```

### High Speed Alert

Vessel exceeding 20 knots:

```javascript
navigation.speedOverGround > 10.2889
```

### Low Battery Warning

House battery below 12V:

```javascript
electrical.batteries.house.voltage < 12.0
```

### Engine Overheat

Either engine temperature above 200°F (366.48K):

```javascript
propulsion.port.temperature > 366.48 || 
propulsion.starboard.temperature > 366.48
```

### Anchor Dragging

Position changed more than 100m while anchor deployed:

```javascript
navigation.anchor.position && 
navigation.position.latitude != navigation.anchor.position.latitude
```
(Note: Actual implementation would need distance calculation)

### In Shallow Water

Depth below 2 meters:

```javascript
environment.depth.belowTransducer < 2.0
```

### Generator Running

Generator RPM above idle:

```javascript
propulsion.generator.revolutions > 8.33
```
(500 RPM = 8.33 Hz)

### Night Time

Sun below horizon (if your system publishes this):

```javascript
environment.sunlight.times.sunset < Date.now() && 
environment.sunlight.times.sunrise > Date.now()
```

## Advanced Techniques

### Parentheses for Precedence

```javascript
(speed > 5 || rpm > 10) && voltage > 12
```

### Multiple Conditions

```javascript
speed > 0.257 && 
rpm > 5 && 
voltage > 11.5 && 
temperature < 366.48
```

### Range Checking

```javascript
temperature > 293.15 && temperature < 313.15
```
(Between 20°C and 40°C)

### Combining States

Reference other derived states (if they exist):

```javascript
vessel.underway && navigation.speedOverGround > 5.144
```
(Underway AND going fast - over 10 knots)

## Important Notes

### Units

All SignalK values are in **SI units**:
- Speed: m/s (not knots!)
- Revolutions: Hz (not RPM!)
- Temperature: K (not °F or °C!)

See [UNITS.md](./UNITS.md) for conversion tables.

### Path Extraction

The plugin automatically extracts SignalK paths from your expression and subscribes to them. You don't need to configure paths separately.

### Expression Validation

Invalid expressions will be caught at plugin startup. Check the SignalK logs if your detector isn't working.

### Stability/Debouncing

Even if your expression evaluates to `true`, the state won't change until it remains stable for the configured number of consecutive samples within the time window. This prevents flapping.

Example:
- Expression: `speed > 0.257`
- Stability: 3 samples in 30 seconds
- The state will only change to `true` after speed has been > 0.257 for 3 consecutive samples (within 30 seconds)

## Expression Builder Tool

For complex expressions, you can use an external JEXL expression builder tool:

[JEXL Playground](https://czosel.github.io/jexl-playground/) (external)

This tool lets you:
- Test expressions
- See live evaluation
- Validate syntax
- Try different operators

## Troubleshooting

### Expression Not Evaluating

1. Check SignalK logs for errors
2. Verify path names are correct (use Data Browser)
3. Ensure values are in SI units
4. Test expression in JEXL Playground

### State Flapping

If state changes too frequently:
- Increase `consecutiveSamples` (require more samples)
- Increase `withinDuration` (require faster consecutive samples)
- Add hysteresis (different thresholds for activation/deactivation)

Example with hysteresis:
```javascript
// For activation
speed > 0.257  // 0.5 kts

// For deactivation (create separate detector)
speed < 0.154  // 0.3 kts
```

## Examples

See the default "Vessel Underway" detector in the plugin configuration for a working example.
