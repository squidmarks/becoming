# Vessel Data Logger

Cloud-backed data logging service for M/Y Becoming that subscribes to SignalK data, stores it in MongoDB Atlas, and provides a web UI for configuration and visualization plus an API for AI/MCP access.

## Features

- **Real-time SignalK subscription** - WebSocket delta stream for live data
- **Cloud storage** - MongoDB Atlas for unlimited retention
- **In-memory cache** - Fast snapshot queries without database roundtrips
- **Configurable logging** - Select which paths to log with custom intervals and thresholds
- **Conditional logging** - Only log when specific conditions are met
- **Max interval heartbeat** - Ensure data is logged periodically even when unchanged
- **Event detection** - Automatic detection of state transitions (engine start/stop, vessel underway, etc.)
- **Nested object paths** - Query specific properties of object values (e.g., `navigation.position.longitude`)
- **Web UI** - Dashboard, configuration, data viewer, and path browser
- **REST API** - Snapshot, historical, and event queries for AI/MCP integration
- **Server-Sent Events** - Live updates in web UI
- **Light/Dark mode** - User-selectable theme with persistence

## Architecture

```
SignalK Server → WebSocket Client → In-Memory Cache + MongoDB Atlas
                                           ↓
                                     REST API + Web UI
                                           ↓
                                   AI Agents / MCP Server
```

**Key Components:**
- **SignalK Client**: Subscribes to user-configured paths via WebSocket
- **Data Cache**: LRU cache for latest values (instant snapshot access)
- **MongoDB Storage**: Time-series optimized cloud storage
- **API Server**: REST endpoints for snapshot, history, and configuration
- **Web UI**: Mobile-first responsive interface

## Installation

### Prerequisites

- Node.js v24+ (already installed on Pi)
- MongoDB Atlas account (free tier: 512MB)
- SignalK server running at `becoming-hub:3100`

### Setup Steps

1. **Navigate to directory**

```bash
cd ~/becoming/apps/vessel-data-logger
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment**

```bash
cp .env.example .env
nano .env
```

Add your MongoDB Atlas URI:
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/becoming?retryWrites=true&w=majority
```

To get a MongoDB Atlas URI:
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Database → Connect → Drivers → Copy connection string
4. Replace `<password>` with your database password

4. **Initialize configuration (optional)**

```bash
npm run init-config
```

This creates a default `config.json` with common vessel paths.

5. **Test run**

```bash
npm start
```

Access at: `http://localhost:3200` or `http://becoming-hub:3200`

## Running as System Service

### Install Service

```bash
sudo cp vessel-data-logger.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vessel-data-logger
sudo systemctl start vessel-data-logger
```

### Service Management

```bash
# Check status
sudo systemctl status vessel-data-logger

# View logs
sudo journalctl -u vessel-data-logger -f

# Restart service
sudo systemctl restart vessel-data-logger

# Stop service
sudo systemctl stop vessel-data-logger
```

## Nginx Configuration

Add to `/etc/nginx/sites-available/default`:

```nginx
location /data-logger/ {
    proxy_pass http://localhost:3200/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Then reload nginx:
```bash
sudo systemctl reload nginx
```

Access at: `http://becoming-hub/data-logger/`

## Configuration

### config.json

User-editable configuration file that controls what data is logged:

```json
{
  "subscriptions": [
    {
      "path": "navigation.position",
      "enabled": true,
      "logInterval": 10,
      "deltaThreshold": null,
      "description": "GPS position"
    },
    {
      "path": "propulsion.port.temperature",
      "enabled": true,
      "logInterval": 10,
      "deltaThreshold": 2,
      "description": "Port engine temperature",
      "condition": {
        "path": "propulsion.port.revolutions",
        "operator": ">",
        "value": 0
      }
    }
  ],
  "retention": {
    "highResolutionDays": 30,
    "downsampleAfterDays": 30,
    "deleteAfterDays": 365
  }
}
```

