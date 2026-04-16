# Vessel Logbook

Manual trip logging with automated data enrichment from vessel systems.

## Overview

Instead of trying to automatically detect trips (unreliable), this app lets the captain manually create trip log entries. When you specify departure and arrival times, the system automatically:

- ✅ Queries vessel-data-logger for that timeframe
- ✅ Calculates distance traveled, engine hours, fuel consumption
- ✅ Analyzes speeds, depths, RPM profiles
- ✅ Generates statistical summaries
- ✅ (Future) AI-generated narrative summaries

## Features

**Current:**
- Manual trip entry (start/end time, locations, crew, notes)
- Automatic data enrichment from logs
- Trip list view with stats
- Detailed trip analysis
- JSON file storage

**Planned:**
- GPS track maps (Leaflet.js)
- Weather conditions at departure/arrival  
- AI-generated voyage narratives
- Photo uploads linked to trips
- Export to PDF logbook
- Maintenance correlation (engine hours tracking)

## Installation

```bash
cd apps/vessel-logbook
npm install
```

## Usage

### Development
```bash
npm run dev  # Uses nodemon for auto-reload
```

### Production
```bash
npm start
```

Access at: `http://localhost:3200`

## Configuration

Environment variables:

```bash
PORT=3200                                           # Web server port
SIGNALK_URL=http://localhost:3100                  # SignalK server
LOGGER_DATA_DIR=/path/to/vessel-data-logger/logs   # Log files location
TRIPS_DIR=./data/trips                              # Where to store trip files
```

## How It Works

1. **Captain creates trip:**
   - Opens web UI
   - Clicks "New Trip Log"
   - Enters departure/arrival times
   - Optionally adds locations, crew, notes

2. **System enriches data:**
   - Backend queries vessel-data-logger JSONL files for timeframe
   - Parses position, speed, depth, engine data
   - Calculates:
     - Distance (nautical miles)
     - Average/max speed (knots)
     - Engine hours added (port/starboard)
     - Average RPM
     - Depth statistics

3. **View trip:**
   - Trip card shows summary stats
   - Click for detailed analysis
   - All data stored in JSON file

## API Endpoints

### `GET /api/trips`
List all trips (sorted by date, newest first)

### `GET /api/trips/:id`
Get specific trip details

### `POST /api/trips`
Create new trip

**Request body:**
```json
{
  "startTime": "2026-04-12T09:00:00Z",
  "endTime": "2026-04-12T12:30:00Z",
  "from": "Hilton Head Marina",
  "to": "Daufuskie Island",
  "crew": ["Geoff", "Sarah"],
  "notes": "Beautiful weather, calm seas"
}
```

**Response:**
```json
{
  "id": "trip-2026-04-12T09-00-00-000Z",
  "startTime": "2026-04-12T09:00:00Z",
  "endTime": "2026-04-12T12:30:00Z",
  "from": "Hilton Head Marina",
  "to": "Daufuskie Island",
  "crew": ["Geoff", "Sarah"],
  "notes": "Beautiful weather, calm seas",
  "analysis": {
    "duration": {
      "hours": 3,
      "minutes": 30,
      "formatted": "3h 30m"
    },
    "distance": {
      "nauticalMiles": 18.2,
      "kilometers": 33.7
    },
    "speed": {
      "average": 5.2,
      "max": 7.8,
      "unit": "knots"
    },
    "engineHours": {
      "port": 3.5,
      "starboard": 3.5,
      "unit": "hours"
    },
    "engineRPM": {
      "port": { "average": 1850, "max": 2200 },
      "starboard": { "average": 1820, "max": 2180 }
    },
    "depth": {
      "average": 28.5,
      "max": 42.0,
      "min": 12.5,
      "unit": "feet"
    },
    "startPosition": {
      "lat": 32.428504,
      "lon": -80.681160
    },
    "endPosition": {
      "lat": 32.130434,
      "lon": -80.876614
    }
  },
  "createdAt": "2026-04-12T13:00:00Z",
  "updatedAt": "2026-04-12T13:00:00Z"
}
```

### `PUT /api/trips/:id`
Update trip (e.g., add notes, correct times)

### `DELETE /api/trips/:id`
Delete trip

## File Structure

```
apps/vessel-logbook/
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   └── trips.js          # Trip CRUD operations
│   └── lib/
│       └── log-analyzer.js   # Parses vessel-data-logger files
├── public/
│   ├── index.html            # Web UI
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js            # Frontend logic
├── data/
│   └── trips/                # Trip JSON files
├── package.json
└── README.md
```

## Integration with vessel-data-logger

The log analyzer reads JSONL files in format: `YYYY-MM-DD-HH.jsonl`

It looks for these SignalK paths:
- `navigation.position.value` (GPS coordinates)
- `navigation.speedOverGround.value` (m/s)
- `environment.depth.belowTransducer.value` (meters)
- `propulsion.port.runTime.value` (seconds)
- `propulsion.starboard.runTime.value` (seconds)
- `propulsion.port.revolutions.value` (Hz)
- `propulsion.starboard.revolutions.value` (Hz)
- `tanks.fuel.port.currentLevel.value` (ratio 0-1)
- `tanks.fuel.starboard.currentLevel.value` (ratio 0-1)

## Deployment

### Systemd Service

Create `/etc/systemd/system/vessel-logbook.service`:

```ini
[Unit]
Description=Vessel Logbook Web Application
After=network.target

[Service]
Type=simple
User=geoff
WorkingDirectory=/home/geoff/becoming/apps/vessel-logbook
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3200
Environment=SIGNALK_URL=http://localhost:3100
Environment=LOGGER_DATA_DIR=/home/geoff/becoming/apps/vessel-data-logger/logs
Environment=TRIPS_DIR=/home/geoff/becoming/apps/vessel-logbook/data/trips

StandardOutput=journal
StandardError=journal
SyslogIdentifier=vessel-logbook

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable vessel-logbook
sudo systemctl start vessel-logbook
sudo systemctl status vessel-logbook
```

### Nginx Configuration

Add to nginx config to make it accessible via `http://becoming-hub/logbook`:

```nginx
location /logbook {
    proxy_pass http://localhost:3200;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Future Enhancements

- **GPS Track Maps**: Leaflet.js with route visualization
- **AI Summaries**: Claude/GPT generates narrative voyage reports
- **Photo Uploads**: Link photos to trips
- **Weather Data**: Fetch historical weather for trip timeframe
- **Maintenance Tracking**: "Engine hours since last oil change"
- **Export**: PDF logbook format
- **Sharing**: Share trip with crew via link
- **Statistics**: Yearly summaries, most-visited locations

## License

MIT
