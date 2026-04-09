# SignalK IMU Plugin - WitMotion WT901BLECL

SignalK plugin for WitMotion WT901BLECL 9-axis IMU sensor with integrated sea state analysis.

## Features

### Attitude Data (1-2 Hz)
Publishes vessel attitude at human-readable rates:
- `navigation.attitude.roll` - Roll angle (radians)
- `navigation.attitude.pitch` - Pitch angle (radians)
- `navigation.attitude.yaw` - Yaw angle (radians)
- `navigation.headingMagnetic` - Magnetic heading (radians)

### Sea State Analysis (Every 10 seconds)
Analyzes high-frequency motion data (100-200Hz internally) and publishes:
- `environment.seaState.rollIntensity` - Roll intensity (0-10 scale)
- `environment.seaState.pitchIntensity` - Pitch intensity (0-10 scale)
- `environment.seaState.motionIndex` - Overall motion roughness (0-10 scale)
- `environment.seaState.comfort` - Comfort level (0-10, where 10 is calm)
- `environment.seaState.description` - Text description ("calm", "light chop", "moderate", "rough", "very rough", "heavy seas")
- `environment.seaState.period` - Dominant wave period in seconds (when detectable)

## Sea State Metrics

### Motion Index Scale (0-10)

| Value | Description | Roll RMS | Conditions |
|-------|-------------|----------|------------|
| 0-1 | Calm | < 2° | Flat water, comfortable |
| 1-2.5 | Light chop | 2-5° | Slight motion, very comfortable |
| 2.5-4.5 | Moderate | 5-9° | Noticeable motion, comfortable |
| 4.5-6.5 | Rough | 9-13° | Significant motion, some discomfort |
| 6.5-8.5 | Very rough | 13-17° | Heavy motion, uncomfortable |
| 8.5-10 | Heavy seas | > 17° | Severe motion, dangerous |

### Comfort Index

Inverse of motion index (10 = very comfortable, 0 = very uncomfortable).

Useful for:
- Voyage planning (choose calm weather)
- Speed adjustment (slow down in rough seas)
- Crew comfort monitoring
- Voyage logs ("average comfort: 7.5/10")

## Use Cases

### 1. Trim and List Monitoring
Monitor real-time roll/pitch for:
- Detecting port/starboard list
- Bow-up/bow-down trim
- Ballast adjustment decisions

### 2. Sea State Logging
Log sea state metrics for:
- Voyage summaries ("encountered moderate seas")
- Weather correlation
- Route analysis (which routes are smoother?)
- Vessel performance (comfort vs. speed)

### 3. Automation
Create state detectors or automation based on:
- `environment.seaState.motionIndex > 6` → Slow down
- `environment.seaState.comfort < 4` → Alert crew
- `navigation.attitude.roll > 0.35` (20°) → List alarm

### 4. AI Decision Making
AI agents can use sea state data to:
- Recommend speed adjustments
- Suggest route changes
- Assess crew comfort
- Log voyage conditions

## Installation

### On becoming-hub (Raspberry Pi)

```bash
ssh geoff@becoming-hub

# Ensure sensor is connected
ls -la /dev/ttyUSB0

# Copy plugin
cd ~/.signalk/node_modules
cp -r ~/becoming/signalk-plugins/signalk-imu-wt901 .

# Install dependencies
cd signalk-imu-wt901
npm install

# Restart SignalK
sudo systemctl restart signalk
```

### Enable Plugin

1. Open SignalK Admin UI: http://becoming-hub/admin/
2. Navigate to **Server → Plugin Config**
3. Find **IMU (WT901)**
4. Check **Active/Enabled**
5. Configure settings (defaults should work):
   - Serial Port: `/dev/ttyUSB0`
   - Baud Rate: `115200`
   - Attitude Publish Rate: `2 Hz`
   - Sea State Update: `10 seconds`
   - Window Size: `60 seconds`
6. Click **Submit**

## Verification

### Check Attitude Data

Open SignalK Data Browser and look for:
- `vessels.self.navigation.attitude`
- `vessels.self.navigation.headingMagnetic`

### Check Sea State Data

Look for:
- `vessels.self.environment.seaState.motionIndex`
- `vessels.self.environment.seaState.description`
- `vessels.self.environment.seaState.comfort`

### Check Plugin Status

```bash
curl http://becoming-hub:3100/plugins/signalk-imu-wt901/status
```

Should show:
```json
{
  "connected": true,
  "stats": {
    "framesReceived": 12345,
    "framesInvalid": 2,
    "lastFrameTime": "..."
  },
  "currentAttitude": {...},
  "seaState": {...}
}
```

## Data Logging

To log IMU data with vessel-data-logger:

### Attitude (for trim monitoring)
- Add `navigation.attitude` to logging configuration
- Log interval: 2-5 seconds (slow data)
- Useful for: Trim analysis, list detection

### Sea State (for voyage logs)
- Add `environment.seaState.motionIndex` to logging
- Add `environment.seaState.description` to logging
- Add `environment.seaState.comfort` to logging
- Log interval: 10-30 seconds
- Useful for: Voyage summaries, comfort analysis

## Troubleshooting

### Sensor Not Connected

```bash
# Check USB device
lsusb | grep -i ch340

# Check serial port
ls -la /dev/ttyUSB0

# Check permissions
groups geoff | grep dialout
```

### No Data in SignalK

```bash
# Check plugin logs
sudo journalctl -u signalk -f | grep -i imu

# Check plugin status
curl http://becoming-hub:3100/plugins/signalk-imu-wt901/status
```

### Invalid Frames

If `framesInvalid` is high:
- Check baud rate (should be 115200 for WT901)
- Check serial port path
- Verify sensor is WT901BLECL (not different model)

## Technical Details

### Data Flow

```
WT901 Sensor → USB/Serial → Plugin
    ↓                         ↓
100-200Hz               Buffered
                             ↓
                    ┌────────┴─────────┐
                    ↓                  ↓
            Attitude (2Hz)    Motion Analysis (10s)
                    ↓                  ↓
              SignalK            SignalK
        (navigation.attitude)  (environment.seaState)
```

### Motion Analysis Algorithm

1. **Collect high-frequency data** in 60-second rolling window
2. **Calculate RMS** (Root Mean Square) for roll and pitch
3. **Detect maximum excursions** for occasional large motions
4. **Estimate wave period** using zero-crossing analysis
5. **Combine metrics** into 0-10 intensity scale
6. **Classify sea state** based on motion characteristics

### Performance

- **CPU Impact**: Minimal (<1% CPU on Raspberry Pi 5)
- **Memory**: ~1MB for rolling buffers
- **Serial**: Handles 100-200Hz sensor rate efficiently
- **SignalK Load**: Publishes 2Hz + 0.1Hz (very light)

## Sensor Specifications

**WitMotion WT901BLECL:**
- 9-axis IMU (3-axis accelerometer, gyro, magnetometer)
- Output rate: Up to 200Hz
- Interface: USB Serial (CH340 chip)
- Protocol: Binary frames (11 bytes each)
- Range: ±16g accel, ±2000°/s gyro, ±180° angle

## Future Enhancements

- Kalman filtering for smoother attitude
- Wave height estimation
- Impact detection (hard landing, collision)
- Motion sickness prediction
- Historical sea state comparison

---

Part of the M/Y Becoming AI-accessible vessel project.