**Fields:**
- `path`: SignalK path (supports wildcards: `electrical.batteries.0.*`)
- `enabled`: Enable/disable logging
- `logInterval`: Seconds between writes (time-based logging)
- `maxInterval` (optional): Maximum seconds between writes, even if no change (heartbeat)
- `deltaThreshold`: Minimum change to trigger write (null = disabled)
  - For numbers: absolute difference
  - For `navigation.position`: distance in meters (Haversine formula)
  - For other objects: JSON equality comparison
- `description`: Human-readable label for UI
- `condition` (optional): Conditional logging - only write to storage if condition is met
  - `path`: SignalK path to check
  - `operator`: Comparison operator (`>`, `>=`, `<`, `<=`, `==`, `!=`)
  - `value`: Value to compare against

**Conditional Logging:**

Use the `condition` field to only log data when specific criteria are met. This is useful for:
- Only logging engine data when engines are running (RPM > 0)
- Only logging solar data when sun is up (solar voltage > threshold)
- Only logging HVAC data when system is active

**Example:** Log engine temperature only when engine is running:
```json
{
  "path": "propulsion.port.temperature",
  "condition": {
    "path": "propulsion.port.revolutions",
    "operator": ">",
    "value": 0
  }
}
```

**Note:** The condition is checked against cached values. The condition path must be actively subscribed (or have recent data in cache) for the condition to evaluate properly.

### Delta Threshold for Object Values

The service intelligently handles different data types when comparing values:

**1. Numeric Values (e.g., temperature, voltage)**
- Delta = absolute difference: `|newValue - oldValue|`
- Example: `52.3 → 52.8` = delta of `0.5`

**2. Position Objects (`navigation.position`)**
- Delta = geographic distance in meters (Haversine formula)
- Calculates great-circle distance between coordinates
- Example: Moving 5 meters at dock triggers if threshold is 10m? No. Moving 15m? Yes.
```json
{
  "latitude": 32.7857236,
  "longitude": -79.9097818
}
```

**3. Other Objects**
- Delta = JSON string comparison
- Returns `0` if identical, `null` if different
- No threshold-based logging (logs on any change or interval)

**Why this matters:**
- GPS at dock: Small coordinate drift (~0.00001° ≈ 1 meter) won't trigger logging
- Underway: Significant movement triggers logging immediately
- Storage optimization: No unnecessary logs for GPS noise at anchor

### Max Interval (Heartbeat Logging)

Use `maxInterval` to ensure data is logged periodically even when unchanged. This solves two problems:
1. **Proof of life**: Confirms sensor is still working and value is stable
2. **Storage optimization**: Balances frequent checks with storage efficiency

**Example:** GPS position at dock
```json
{
  "path": "navigation.position",
  "logInterval": 10,
  "maxInterval": 1800,
  "deltaThreshold": 10,
  "description": "GPS position (threshold in meters)"
}
```

Behavior:
- Normal operation: Logs every 10s when position changes >10m
- When stationary: Logs every 30min (1800s) as heartbeat
- Result: Not logging every 10s at dock, but still proving GPS is working

**Note:** For `navigation.position`, the threshold is in **meters** (calculated using Haversine formula for geographic distance). For numeric values, it's the absolute difference. For other objects, changes are detected via JSON comparison.

### Nested Object Property Paths

When a SignalK path has an object value, you can query specific properties using dot notation. This makes object values useful for visualization by extracting scalar numeric or string values.

**Example:** `navigation.position` stores this object:
```json
{
  "longitude": -79.9097818,
  "latitude": 32.7857236
}
```

**Available paths:**
- `navigation.position` - Returns the full object (not graphable)
- `navigation.position.longitude` - Returns just the longitude number
- `navigation.position.latitude` - Returns just the latitude number

**How it works:**
1. Subscribe to `navigation.position` in your configuration
2. Data is stored as complete objects in MongoDB
3. When querying, use nested paths like `navigation.position.longitude`
4. The service extracts the nested property from each stored object
5. Returns a time series of scalar values suitable for graphing

