#pragma once
#include <Arduino.h>
#include <math.h>

// ── Staleness thresholds ──────────────────────────────────────────────────────
// Set generously to absorb slow-publishing devices (Victron/Cerbo ~10-15 s).
#define STALE_NAV_MS    10000   // GPS/depth usually fast; 10 s is safe
#define STALE_ENGINE_MS  8000   // engine data at 1-2 s; 8 s is very generous
#define STALE_ELEC_MS   45000   // Victron Cerbo publishes ~10-15 s; 45 s = 3× headroom

// ── Historical ring buffer (for detail screen charts) ─────────────────────────
// 120 samples; with the sample rates below this gives:
//   depth  :  5 s × 120 =  10 min
//   coolant: 60 s × 120 = 120 min
//   soc/amp: 15 s × 120 =  30 min
#define HISTORY_LEN 120

struct RingBuf {
    float   data[HISTORY_LEN] = {};
    uint8_t head  = 0;
    uint8_t count = 0;

    void push(float v) {
        data[head] = v;
        head = (head + 1) % HISTORY_LEN;
        if (count < HISTORY_LEN) count++;
    }
    // Oldest-first: get(0) = oldest, get(count-1) = newest
    float get(uint8_t i) const {
        return data[(uint8_t)(head - count + i) % HISTORY_LEN];
    }
};

// ── Navigation data ───────────────────────────────────────────────────────────
struct NavData {
    float sog_kts   = NAN;  // speed over ground, knots
    float hdg_deg   = NAN;  // heading magnetic, degrees (0–360)
    float cog_deg   = NAN;  // course over ground true, degrees
    float depth_m   = NAN;  // depth below transducer, meters
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
    RingBuf depth_m;      // sampled every 10s
    RingBuf port_temp_f;  // sampled every 30s (coolant temp, °F)
    RingBuf stbd_temp_f;  // sampled every 30s (coolant temp, °F)
    RingBuf soc_pct;      // sampled every 30s
    RingBuf amps;         // sampled every 30s
};

// ── Global vessel state ───────────────────────────────────────────────────────
extern NavData     gNav;
extern EngineData  gEng;
extern ElecData    gElec;
extern HistoryBufs gHistory;
