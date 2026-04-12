# Vessel Event Handler

Webhook service that processes vessel state change events from the SignalK State Detectors plugin.

## Architecture

**Event Flow:**
```
SignalK State Detectors Plugin → Webhook → Event Handler → Business Logic
  (detects state change)      (fires POST)   (routes event)   (voyage logs, AI, etc.)
```

**Benefits:**
- **Separation of Concerns**: Plugin stays lightweight, business logic lives here
- **Flexibility**: Add new event handlers without modifying the plugin
- **Rich Processing**: Access to databases, external APIs, AI, logs, etc.
- **Testability**: Test handlers independently

## How It Works

1. **State Detectors Plugin** detects a state change (e.g., `vessel.underway` changes to `true`)
2. **Plugin fires webhook**: `POST http://localhost:4000/events/vessel/underway`
   ```json
   {
     "value": true,
     "timestamp": "2026-04-08T10:30:00.000Z"
   }
   ```
3. **Event Handler** routes to registered handler (e.g., `handlers/underway.js`)
4. **Handler** executes business logic:
   - Query SignalK for current vessel state
   - Access historical data from logs
   - Call external APIs (weather, geocoding, AI)
   - Create/update records
   - Generate reports

## Event Handlers

### Underway (`vessel/underway`)
Tracks voyage sessions.

**On `true`:**
- Creates voyage record
- Captures starting position, conditions, fuel level
- Records timestamp

**On `false`:**
- Closes voyage record
- Calculates distance, duration, fuel consumption
- (TODO) Generates AI voyage summary
- (TODO) Identifies start/end marinas/anchorages via reverse geocoding
- (TODO) Aggregates weather/sea state data from logs

### Inverter (`electrical/inverterActive`)
Tracks inverter usage sessions.

**On `true`:**
- Creates inverter session record
- Captures battery state (voltage, SOC, current)
- Records AC/DC loads

**On `false`:**
- Closes session record
- Calculates battery consumption (SOC drop)
- (TODO) Integrates load data from logs (average, peak)
- (TODO) Calculates efficiency metrics

## Creating New Handlers

Create a new file in `handlers/`:

```javascript
/**
 * handlers/my-event.js
 */

let logger;
let config;

function register(registerHandler, loggerInstance, configInstance) {
  logger = loggerInstance;
  config = configInstance;
  
  // Register handler for specific event path
  registerHandler('my/event/path', handleMyEvent);
}

async function handleMyEvent(value, timestamp, eventPath) {
  logger.info(`Handling ${eventPath}: ${value} at ${timestamp}`);
  
  // Your business logic here
  // - Fetch SignalK data
  // - Query logs
  // - Call external APIs
  // - Generate reports
  
  return {
    action: 'my_action_completed',
    someData: 'result'
  };
}

module.exports = { register };
```

The service will automatically load all `.js` files in the `handlers/` directory on startup.

## Configuration

Environment variables (or `.env` file):

```bash
PORT=4000                                    # Webhook service port
SIGNALK_URL=http://localhost:3100           # SignalK server URL
LOG_LEVEL=info                              # Logging level (debug, info, warn, error)
LOG_DIR=/home/geoff/becoming/logs/events    # Where to store event logs
```

## Installation & Deployment

### Local Development
```bash
cd apps/vessel-event-handler
npm install
npm run dev  # Uses nodemon for auto-reload
```

### Raspberry Pi Deployment
```bash
# On Pi
cd ~/becoming/apps/vessel-event-handler
npm install
npm start
```

### Systemd Service
Create `/etc/systemd/system/vessel-event-handler.service`:

```ini
[Unit]
Description=Vessel Event Handler Webhook Service
After=network.target signalk.service
Wants=signalk.service

[Service]
Type=simple
User=geoff
WorkingDirectory=/home/geoff/becoming/apps/vessel-event-handler
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=SIGNALK_URL=http://localhost:3100
Environment=LOG_DIR=/home/geoff/becoming/logs/events

StandardOutput=journal
StandardError=journal
SyslogIdentifier=vessel-event-handler

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable vessel-event-handler
sudo systemctl start vessel-event-handler
sudo systemctl status vessel-event-handler
```

View logs:
```bash
sudo journalctl -u vessel-event-handler -f
```

## Plugin Configuration

In SignalK Admin UI, configure the State Detectors plugin to fire webhooks:

```json
{
  "webhook": {
    "enabled": true,
    "baseUrl": "http://localhost:4000",
    "timeout": 5000
  },
  "detectors": [
    {
      "name": "Vessel Underway",
      "statePath": "vessel.underway",
      "expression": "navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5",
      "enabled": true
    }
  ]
}
```

When `vessel.underway` changes, the plugin will POST to:
```
http://localhost:4000/events/vessel/underway
```

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "vessel-event-handler",
  "timestamp": "2026-04-08T10:30:00.000Z",
  "config": {
    "signalkUrl": "http://localhost:3100",
    "handlersLoaded": 2
  }
}
```

### `POST /events/*`
Webhook endpoint for state change events.

**URL Pattern:** `/events/{path}` where `{path}` is the state path with dots replaced by slashes.

**Request Body:**
```json
{
  "value": true,
  "timestamp": "2026-04-08T10:30:00.000Z"
}
```

**Response:**
```json
{
  "status": "success",
  "eventPath": "vessel/underway",
  "value": true,
  "result": {
    "action": "voyage_started",
    "voyageId": "voyage-2026-04-08T10-30-00-000Z",
    "startTime": "2026-04-08T10:30:00.000Z"
  }
}
```

## Future Enhancements

- **AI Voyage Reports**: Use OpenAI/Claude to generate natural language voyage summaries
- **Marina Identification**: Reverse geocode start/end positions to identify marinas/anchorages
- **Weather Integration**: Fetch historical weather data for voyage conditions
- **Log Analysis**: Integrate vessel-data-logger JSONL files for detailed analytics
- **Alerting**: Send notifications for critical events (e.g., inverter failure, low fuel)
- **Dashboard**: Web UI showing voyage history, inverter sessions, analytics
- **Database**: Store events in PostgreSQL/SQLite for querying and reporting

## License

MIT
