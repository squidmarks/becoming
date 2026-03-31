# RS11 Configuration Utility

Web-based configuration tool for the NoLand RS11 Engine Data Converter. This replaces the Windows-only setup utility with a cross-platform web application.

## Overview

The RS11 converts analog engine sensor data and tachometer signals to NMEA 2000 messages. This utility provides a modern web interface for:

- Connecting to RS11 via USB serial port
- Configuring engine instances and RPM settings
- Setting up 6 analog inputs (A1-A6)
- Real-time monitoring of sensor values
- Saving/loading configurations
- Device control (stop/restart/reset)

## Features

- **Cross-platform**: Works on Linux, macOS, and Windows
- **Web-based**: Access from any device on your network
- **Real-time updates**: Live sensor readings via WebSocket
- **Configuration management**: Save and restore settings
- **Status logging**: Track all device communication

## Installation

### Prerequisites

- Node.js 18+ (comes with npm)
- RS11 device connected via USB

### Setup

```bash
# Navigate to the project directory
cd apps/rs11-configuration-utility

# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at `http://localhost:3002`

## Usage

### 1. Connect to Device

1. Click "Refresh" to scan for available serial ports
2. Select the RS11 from the dropdown (usually shows as FTDI or USB Serial)
3. Click "Connect"
4. Wait for the green "Connected" indicator

### 2. Configure Engine Settings

**Engine Instance & RPM:**
- Set Instance (0-9) for Port engine
- Set Stbd Instance for Starboard engine (if dual engine)
- Configure Port PPR (Pulses Per Revolution)
- Configure Stbd PPR (if applicable)
- Click "Apply Engine Config"

### 3. Configure Analog Inputs

For each analog input (A1-A6):

1. Select Port or Stbd engine assignment
2. Choose measurement type from dropdown:
   - Oil Press
   - Oil Temp
   - Coolant Temp
   - Coolant Press
   - Fuel Press
   - Fuel Level
   - Trans Press
   - Trans Temp
   - Battery Volts (A5/A6)

3. Enable options (A1-A4 only):
   - **Current**: Enable internal sender current for resistive sensors
   - **Smooth**: Enable signal smoothing

4. Click "Send" to apply configuration

### 4. Monitor Live Values

Once connected, the "Gauge Volts" displays show real-time voltage readings from each analog input.

### 5. Query Configuration

Click "Query Config" to read and display the current device configuration. This also updates the UI with stored values.

### 6. Save Configuration

Click "Save Config" to save the current settings to a named configuration file. This allows you to:
- Backup your settings
- Quickly restore configurations
- Share setups between devices

## Device Commands

- **Query Config**: Read current device configuration
- **Stop Device**: Halt device operation
- **Restart Device**: Reboot the RS11
- **Factory Reset**: ⚠️ Erase all settings and restore defaults

## RS11 Analog Input Assignment Table

| Input | Voltage Range | Sender Current | Typical Use |
|-------|---------------|----------------|-------------|
| A1    | 0-20V         | ✓              | Trans Oil Press, Oil Press, Temp, etc. |
| A2    | 0-20V         | ✓              | Trans Oil Press, Oil Press, Temp, etc. |
| A3    | 0-20V         | ✓              | Trans Oil Press, Oil Press, Temp, etc. |
| A4    | 0-20V         | ✓              | Trans Oil Press, Oil Press, Temp, etc. |
| A5    | 0-30V         | ✗              | Battery Voltage (Port), any gauge output |
| A6    | 0-30V         | ✗              | Battery Voltage (Stbd), any gauge output |

## Troubleshooting

### Can't see serial ports
- Ensure RS11 is connected via USB
- On Linux: May need to add user to `dialout` group: `sudo usermod -a -G dialout $USER`
- On macOS: Install FTDI drivers if needed (macOS 11+ may have issues)

### Connection fails
- Check that no other application is using the port
- Try a different USB port
- Verify baud rate is 4800 (default)

### No live values updating
- Ensure device is connected and powered
- Check that engine power is supplied to RS11
- Verify analog inputs are properly wired

## API Endpoints

The backend provides a REST API for programmatic access:

### Device Connection
- `GET /api/ports` - List available serial ports
- `POST /api/connect` - Connect to device
- `POST /api/disconnect` - Disconnect from device
- `GET /api/status` - Get connection status

### Configuration
- `GET /api/config` - Query device configuration
- `GET /api/live` - Get live sensor values
- `POST /api/config/instance` - Set engine instance
- `POST /api/config/rpm` - Set RPM configuration
- `POST /api/config/analog/:port` - Configure analog input

### Device Control
- `POST /api/device/stop` - Stop device
- `POST /api/device/restart` - Restart device
- `POST /api/device/reset` - Factory reset

### Configuration Management
- `POST /api/config/save` - Save configuration
- `GET /api/config/saved` - List saved configurations

## Technical Details

### Serial Communication
- **Protocol**: ASCII commands via USB serial
- **Baud Rate**: 4800 bps
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: None

### Command Format
Commands are ASCII strings terminated with `\r`:
- `@?` - Query configuration
- `@q` - Query live values
- `@Q(xxx)` - Set engine instance
- `@P(xxx)` - Set port PPR
- See `protocol.txt` for complete command reference

## Development

```bash
# Run in development mode with auto-restart
npm run dev

# Files
- index.js              # Express server
- rs11-serial.js        # Serial communication
- rs11-protocol.js      # Command protocol
- public/index.html     # Frontend UI
- public/style.css      # Styling
- public/app.js         # Frontend logic
```

## Running on Raspberry Pi

To run automatically on boot:

```bash
# Create systemd service
sudo nano /etc/systemd/system/rs11-config.service
```

Add:
```ini
[Unit]
Description=RS11 Configuration Utility
After=network.target

[Service]
Type=simple
User=geoff
WorkingDirectory=/home/geoff/becoming/apps/rs11-configuration-utility
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable rs11-config
sudo systemctl start rs11-config
```

## License

MIT

## Resources

- [RS11 Manual](docs/noland-rs11k_1pg.pdf)
- [Protocol Commands](docs/protocol.txt)
- [NoLand Engineering](http://www.noland-eng.com/)
