# SignalK State Detectors Plugin

A SignalK plugin that monitors vessel data and publishes derived state paths using JEXL expressions.

## Features

- **JEXL expression-based detection**: Define states using simple boolean expressions
- **Stability tracking**: Require conditions to persist for N consecutive samples
- **Custom state paths**: Publish states to any SignalK path (e.g., `vessel.underway`)
- **Automatic path subscription**: Plugin automatically subscribes to paths used in expressions
- **JSON Schema configuration**: Configure via SignalK Admin UI

## Use Cases

- **Vessel underway detection**: Monitor speed and engine RPM to set `vessel.underway`
- **Anchor dragging**: Monitor position changes while at anchor
- **System monitoring**: Track battery levels, temperature, alarms
- **Custom automations**: Any state derived from vessel data

## Quick Start

### Example: Vessel Underway

```javascript
navigation.speedOverGround > 0.257 && 
propulsion.port.revolutions > 5 && 
propulsion.starboard.revolutions > 5
```

This expression:
- Evaluates to `true` when vessel is moving (>0.5 kts) with both engines running (>300 RPM)
- Evaluates to `false` otherwise
- With stability tracking, state only changes after condition is stable for N consecutive samples

### Example Configuration

```json
{
  "detectors": [
    {
      "name": "Vessel Underway",
      "statePath": "vessel.underway",
      "expression": "navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5 && propulsion.starboard.revolutions > 5",
      "stability": {
        "consecutiveSamples": 3,
        "withinDuration": 30
      }
    }
  ]
}
```

## How It Works

1. Plugin compiles JEXL expressions and extracts SignalK paths
2. Plugin subscribes to all paths used in expressions
3. On each data update, evaluates all expressions against current values
4. Tracks expression result stability using configurable thresholds
5. When state stabilizes to a new value, emits SignalK delta to set the derived path
6. Other systems (data loggers, automation engines) can subscribe to these state paths

## Expression Language

This plugin uses **JEXL** (JavaScript Expression Language) for conditions.

### Basic Operators

- **Comparison**: `>`, `>=`, `<`, `<=`, `==`, `!=`
- **Logical**: `&&` (AND), `||` (OR), `!` (NOT)
- **Math**: `+`, `-`, `*`, `/`, `%`
- **Grouping**: `( )` for precedence

### Examples

**Simple comparison:**
```javascript
navigation.speedOverGround > 0.257
```

**Logical AND:**
```javascript
speed > 0.257 && rpm > 5
```

**Complex expression:**
```javascript
(speed > 0.257 || rpm > 10) && voltage > 11.5
```

**Range check:**
```javascript
temperature > 293.15 && temperature < 313.15
```

See [JEXL.md](./JEXL.md) for comprehensive guide and examples.

## Units

SignalK uses **SI units** for all values:
- Speed: m/s (not knots)
- Revolutions: Hz (not RPM)
- Temperature: K (not °F or °C)

See [UNITS.md](./UNITS.md) for conversion tables and examples.

## Integration

The derived state paths appear as normal SignalK paths and can be:

- Logged by `vessel-data-logger` or other logging systems
- Monitored by automation engines or AI agents
- Displayed in instruments and dashboards
- Used by other plugins or applications

## Development

This plugin was developed as part of the M/Y Becoming AI-accessible vessel project.

See: `/Users/geoff/code/becoming/`
