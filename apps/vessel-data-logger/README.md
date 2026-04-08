# Vessel Data Logger

Cloud-backed data logging service for M/Y Becoming that subscribes to SignalK data, stores it in MongoDB Atlas, and provides a web UI for configuration and visualization plus an API for AI/MCP access.

## Features

- **Real-time SignalK subscription** - WebSocket delta stream for live data
- **Cloud storage** - MongoDB Atlas for unlimited retention
- **In-memory cache** - Fast snapshot queries without database roundtrips
- **Configurable logging** - Select which paths to log with custom intervals and thresholds
- **Web UI** - Dashboard, configuration, data viewer, and path browser
- **REST API** - Snapshot and historical queries for AI/MCP integration
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
- `deltaThreshold`: Minimum change to trigger write (null = disabled)
- `description`: Human-readable label for UI

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

**GET `/api/events`**
- Server-Sent Events stream for live updates

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