**Benefits:**
- **Efficient storage**: Store position once, query multiple properties
- **Flexible queries**: Can graph longitude, latitude, or both on same chart
- **Auto-discovery**: Paths API lists all available nested properties
- **Backward compatible**: Non-nested paths work exactly as before

**Path API example:**
```bash
GET /api/paths?filter=navigation.position
```

Returns:
```json
{
  "paths": [
    {
      "path": "navigation.position",
      "currentValue": {"longitude": -79.9097, "latitude": 32.7857}
    },
    {
      "path": "navigation.position.longitude",
      "currentValue": -79.9097,
      "isNested": true,
      "parentPath": "navigation.position"
    },
    {
      "path": "navigation.position.latitude",
      "currentValue": 32.7857,
      "isNested": true,
      "parentPath": "navigation.position"
    }
  ]
}
```

**Multi-path query example:**
```bash
GET /api/history?path=navigation.position.longitude,navigation.position.latitude&start=...&end=...
```

Returns two separate time series from a single database query.

**Other object paths this works with:**
- `navigation.attitude.roll` / `.pitch` / `.yaw`
- `environment.inside.temperature` (if it's nested)
- Any SignalK path where the value is an object with scalar properties

### Event Detection

The service automatically detects and logs significant state transitions to a separate `vessel_events` collection.

**Detected Event Types:**
- **Threshold Crossings**: Value crosses a threshold (engine RPM: 0 → 650)
- **Sign Changes**: Positive ↔ Negative (battery current)
- **State Changes**: Boolean/enum transitions

**Configuration:**
```json
{
  "eventDetection": {
    "enabled": true,
    "rules": [
      {
        "name": "port_engine_started",
        "path": "propulsion.port.revolutions",
        "type": "threshold_crossing",
        "threshold": 100,
        "direction": "rising",
        "description": "Port engine started"
      },
      {
        "name": "vessel_underway",
        "path": "navigation.speedOverGround",
        "type": "threshold_crossing",
        "threshold": 0.5,
        "direction": "rising",
        "description": "Vessel started moving"
      },
      {
        "name": "battery_charging",
        "path": "electrical.batteries.0.current",
        "type": "sign_change",
        "direction": "negative",
        "description": "Battery started charging"
      }
    ]
  }
}
```

**Event Document Structure:**
```json
{
  "name": "port_engine_started",
  "type": "threshold_crossing",
  "path": "propulsion.port.revolutions",
  "description": "Port engine started",
  "timestamp": "2026-04-08T14:30:15.123Z",
  "source": "nmea.propulsion",
  "fromValue": 0,
  "toValue": 650,
  "threshold": 100,
  "direction": "rising"
}
```

**Benefits:**
- Queryable events ("show me all engine starts this month")
- Rich context (from/to values, timestamps)
- Foundation for alerts and notifications
- AI-friendly semantic data
- Separate from time-series data (cleaner queries)

### Enhanced Event Detection (Duration Events)

The enhanced event detector supports **duration events** with complex conditions, debouncing, and rich data capture. This is ideal for tracking vessel activities, maintenance windows, and operational states.

**Key Features:**
- **Duration Events**: Track start and end times (e.g., "Vessel Underway" from departure to arrival)
- **Complex Conditions**: AND/OR logic with nested rules
- **Debouncing**: Requires N consecutive samples to prevent false triggers
- **Data Capture**: Automatically capture relevant data at start/end
- **User Review**: Events can be pending, confirmed, or dismissed
- **Wildcards**: Match multiple paths (e.g., `propulsion.*.revolutions`)

**Example Configuration:**
```json
{
  "enhancedEventDetectors": [
    {
      "id": "vessel_underway",
      "name": "Vessel Underway",
      "description": "Vessel moving at cruising speed with engines running",
      "type": "duration",
      "enabled": true,
      "category": "navigation",
      "tags": ["transit", "navigation"],
      
      "startConditions": {
        "operator": "AND",
        "stability": {
          "consecutiveSamples": 3,
          "withinDuration": 60
        },
        "rules": [
          {
            "path": "navigation.speedOverGround",
            "operator": ">",
            "value": 1.5
          },
          {
            "operator": "OR",
            "rules": [
              { "path": "propulsion.port.revolutions", "operator": ">", "value": 300 },
              { "path": "propulsion.starboard.revolutions", "operator": ">", "value": 300 }
            ]
          }
        ]
      },
      
      "endConditions": {
        "operator": "AND",
        "stability": {
          "consecutiveSamples": 6,
          "withinDuration": 300
        },
        "rules": [
          { "path": "navigation.speedOverGround", "operator": "<", "value": 0.3 },
          { "path": "propulsion.port.revolutions", "operator": "<", "value": 50 },
          { "path": "propulsion.starboard.revolutions", "operator": "<", "value": 50 }
        ]
      },
      
      "captureData": "navigation.position,navigation.speedOverGround,propulsion.*.revolutions",
      "autoConfirm": false,
      "notifications": {
        "enabled": true,
        "onStart": true,
        "onEnd": true
      }
    }
  ]
}
```

**Stability/Debouncing:**
- **consecutiveSamples**: Number of samples that must match consecutively
- **withinDuration**: Maximum time span for those samples (seconds)
- **Strict reset**: First false sample resets the counter
- **Independent trackers**: Start and end have separate stability tracking
- **Default**: 2 samples within 30 seconds

**How It Works:**
1. Evaluator runs every 5 seconds with all current cache values
2. Each detector checks start conditions (if inactive) or end conditions (if active)
3. StabilityTracker requires N consecutive true evaluations
4. One false evaluation resets the counter (prevents noise)
5. When stable, event starts/ends and is written to MongoDB
6. Event state: `active` → `pending` → `confirmed` or `dismissed`

**Example: Vessel Underway**
- **Start**: SOG > 1.5kts AND (port OR starboard) > 300 RPM for 3 samples within 60s
- **End**: SOG < 0.3kts AND both engines < 50 RPM for 6 samples within 5 minutes
- **Asymmetric**: Easier to start (3 samples), harder to end (6 samples) prevents oscillation
- **Captures**: Position, SOG, COG, engine RPM at start and end

**Rich Event Schema:**
```json
{
  "eventId": "vessel_underway_20260408T143022000Z",
  "detectorId": "vessel_underway",
  "name": "Vessel Underway",
  "type": "duration",
  "state": "pending",
  "category": "navigation",
  "tags": ["transit", "navigation"],
  
  "startTime": "2026-04-08T14:30:22Z",
  "endTime": "2026-04-08T16:45:10Z",
  "duration": 8088,
  
  "startData": {
    "navigation.position": { "longitude": -79.909, "latitude": 32.785 },
    "navigation.speedOverGround": 5.2,
    "propulsion.port.revolutions": 1200,
    "propulsion.starboard.revolutions": 1210
  },
  
  "endData": {
    "navigation.position": { "longitude": -79.932, "latitude": 32.774 },
    "navigation.speedOverGround": 0.1
  },
  
  "userNotes": "Ran to Charleston Harbor for fuel",
  "userFields": { "destination": "Charleston Harbor" }
}
```

**API Endpoints:**
```bash
# Event Management
GET  /api/events/active          # Currently active duration events
GET  /api/events/pending         # Events awaiting user review
POST /api/events/:id/confirm     # Confirm event (add notes/tags)
POST /api/events/:id/dismiss     # Dismiss false positive
POST /api/events/:id/update      # Update notes/tags
```

**See `example-detectors.json` for complete configuration examples including:**
- Vessel underway detection
- Engine running tracker (with auto-confirm)
- Low battery alert

**Hot Reload:** The service automatically reloads when `config.json` changes (no restart required).

### Environment Variables

See `.env.example` for full list. Key variables:

- `SIGNALK_HOST`: SignalK server hostname (default: `becoming-hub`)
- `SIGNALK_PORT`: SignalK server port (default: `3100`)
- `MONGO_URI`: MongoDB Atlas connection string (required)
- `WEB_PORT`: HTTP server port (default: `3200`)
- `CACHE_MAX_ENTRIES`: Max cache entries (default: `10000`)
- `CACHE_TTL_SECONDS`: Cache TTL in seconds (default: `300`)

## Web Interface

### Dashboard

- System status (SignalK, MongoDB connections)
- Active subscriptions count
- Storage statistics
- Recent activity log (last 50 data points)

### Configuration

- View/edit all logging subscriptions
- Enable/disable paths
- Set intervals and delta thresholds
- Add/remove paths
- Configure retention policy

### Data Viewer

- Select paths to visualize
- Time range presets (1h, 6h, 24h, 7d, 30d) or custom range
- Interactive charts (Chart.js)
- Statistics (min, max, average)
- Export to CSV

### Available Paths

- Browse all SignalK paths
- Filter by category (electrical, navigation, etc.)
- View current values and sources
- Quick-add paths to logging configuration

## REST API

Base URL: `http://becoming-hub:3200/api` (or `/data-logger/api` via nginx)

### Snapshot Endpoints

**GET `/api/snapshot`**
- Returns latest values for all subscribed paths
- Response time: <10ms (from cache)

**GET `/api/snapshot/:path`**
- Returns latest value for specific path
- Example: `/api/snapshot/navigation.position`

### Historical Query Endpoints

**GET `/api/history`**
- Query time-series data
- Parameters:
  - `path` (required): SignalK path (comma-separated for multiple)
  - `start` (required): ISO 8601 timestamp
  - `end` (required): ISO 8601 timestamp
  - `limit` (optional): Max records (default: 1000, max: 10000)
  - `downsample` (optional): Bucket size in seconds

Example:
```bash
curl "http://localhost:3200/api/history?path=electrical.batteries.0.voltage&start=2026-04-08T00:00:00Z&end=2026-04-08T23:59:59Z"
```

**GET `/api/history/aggregate`**
- Statistical aggregation over time ranges
- Parameters:
  - `path` (required)
  - `start`, `end` (required)
  - `bucket` (required): Aggregation interval (e.g., "5m", "1h", "1d")
  - `functions`: Comma-separated (avg, min, max, count)

### Configuration Endpoints

**GET `/api/config`**
- Returns current configuration

**POST `/api/config`**
- Update configuration (full or partial)
- Auto-reloads and resubscribes

**GET `/api/paths`**
- List available SignalK paths
- Parameters:
  - `filter` (optional): Partial path filter (e.g., "electrical.")
  - `limit` (optional): Max results (default: 100, max: 1000)

Example:
```bash
curl "http://localhost:3200/api/paths?filter=electrical."
```

**GET `/api/status`**
- Service health and statistics

### Event Endpoints

**GET `/api/events/stream`**
- Server-Sent Events stream for live updates (data + events)

**GET `/api/events/recent`**
- Get recent events
- Parameters:
  - `limit` (optional): Max events to return (default: 50, max: 500)

**GET `/api/events/query`**
- Query historical events
- Parameters:
  - `start` (required): ISO 8601 timestamp
  - `end` (required): ISO 8601 timestamp
  - `name` (optional): Filter by event name
  - `limit` (optional): Max results (default: 1000, max: 10000)

Example:
```bash
curl "http://localhost:3200/api/events/query?start=2026-04-08T00:00:00Z&end=2026-04-08T23:59:59Z&name=port_engine_started"
```

**GET `/api/events/states`**
- Get current state of all tracked events
- Returns which events are currently "active"

## Data Storage

### In-Memory Cache

- Stores latest value for each subscribed path
- LRU eviction when capacity reached
- TTL: 5 minutes (stale data detection)
- Used for instant snapshot queries

### MongoDB Atlas

**Database:** `becoming`
**Collection:** `vessel_data`

**Document Schema:**
```json
{
  "timestamp": ISODate("2026-04-08T12:34:56.789Z"),
  "path": "navigation.position",
  "value": { "latitude": 47.6062, "longitude": -122.3321 },
  "source": "GPS",
  "context": "vessels.self"
}
```

**Indexes:**
- `timestamp` (descending)
- `path` (ascending)
- Compound: `path + timestamp`

**Write Strategy:**
- Batch writes (up to 100 documents per insert)
- Time-based: Write at configured interval
- Delta-based: Write when value exceeds threshold
- 5-second flush interval for pending writes

## Future MCP Server Integration

The REST API is designed for easy MCP server wrapping (future `apps/vessel-data-mcp/`):

**Proposed MCP Tools:**
1. `get_vessel_snapshot` - Current state of all vessel systems
2. `query_vessel_history` - Time-series data for analysis
3. `list_vessel_paths` - Discover available data points
4. `get_vessel_status` - Service health and connectivity

AI agents can use the MCP server to:
- Get real-time vessel status
- Query historical data for analysis
- Detect anomalies and trends
- Answer natural language questions about vessel operations

## Development

### File Structure

```
apps/vessel-data-logger/
├── README.md
├── package.json
├── .env.example
├── .env                         # Git ignored
├── .gitignore
├── config.json                  # User-editable subscriptions
├── index.js                     # Application entry point
├── config-manager.js            # Config file watcher/loader
├── data-cache.js                # In-memory LRU cache
├── signalk-client.js            # WebSocket delta stream client
├── mongo-storage.js             # MongoDB Atlas writer
├── api-server.js                # Express REST API + SSE
├── scripts/
│   └── init-config.js           # Initialize default config
├── public/
│   ├── index.html              # Dashboard
│   ├── config.html             # Configuration page
│   ├── viewer.html             # Data viewer/grapher
│   ├── paths.html              # Available paths browser
│   └── style.css               # Shared styles
└── vessel-data-logger.service   # systemd unit file
```

### Module Overview

- `config-manager.js`: Loads, saves, and watches `config.json` for changes
- `data-cache.js`: LRU cache with TTL for latest values
- `signalk-client.js`: WebSocket client with auto-reconnect and subscription management
- `mongo-storage.js`: MongoDB writer with batch inserts and query methods
- `api-server.js`: Express HTTP server with REST API and SSE for live updates
- `index.js`: Main application that orchestrates all modules

### Adding New Features

1. **New API endpoint**: Add route in `api-server.js`
2. **New storage query**: Add method to `mongo-storage.js`
3. **New UI page**: Create HTML file in `public/` and add nav link
4. **New configuration option**: Update schema in `config-manager.js` and UI

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u vessel-data-logger -n 50

# Common issues:
# - MongoDB URI not configured in .env
# - SignalK not running
# - Port 3200 already in use
```

### No data appearing

1. Check SignalK connection:
```bash
curl http://becoming-hub:3100/signalk/v1/api/vessels/self
```

2. Verify subscriptions are enabled in `config.json`

3. Check service logs for errors:
```bash
sudo journalctl -u vessel-data-logger -f
```

### MongoDB connection issues

1. Verify connection string in `.env`
2. Check network connectivity (requires internet)
3. Verify database user permissions in MongoDB Atlas
4. Check if IP address is whitelisted (Atlas → Network Access)

### Configuration changes not applying

The service automatically reloads `config.json` changes. If not working:

1. Check file permissions: `ls -la config.json`
2. Verify JSON syntax: `cat config.json | jq`
3. Restart service: `sudo systemctl restart vessel-data-logger`

## Performance

- **Snapshot queries**: <10ms (from cache)
- **Historical queries**: <500ms (24-hour range)
- **WebSocket reconnection**: <5s after SignalK restart
- **Storage**: ~2-3MB/day (compressed, varies by subscription count)
- **Memory usage**: ~50MB (Node.js + cache)
- **CPU usage**: <1% idle, <5% during data ingestion

## License

MIT

## Credits

Built for M/Y Becoming - A 48' Jefferson motor yacht exploring AI-accessible vessel operations.
