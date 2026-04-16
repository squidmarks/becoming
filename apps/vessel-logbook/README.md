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
- Master-detail UI with sidebar navigation
- "Capture Current Conditions" buttons to auto-fill from SignalK
- Fetch live engine hours, position, fuel, weather from vessel
- Automatic calculation of distance, duration, fuel used
- Predefined and custom tags/badges
- Trip editing and deletion
- MongoDB Atlas cloud storage
- Responsive trip list with stats
- Detailed trip analysis view

**Planned:**
- GPS track maps (Leaflet.js)
- Reverse geocoding for marina/anchorage names
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
# Server
PORT=3210                                           # Web server port
SIGNALK_URL=http://localhost:3100                  # SignalK server

# Storage (Required)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/becoming?retryWrites=true&w=majority

# Data sources (for future log analysis)
LOGGER_DATA_DIR=/path/to/vessel-data-logger/logs   # Historical log files
```

**MongoDB Required:**

MongoDB is the only supported storage backend. The service will not start without a valid `MONGO_URI`. 

Benefits:
- Cloud backup and redundancy
- Better query performance
- Advanced filtering and aggregation
- Full-text search
- Ready for AI features (vector search, similarity)
- Accessible from anywhere with proper authentication

## How It Works

1. **Captain creates trip:**
   - Opens web UI at `http://becoming-hub/logbook/`
   - Clicks "New Trip Log"
   - For departure: Click "Capture Current Conditions" to auto-fill from SignalK
   - Manually enter location name (future: reverse geocoding)
   - (Later) For arrival: Click "Capture Current Conditions" again
   - Add tags (marina, anchored, mooring ball, dolphins, etc.)
   - Add crew names
   - Add notes

2. **System enriches data:**
   - Fetches live data from SignalK API:
     - GPS position (lat/lon)
     - Engine hours (port/starboard)
     - Fuel levels (port/starboard tanks)
     - Weather (wind, barometer, temperature)
     - Sea state description
   - Calculates trip summaries:
     - Duration (hours/minutes)
     - Distance (Haversine formula, nautical miles)
     - Average speed (knots)
     - Engine hours added per engine
     - Fuel used per tank

3. **View and edit trips:**
   - Trip list shows summary cards (sorted newest first)
   - Click for detailed trip view
   - Click "Edit" to update any trip
   - All data stored in MongoDB (or JSON files as fallback)

## API Endpoints

### `GET /api/trips`
List all trips (sorted by date, newest first)

### `GET /api/trips/:id`
Get specific trip details

### `GET /api/trips/current-conditions`
Fetch current vessel conditions from SignalK API

**Response:**
```json
{
  "timestamp": "2026-04-12T09:00:00.000Z",
  "position": {
    "latitude": 32.428504,
    "longitude": -80.681160
  },
  "engineHours": {
    "port": 1234.56,
    "starboard": 1235.12
  },
  "weather": {
    "windSpeed": 8.5,
    "windDirection": 225,
    "barometer": 101325,
    "temperature": 293.15
  },
  "seaState": "slight"
}
```

### `POST /api/trips`
Create new trip

**Request body:**
```json
{
  "start": {
    "time": "2026-04-12T09:00:00Z",
    "locationName": "Hilton Head Marina",
    "position": {
      "latitude": 32.428504,
      "longitude": -80.681160
    },
    "engineHours": {
      "port": 1234.56,
      "starboard": 1235.12
    },
    "fuelLevel": {
      "port": 0.85,
      "starboard": 0.82
    },
    "conditions": {
      "wind": { "speed": 8.5, "direction": 225 },
      "barometer": 101325,
      "temperature": 293.15,
      "seaState": "slight"
    }
  },
  "end": {
    "time": "2026-04-12T12:30:00Z",
    "locationName": "Daufuskie Island",
    "position": {
      "latitude": 32.130434,
      "longitude": -80.876614
    },
    "engineHours": {
      "port": 1238.06,
      "starboard": 1238.62
    },
    "fuelLevel": {
      "port": 0.72,
      "starboard": 0.69
    }
  },
  "tags": ["anchored", "dolphins"],
  "crew": ["Geoff", "Sarah"],
  "notes": "Beautiful weather, calm seas. Set anchor on first try!"
}
```

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "start": { ... },
  "end": { ... },
  "calculated": {
    "duration": {
      "milliseconds": 12600000,
      "hours": 3,
      "minutes": 30,
      "formatted": "3h 30m"
    },
    "distance": {
      "nauticalMiles": 18.2,
      "kilometers": 33.7
    },
    "averageSpeed": 5.2,
    "engineHoursAdded": {
      "port": 3.5,
      "starboard": 3.5
    },
    "fuelUsed": {
      "port": 0.13,
      "starboard": 0.13
    }
  },
  "tags": ["anchored", "dolphins"],
  "crew": ["Geoff", "Sarah"],
  "notes": "Beautiful weather, calm seas. Set anchor on first try!",
  "createdAt": "2026-04-12T13:00:00.000Z",
  "updatedAt": "2026-04-12T13:00:00.000Z"
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
│   ├── db.js                 # MongoDB connection
│   ├── models/
│   │   └── Trip.js           # Mongoose Trip schema
│   ├── routes/
│   │   └── trips.js          # Trip CRUD operations
│   └── lib/
│       └── log-analyzer.js   # Parses vessel-data-logger files (future)
├── public/
│   ├── index.html            # Web UI
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js            # Frontend logic
├── data/
│   └── trips/                # JSON file storage (fallback)
├── package.json
├── .env.example
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
Environment=PORT=3210
Environment=SIGNALK_URL=http://localhost:3100
Environment=MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/becoming?retryWrites=true&w=majority
Environment=LOGGER_DATA_DIR=/home/geoff/becoming/apps/vessel-data-logger/logs
Environment=TRIPS_DIR=/home/geoff/becoming/apps/vessel-logbook/data/trips

StandardOutput=journal
StandardError=journal
SyslogIdentifier=vessel-logbook

[Install]
WantedBy=multi-user.target
```

**Note**: Set your actual MongoDB connection string in `MONGO_URI`. If left blank, the app will fall back to JSON file storage in `TRIPS_DIR`.

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
    proxy_pass http://localhost:3210;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    
    # Handle trailing slashes
    rewrite ^/logbook$ /logbook/ permanent;
    rewrite ^/logbook/(.*) /$1 break;
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
