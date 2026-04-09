# Installation Instructions

## Local Development

This plugin is part of the M/Y Becoming monorepo. To test it locally:

```bash
# From the repository root
cd signalk-plugins/signalk-state-detectors

# Check syntax
node -c index.js
```

## Deploy to becoming-hub (Raspberry Pi)

### Option 1: Install via npm link (Development)

```bash
# On the Raspberry Pi
ssh geoff@becoming-hub
cd ~/becoming/signalk-plugins/signalk-state-detectors

# Create symbolic link in SignalK's node_modules
sudo npm link

# Link to SignalK
cd ~/.signalk
sudo npm link signalk-state-detectors

# Restart SignalK
sudo systemctl restart signalk
```

### Option 2: Copy to SignalK Plugin Directory (Production)

```bash
# On the Raspberry Pi
ssh geoff@becoming-hub
cd ~/becoming/signalk-plugins/signalk-state-detectors

# Copy to SignalK's plugin directory
sudo cp -r . ~/.signalk/node_modules/signalk-state-detectors/

# Restart SignalK
sudo systemctl restart signalk
```

### Option 3: Install from Git (Alternative)

```bash
# On the Raspberry Pi
cd ~/.signalk
npm install ~/becoming/signalk-plugins/signalk-state-detectors

# Restart SignalK
sudo systemctl restart signalk
```

## Verify Installation

1. Open SignalK Admin UI: http://becoming-hub/signalk/admin/
2. Navigate to **Server → Plugin Config**
3. Look for **State Detectors** in the list
4. Enable the plugin and configure detectors

## Configuration

### Example: Vessel Underway Detector

```json
{
  "enabled": true,
  "detectors": [
    {
      "name": "Vessel Underway",
      "detectorId": "vessel-underway",
      "statePath": "vessel.underway",
      "enabled": true,
      "description": "Detects when vessel is underway based on speed and engine RPM",
      "category": "navigation",
      "startConditions": {
        "operator": "AND",
        "rules": [
          {
            "path": "navigation.speedOverGround",
            "operator": ">",
            "value": 0.5
          },
          {
            "path": "propulsion.port.revolutions",
            "operator": ">",
            "value": 300
          }
        ]
      },
      "endConditions": {
        "operator": "OR",
        "rules": [
          {
            "path": "navigation.speedOverGround",
            "operator": "<=",
            "value": 0.3
          },
          {
            "path": "propulsion.port.revolutions",
            "operator": "<=",
            "value": 100
          }
        ]
      },
      "stability": {
        "start": {
          "consecutiveSamples": 3,
          "withinDuration": 30
        },
        "end": {
          "consecutiveSamples": 2,
          "withinDuration": 30
        }
      }
    }
  ]
}
```

## Logging the State Paths

Once the plugin is running, you can log the derived state paths using the `vessel-data-logger`:

1. Open http://becoming-hub/data-logger/
2. Navigate to **Logging → Configuration**
3. Click **+ Add Logging Path**
4. Enter the state path (e.g., `vessel.underway`)
5. Configure logging settings and save

The state transitions will be logged to MongoDB like any other SignalK path.

## Troubleshooting

### Plugin not appearing in Admin UI

```bash
# Check SignalK logs
sudo journalctl -u signalk -n 100 -f

# Verify plugin files exist
ls -la ~/.signalk/node_modules/signalk-state-detectors/

# Check plugin registration
cat ~/.signalk/node_modules/signalk-state-detectors/package.json
```

### Plugin enabled but not working

1. Check SignalK Admin UI → Server → Data Browser
2. Verify source SignalK paths have data (e.g., `navigation.speedOverGround`)
3. Check plugin logs in SignalK debug output
4. Verify detector configuration is saved

### State path not publishing

1. Check condition logic - ensure rules match current data
2. Verify stability settings - conditions must persist for N samples
3. Check SignalK Data Browser to see if path appears
4. Review SignalK logs for errors

## Uninstall

```bash
# On the Raspberry Pi
cd ~/.signalk/node_modules
sudo rm -rf signalk-state-detectors

# Restart SignalK
sudo systemctl restart signalk
```
