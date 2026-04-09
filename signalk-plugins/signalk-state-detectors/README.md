# SignalK State Detectors Plugin

A SignalK plugin that monitors vessel data paths and publishes derived state paths based on configurable conditions.

## Features

- **Condition-based state detection**: Define complex conditions using AND/OR logic
- **Stability tracking**: Require conditions to persist for N consecutive samples
- **Custom state paths**: Publish states to any SignalK path (e.g., `vessel.underway`)
- **Independent start/end conditions**: Different logic for state transitions
- **JSON Schema configuration**: Configure via SignalK Admin UI

## Use Cases

- **Vessel underway detection**: Monitor speed and engine RPM to set `vessel.underway`
- **Anchor dragging**: Monitor position changes while at anchor
- **System monitoring**: Track battery levels, tank levels, alarms
- **Custom automations**: Any state derived from vessel data

## Configuration

Configuration is done through the SignalK Admin UI. Each detector has:

- **State Path**: SignalK path to publish (e.g., `vessel.underway`)
- **Start Conditions**: Rules that must be true to enter the state
- **End Conditions**: Rules that must be true to exit the state
- **Stability**: Number of consecutive samples required (default: 2 within 30s)

### Example Configuration

```json
{
  "detectors": [
    {
      "name": "Vessel Underway",
      "statePath": "vessel.underway",
      "startConditions": {
        "operator": "AND",
        "rules": [
          { "path": "navigation.speedOverGround", "operator": ">", "value": 0.5 },
          { "path": "propulsion.port.revolutions", "operator": ">", "value": 300 }
        ]
      },
      "endConditions": {
        "operator": "OR",
        "rules": [
          { "path": "navigation.speedOverGround", "operator": "<=", "value": 0.3 },
          { "path": "propulsion.port.revolutions", "operator": "<=", "value": 100 }
        ]
      },
      "stability": {
        "start": { "consecutiveSamples": 3, "withinDuration": 30 },
        "end": { "consecutiveSamples": 2, "withinDuration": 30 }
      }
    }
  ]
}
```

## How It Works

1. Plugin subscribes to all paths referenced in detector conditions
2. On each data update, evaluates all detector conditions
3. Tracks condition stability using configurable thresholds
4. When state changes, emits SignalK delta to set the derived path
5. Other systems (data loggers, automation engines) can subscribe to these state paths

## Integration

The derived state paths appear as normal SignalK paths and can be:

- Logged by `vessel-data-logger` or other logging systems
- Monitored by automation engines or AI agents
- Displayed in instruments and dashboards
- Used by other plugins or applications

## Development

This plugin was developed as part of the M/Y Becoming AI-accessible vessel project.

See: `/Users/geoff/code/becoming/`
