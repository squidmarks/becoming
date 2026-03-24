# SignalK Inverter State Text Plugin

This SignalK plugin converts the numeric inverter state code to human-readable text.

## Installation

Copy the plugin files to SignalK's node_modules directory:

```bash
cp -r signalk-plugin ~/.signalk/node_modules/signalk-inverter-state-text
```

Create the plugin configuration file:

```bash
cat > ~/.signalk/plugin-config-data/signalk-inverter-state-text.json << 'EOF'
{
  "enabled": true,
  "enableLogging": false,
  "enableDebug": false,
  "configuration": {}
}
EOF
```

Restart SignalK:

```bash
sudo systemctl restart signalk
```

## What it does

The plugin:
- Subscribes to `electrical.inverters.0.state` (numeric value 0-10)
- Converts it to text based on the state map
- Publishes to `electrical.inverters.0.stateText` (string value)

## State mappings

- 0: Power-on
- 1: Standby
- 2: AC Power (Bypass)
- 3: Inverter Operation
- 10: Fault
