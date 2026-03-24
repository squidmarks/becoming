# Vessel Hub - Central Dashboard

The central landing page and unified dashboard for M/Y Becoming, providing an at-a-glance view of all vessel systems and quick access to specialized applications.

## Purpose

**Primary Functions:**
- **Landing page** - First page when accessing http://becoming-hub
- **System overview** - Quick status of all major systems
- **Navigation** - Links to all vessel applications
- **Data aggregation** - Unified view of data from multiple sources

**AI Integration:**
- Serves as the human interface layer for vessel systems
- Future: API endpoint for MCP server (AI access layer)
- Aggregates data from SignalK, inverter, AIS for unified AI context

## Architecture

```
Vessel Hub (Port 8080, internal only)
├── Frontend (Single-page app)
│   ├── Dashboard view (status cards)
│   ├── Navigation to subsystems
│   └── Real-time data display
└── Backend API (Node.js/Express)
    ├── Data aggregation from:
    │   ├── SignalK REST API
    │   ├── Inverter Monitor API
    │   └── AIS-catcher
    └── Future: MCP server interface
```

## Dashboard Features (Planned)

### Status Cards
- **Position & Navigation**
  - Current GPS coordinates
  - Speed and heading
  - Nearest waypoint
  - Source: SignalK

- **Battery & Power**
  - Battery SoC percentage
  - Current draw/charge
  - Solar production
  - Time to full/empty
  - Source: Inverter Monitor

- **Environmental**
  - Depth
  - Wind speed/direction
  - Water temperature
  - Source: SignalK

- **AIS Traffic**
  - Nearby vessels count
  - Closest vessel distance
  - Link to full AIS viewer
  - Source: AIS-catcher

- **System Health**
  - All services status (green/red indicators)
  - Connection status
  - Uptime

### Quick Links
- **SignalK** → /signalk/ (Full marine data interface)
- **Inverter** → /inverter/ (Detailed power monitoring)
- **AIS** → /ais/ (Vessel tracking map)

## Technology Stack

**Frontend:**
- HTML5/CSS3/JavaScript (vanilla, no framework overhead)
- Responsive design (mobile-friendly)
- Server-Sent Events (SSE) for real-time updates
- Same design language as inverter-monitor

**Backend:**
- Node.js with Express
- RESTful API for data aggregation
- Fetches from:
  - SignalK: `http://localhost:3100/signalk/v1/api/`
  - Inverter: `http://localhost:3000/api/data`
  - AIS: `http://localhost:8100/` (or SignalK vessels)

## Installation

[To be added when implemented]

```bash
cd /home/geoff/becoming/apps/vessel-hub
npm install
cp .env.example .env
# Edit .env if needed
sudo systemctl enable $(pwd)/vessel-hub.service
sudo systemctl start vessel-hub
```

## Development Priorities

**Phase 1: Basic Landing Page**
- Simple status cards with static links
- Fetch basic data from each API
- Clean, responsive UI

**Phase 2: Real-time Updates**
- WebSocket or SSE for live data
- Auto-refresh status indicators
- System health monitoring

**Phase 3: Advanced Features**
- Historical graphs/trends
- Alerts and notifications
- Mobile app PWA support

**Phase 4: AI Integration**
- MCP server for AI access
- Natural language interface
- Predictive insights

## Design Guidelines

- **Responsive** - Works on phone, tablet, desktop
- **Dark/Light mode** - Match boat's ambient lighting
- **Minimal** - Clean, distraction-free interface
- **Fast** - Quick load times, efficient updates
- **Consistent** - Match design language of other apps

## Access

After deployment:
- **URL:** http://becoming-hub/ (via nginx reverse proxy)
- **Direct:** http://becoming-hub:8080 (for development/debugging)

## Configuration

Environment variables (`.env`):
```
PORT=8080
SIGNALK_URL=http://localhost:3100
INVERTER_URL=http://localhost:3000
AIS_URL=http://localhost:8100
NODE_ENV=production
```

## Future Enhancements

- User authentication for remote access
- Customizable dashboard layouts
- Voyage planning integration
- Weather overlay
- Integration with external marine data APIs
- Voice control interface
- Maintenance schedule tracking
- Fuel consumption analytics

---

*The vessel hub is the human-friendly gateway to an AI-accessible boat.*
