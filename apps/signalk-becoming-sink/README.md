# signalk-becoming-sink

General-purpose SignalK plugin for M/Y Becoming. Acts as a bridge so any trusted app on the local network can publish data into the SignalK data model without needing authentication or a per-app plugin.

## How it works

The plugin runs inside SignalK and exposes two HTTP endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/plugins/becoming-sink/update` | Push one or more path/value pairs into SignalK |
| `GET`  | `/plugins/becoming-sink/value?path=<path>` | Read a value back (convenience wrapper) |

Once data is published via `POST /update`, it:
- Appears in the SignalK data model (accessible via the standard REST API at `/signalk/v1/api/vessels/self/...`)
- Is broadcast to all WebSocket subscribers in real-time (other MFD devices, phone apps, etc.)

## API

### POST /plugins/becoming-sink/update

Single update:
```json
{ "path": "helm_mfd.anchor", "value": { "active": true, "anchor_lat": 25.123, "anchor_lon": -80.456, "radius_m": 30 } }
```

Batch update:
```json
{
  "updates": [
    { "path": "helm_mfd.anchor", "value": { ... } },
    { "path": "helm_mfd.other",  "value": 42 }
  ]
}
```

Response: `{ "ok": true, "count": 1 }`

### GET /plugins/becoming-sink/value?path=helm_mfd.anchor

Response: `{ "path": "helm_mfd.anchor", "value": { ... } }`

Clients can also use the standard SignalK REST API directly:
```
GET http://becoming-hub:3100/signalk/v1/api/vessels/self/helm_mfd/anchor
```

## Installation

```bash
cd ~/.signalk
npm install /home/geoff/becoming/apps/signalk-becoming-sink
sudo systemctl restart signalk
```

Then enable the plugin in the SignalK admin UI at `http://becoming-hub/signalk/admin → Server → Plugin Config`.

## Apps using this plugin

| App | Path | Description |
|-----|------|-------------|
| `esp32-helm-display` | `helm_mfd.anchor` | Anchor watch state (active, position, radius, alarm) |
