#pragma once
#include <Arduino.h>
#include <math.h>

// ── Staleness thresholds ──────────────────────────────────────────────────────
// Set generously to absorb slow-publishing devices (Victron/Cerbo ~10-15 s).
#define STALE_NAV_MS    10000   // GPS/depth usually fast; 10 s is safe
#define STALE_ENGINE_MS  8000   // engine data at 1-2 s; 8 s is very generous
#define STALE_ELEC_MS   45000   // Victron Cerbo publishes ~10-15 s; 45 s = 3× headroom

// ── Historical ring buffer (for detail screen charts) ─────────────────────────
// 300 samples; with the sample rates below this gives:
//   depth  :  2 s × 300 =  10 min
//   coolant: 60 s × 300 = 300 min (~5 h)
//   soc/amp: 15 s × 300 =  75 min
// uint16_t head/count supports up to 65535 — well beyond current needs.
#define HISTORY_LEN      300
#define ANCHOR_TRACK_LEN 360   // 5 s × 360 = 30 min of position history

struct RingBuf {
    float    data[HISTORY_LEN] = {};
    uint16_t head  = 0;
    uint16_t count = 0;

    void push(float v) {
        data[head] = v;
        head = (head + 1) % HISTORY_LEN;
        if (count < HISTORY_LEN) count++;
    }
    // Oldest-first: get(0) = oldest, get(count-1) = newest
    float get(uint16_t i) const {
        return data[(uint16_t)(head - count + i) % HISTORY_LEN];
    }
};

// ── Anchor position ring buffer ───────────────────────────────────────────────
struct PosPoint { double lat = 0.0; double lon = 0.0; };

struct PosRingBuf {
    PosPoint data[ANCHOR_TRACK_LEN] = {};
    uint16_t head  = 0;
    uint16_t count = 0;

    void push(double lat, double lon) {
        data[head] = {lat, lon};
        head = (head + 1) % ANCHOR_TRACK_LEN;
        if (count < ANCHOR_TRACK_LEN) count++;
    }
    PosPoint get(uint16_t i) const {
        return data[(uint16_t)(head - count + i) % ANCHOR_TRACK_LEN];
    }
    void clear() { head = 0; count = 0; }
};

// ── Navigation data ───────────────────────────────────────────────────────────
struct NavData {
    float  sog_kts  = NAN;   // speed over ground, knots
    float  hdg_deg  = NAN;   // heading magnetic, degrees (0–360)
    float  cog_deg  = NAN;   // course over ground true, degrees
    float  depth_m  = NAN;   // depth below transducer, meters
    double lat      = NAN;   // GPS latitude, degrees
    double lon      = NAN;   // GPS longitude, degrees
    uint32_t updated_ms = 0;

    bool stale() const { return (millis() - updated_ms) > STALE_NAV_MS; }
};

// ── Engine data ───────────────────────────────────────────────────────────────
struct EngineData {
    float port_rpm    = NAN;  // port engine RPM
    float stbd_rpm    = NAN;  // starboard engine RPM
    float port_oil    = NAN;  // port oil pressure, psi
    float stbd_oil    = NAN;  // starboard oil pressure, psi
    float port_temp_f = NAN;  // port coolant temperature, °F
    float stbd_temp_f = NAN;  // starboard coolant temperature, °F
    uint32_t updated_ms = 0;

    bool stale() const { return (millis() - updated_ms) > STALE_ENGINE_MS; }
};

// ── Electrical data ───────────────────────────────────────────────────────────
struct ElecData {
    float soc_pct    = NAN;   // battery state of charge, 0–100 %
    float volts      = NAN;   // battery voltage, V
    float amps       = NAN;   // battery current, A  (+ = charging)
    float inv_load_w = NAN;   // inverter AC output load, W
    char  state[48]  = {};    // inverter state text e.g. "Inverter Operation"
    uint32_t state_since_ms = 0;  // millis() when state string last changed
    uint32_t updated_ms = 0;

    bool stale() const { return (millis() - updated_ms) > STALE_ELEC_MS; }
};

// ── Historical buffers ────────────────────────────────────────────────────────
struct HistoryBufs {
    RingBuf depth_m;      // sampled every 2s
    RingBuf port_temp_f;  // sampled every 30s (coolant temp, °F)
    RingBuf stbd_temp_f;  // sampled every 30s (coolant temp, °F)
    RingBuf soc_pct;      // sampled every 15s
    RingBuf amps;         // sampled every 15s
    RingBuf inv_load_w;   // sampled every 15s (AC inverter load, W)
};

// ── Anchor watch state ────────────────────────────────────────────────────────
struct AnchorState {
    bool   active            = false;   // anchor position is set and alarm is armed
    double anchor_lat        = 0.0;
    double anchor_lon        = 0.0;
    float  radius_m          = 30.48f;  // anchor circle radius (30.48 m = 100 ft default)
    float  alarm_buffer_pct  = 10.0f;   // % overshoot before alarm fires (with hysteresis)
    bool   alarm             = false;   // currently outside alarm radius
    float  dist_m            = NAN;     // current distance from anchor
    float  brg_deg           = NAN;     // bearing from current position to anchor (°T)
    PosRingBuf track;                   // drift position history
};

// ── Tide data (from NOAA via signalk-becoming-tides plugin) ──────────────────
// Heights stored in meters (SI); convert to feet at display time.
struct TideData {
    float height_m       = NAN;
    bool  rising         = true;
    float next_high_m    = NAN;
    float next_low_m     = NAN;
    char  next_high_time[8] = {};  // "H:MMa" or "H:MMp" local time
    char  next_low_time[8]  = {};
    char  station[40]       = {};

    bool  valid() const { return !isnan(height_m); }
    float height_ft()    const { return height_m    * 3.28084f; }
    float next_high_ft() const { return next_high_m * 3.28084f; }
    float next_low_ft()  const { return next_low_m  * 3.28084f; }
};

// ── Global vessel state ───────────────────────────────────────────────────────
extern NavData     gNav;
extern EngineData  gEng;
extern ElecData    gElec;
extern HistoryBufs gHistory;
extern AnchorState gAnchor;
extern TideData    gTides;
