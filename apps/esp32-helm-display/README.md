# ESP32 Helm Display

A working marine multi-function display (MFD) for M/Y Becoming's helm station,
running on a **Waveshare ESP32-S3-Touch-LCD-4** development board and pulling
live data from the vessel's SignalK server over WiFi.

---

## Hardware

| Spec | Details |
|------|---------|
| SoC | ESP32-S3-N16R8 (dual-core LX7, 240 MHz) |
| Flash / PSRAM | 16 MB / 8 MB OPI PSRAM |
| Display | 4" IPS, 480×480, ST7701S (RGB parallel + 3-wire SPI init) |
| Touch | Goodix GT911 5-point capacitive (I2C) |
| IO Expander | TCA9554PWR at I2C 0x20 (controls backlight, LCD reset, touch reset) |
| Power input | 7–36 V DC — works directly on 12 V or 24 V |
| WiFi / BT | 2.4 GHz 802.11b/g/n + BLE 5 |

**Product page:** https://www.waveshare.com/esp32-s3-touch-lcd-4.htm  
**Schematic:** https://files.waveshare.com/wiki/ESP32-S3-Touch-LCD-4/ESP32-S3-Touch-LCD-4-Sch.pdf

### Critical build notes

- `board_build.arduino.memory_type = qio_opi` is **required** for the 8 MB OPI
  PSRAM (ESP-IDF 5.x / Arduino-ESP32 3.x platform only — hence the `pioarduino`
  platform pin in `platformio.ini`).
- A **15 KB SRAM bounce buffer** (`480 * 8` pixels) is enabled on the
  `Arduino_ESP32RGBPanel` to decouple the LCD's DMA reads from LVGL's PSRAM writes,
  eliminating display tearing without needing LVGL `direct_mode`.

---

## Screens

### Dashboard (always-on)

Three stacked sections, each touchable to drill into a detail view:

| Section | Values shown |
|---------|-------------|
| **NAV** | SOG (kt), Heading (°M), Depth (ft) |
| **ENGINES** | Port & Stbd RPM, Oil pressure (psi), Coolant temp (°F) |
| **ELECTRICAL** | Battery SoC (%), DC current (A), AC load (W), inverter state |

Each section header shows a live status tag (e.g. `UNDERWAY`, `RUNNING`, `CHARGING`)
and a dot that turns green when fresh data is arriving.

### Detail screens (tap any dashboard section)

Slide left to open, tap **← BACK** to return.

| Detail | Primary data | History chart |
|--------|-------------|---------------|
| **NAV detail** | Depth large, SOG, HDG, COG | Depth — 10 min (5 s samples) |
| **ENGINE detail** | Port & Stbd RPM, Oil, Coolant | Coolant temp — 2 h (60 s samples) |
| **ELECTRICAL detail** | SoC arc gauge, DC amps, voltage, AC load | SoC — 30 min (15 s samples) |

### Startup screen

Shown while connecting to WiFi and SignalK. Transitions to the dashboard
automatically when SignalK is reachable; times out after 30 s.

---

## Data Architecture

All screens read from a single set of global structs updated by the SignalK client:

```
SignalK WebSocket (ws://becoming-hub:3100) ──► signalk_client.cpp
                                                    │
                                           ┌────────┴────────────┐
                                           │  vessel_data.h      │
                                           │  gNav   gEng  gElec │
                                           │  gHistory (charts)  │
                                           └────────┬────────────┘
                                                    │  5 Hz LVGL timer
                                      ┌─────────────┼─────────────┐
                                 dashboard     nav_detail    elec_detail
                                              eng_detail
```

- **Display refresh:** 5 Hz (200 ms LVGL timer) — fast enough for RPM and SOG updates
- **Chart refresh:** 1 Hz (every 5th tick) — history data changes slowly
- **History sampling:** depth 5 s, electrical 15 s, coolant 60 s
- **Staleness timeouts:** nav 10 s, engine 8 s, electrical 45 s

### Engine idle detection

Oil pressure and coolant temperature sensors give invalid readings when the engine
ignition is off (no voltage to the sensors). If port or starboard RPM is ≤ 100,
all three values (RPM, oil, temp) for that engine display `---`.

---

## Project Structure

```
apps/esp32-helm-display/
├── platformio.ini              # Build config, library dependencies
├── include/
│   ├── config.h                # WiFi credentials, SignalK host/port (not committed)
│   ├── lv_conf.h               # LVGL 8.4 configuration
│   └── ui_theme.h              # Shared colour palette for all UI screens
└── src/
    ├── main.cpp                # Hardware init, LVGL setup, screen state machine
    ├── vessel_data.h / .cpp    # Shared data structs (NavData, EngineData, ElecData, RingBuf)
    ├── signalk_client.h / .cpp # WiFi + SignalK WebSocket client, history sampling
    ├── ui_startup.h / .cpp     # Startup / connection screen
    ├── ui_dashboard.h / .cpp   # Three-section dashboard
    ├── ui_nav_detail.h / .cpp  # NAV detail screen + depth chart
    ├── ui_engine_detail.h/.cpp # ENGINE detail screen + coolant chart
    └── ui_elec_detail.h / .cpp # ELECTRICAL detail screen + SoC arc + SoC chart
```

---

## Configuration

Edit `include/config.h` before building:

```cpp
#define WIFI_SSID      "YourNetworkName"
#define WIFI_PASSWORD  "YourPassword"
#define SIGNALK_HOST   "becoming-hub"   // or IP address
#define SIGNALK_PORT   3100
```

`config.h` is tracked in git but credentials are left as placeholders — fill in
locally and do not commit the actual passwords.

---

## Dev Environment

### Prerequisites

1. **VS Code** + **PlatformIO IDE** extension
2. Python 3.10+ (PlatformIO requirement)
3. The `pioarduino` platform (pinned in `platformio.ini`) downloads automatically
   on first build — it is required for ESP-IDF 5.x OPI PSRAM support

### Build & flash

```bash
cd apps/esp32-helm-display

pio run                    # compile only
pio run -t upload          # compile + flash over USB
pio device monitor         # serial output at 115200
```

### Entering bootloader mode (if auto-reset fails)

1. Hold **BOOT** on the board
2. Press and release **RESET**
3. Release **BOOT**
4. Run `pio run -t upload`

---

## Dependencies

All fetched automatically by PlatformIO:

| Library | Purpose |
|---------|---------|
| `lvgl/lvgl @ ^8.4.0` | UI framework |
| `moononournation/GFX Library for Arduino` | ST7701S RGB display driver |
| `links2004/WebSockets @ ^2.4.1` | SignalK WebSocket client |
| `bblanchon/ArduinoJson @ ^7.2.0` | SignalK delta JSON parsing |
| `lewisxhe/SensorLib @ ^0.4.0` | GT911 touch controller driver |

---

## Planned / Future

- [ ] NMEA2000 via onboard CAN (direct engine/nav data without WiFi dependency)
- [ ] OTA firmware updates over vessel WiFi
- [ ] Alarm buzzer for low depth / high engine temp
- [ ] Brightness auto-dim
- [ ] WiFi setup screen (UI stub already present in `ui_startup.cpp`)

---

## Related

- `systems/navigation/README.md` — vessel navigation systems overview
- `apps/inverter-monitor/` — Victron inverter monitor (source of electrical SignalK data)
