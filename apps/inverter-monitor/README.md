# Sungold Inverter Monitor

Node.js application to monitor a Sungold inverter (SPH6548P) via Modbus TCP and publish data to SignalK via MQTT.

## Features

- **Real-time Modbus TCP monitoring** - Custom lightweight client for reliable communication
- **Mobile-friendly web dashboard** - Responsive tabbed interface with live updates
- **SignalK integration** - Publishes to MQTT with SignalK-compliant paths
- **Split-phase AC support** - Monitors L1/L2 voltage, current, and power
- **Battery monitoring** - SoC, voltage, current, temperature, BMS data
- **Solar PV tracking** - Dual string monitoring with power generation
- **Energy statistics** - Daily and lifetime energy counters
- **Power consumption logging** - CSV-based historical tracking with 5-minute aggregation
- **Light/Dark mode** - User-selectable theme with persistence

## Hardware Setup

- Sungold SPH6548P Inverter
- Waveshare RS-485 to WiFi bridge (configured for Modbus TCP)
- Raspberry Pi (or any Node.js compatible device) on the same network

## Installation

### On Raspberry Pi

```bash
# Clone the repository
git clone git@github.com:squidmarks/sungold-inverter-monitor.git
cd sungold-inverter-monitor

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env
```

### Configuration

Edit `.env` with your settings:

```env
INVERTER_HOST=192.168.1.194          # IP address of RS-485 to WiFi bridge
INVERTER_PORT=8899                   # Modbus TCP port
SLAVE_ID=1                           # Modbus slave ID
MQTT_HOST=localhost                  # MQTT broker host (SignalK)
MQTT_PORT=1883                       # MQTT broker port
MQTT_BASE_TOPIC=vessels/self         # SignalK base topic
POLL_INTERVAL_MS=3000                # Polling interval (3 seconds recommended)
WEB_PORT=3000                        # Web dashboard port
```

## Running

### Manual Start

```bash
npm start
```

Access the dashboard at `http://localhost:3000` or `http://<pi-ip-address>:3000`

### Run as System Service (Auto-start on boot)

```bash
# Copy the service file
sudo cp inverter-monitor.service /etc/systemd/system/

# Edit if your paths differ
sudo nano /etc/systemd/system/inverter-monitor.service

# Reload systemd, enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable inverter-monitor
sudo systemctl start inverter-monitor

# Check status
sudo systemctl status inverter-monitor

# View logs
sudo journalctl -u inverter-monitor -f
```

## SignalK Integration

The monitor publishes data to MQTT using SignalK-compliant paths under `vessels/self/electrical/`:

- **Batteries**: `electrical.batteries.0.*` (voltage, current, SoC, temperature)
- **Solar**: `electrical.solar.0.*` and `electrical.solar.1.*` (PV string 1 & 2)
- **Inverter AC Input**: `electrical.inverters.0.acin.*` (shore/generator power)
- **Inverter AC Output**: `electrical.inverters.0.acout.*` (inverter output and load)
- **Temperatures**: `electrical.inverters.0.temperature.*` (in Kelvin)
- **State**: `electrical.inverters.0.state` and `electrical.inverters.0.stateText`

Data will automatically appear in SignalK's Data Browser when the MQTT Gateway plugin is enabled.

## Web Dashboard

The dashboard provides a mobile-optimized interface with tabs:

- **Overview** - Key metrics, system runtime, energy summary
- **Battery** - Battery status, BMS data
- **Solar** - PV strings, energy generation
- **AC Power** - Load, AC input/output, temperatures

Features:
- Real-time updates via Server-Sent Events
- Light/Dark mode toggle
- Responsive design for mobile devices
- Sticky footer with status indicator

## Power Logging

The inverter monitor automatically logs power consumption data to CSV files for historical analysis.

### How It Works

- **Aggregation**: Every 5 minutes, samples are averaged and written to CSV
- **Storage**: Logs are stored in `./logs/` directory (created automatically)
- **Retention**: Keeps last 7 days of data, automatically deletes older logs
- **Size**: ~200KB for 7 days of data (~288 samples/day)

### Log Format

CSV files named `power-YYYY-MM-DD.csv` with columns:

```csv
timestamp,dc_voltage_avg,dc_current_avg,dc_power_avg,ac_l1_power_avg,ac_l2_power_avg,ac_total_power_avg,soc_avg,sample_count
2026-03-20T12:00:00.000Z,52.1,12.3,640.8,300.5,280.2,580.7,85.5,100
```

### Analyzing Logs

View power consumption over time:

```bash
# View today's log
cat logs/power-$(date +%Y-%m-%d).csv

# Calculate total AC consumption for today (kWh)
awk -F',' 'NR>1 {sum+=$7} END {print sum*5/60/1000 " kWh"}' logs/power-$(date +%Y-%m-%d).csv

# Find peak DC power draw
awk -F',' 'NR>1 {if($4>max)max=$4} END {print max " W"}' logs/power-*.csv
```

### Data Fields

- **dc_voltage_avg**: Average battery voltage (V)
- **dc_current_avg**: Average DC current (A) - positive = discharging
- **dc_power_avg**: Average DC power (W) - battery to inverter
- **ac_l1_power_avg**: Average AC L1 load power (W)
- **ac_l2_power_avg**: Average AC L2 load power (W)
- **ac_total_power_avg**: Average total AC load (W)
- **soc_avg**: Average battery state of charge (%)
- **sample_count**: Number of samples in this 5-minute interval

## Troubleshooting

### MQTT Connection Issues

```bash
# Test MQTT connection
mosquitto_sub -h localhost -t 'vessels/self/electrical/#' -v

# Check if port 1883 is listening
sudo netstat -tlnp | grep 1883
```

### Modbus Connection Issues

- Verify inverter IP address and port
- Check RS-485 to WiFi bridge configuration
- Ensure network connectivity: `ping <INVERTER_HOST>`
- Test Modbus connection: `npm run test` (if available)

### View Logs

```bash
# If running as systemd service
sudo journalctl -u inverter-monitor -f

# If running manually
# Logs are output to stdout
```

## Development

The codebase is organized into modules:

- `index.js` - Application entry point
- `modbus-client.js` - Custom Modbus TCP client
- `registers.js` - Register definitions from inverter protocol
- `data-parser.js` - Raw register data parser
- `polling-service.js` - Polling orchestration
- `mqtt-publisher.js` - SignalK-compliant MQTT publisher
- `web-server.js` - Express server with SSE support
- `power-logger.js` - CSV-based power consumption logging
- `terminal-formatter.js` - Terminal output formatting (legacy)
- `config.js` - Configuration loader

## License

MIT

## Credits

Built for M/Y Jefferson 48 - Monitoring a Sungold SPH6548P split-phase inverter system.
