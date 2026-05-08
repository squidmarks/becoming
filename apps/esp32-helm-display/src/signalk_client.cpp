#include "signalk_client.h"
#include "vessel_data.h"
#include "geo.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

static WebSocketsClient ws;
static bool sk_connected      = false;
static bool s_needs_restore   = false;   // set on every WS connect
static bool s_needs_save      = false;   // set when anchor changes locally

// Visible to main.cpp — set when anchor state arrives from the network.
// main.cpp clears it after triggering a UI refresh.
bool g_anchor_net_updated = false;

// Global tide data — populated from environment.tide.* WebSocket updates.
TideData gTides;

// Stringify helper for SIGNALK_PORT (integer macro)
#define STRINGIFY(x) #x
#define TOSTRING(x)  STRINGIFY(x)

#define SK_REST_BASE  "http://" SIGNALK_HOST ":" TOSTRING(SIGNALK_PORT) "/signalk/v1/api/vessels/self/"
#define SINK_BASE     "http://" SIGNALK_HOST ":" TOSTRING(BECOMING_SINK_PORT)
#define ANCHOR_PATH   "helm_mfd/anchor"

// ── Anchor state sync helpers ─────────────────────────────────────────────────

// Publish current gAnchor state to the becoming-sink plugin via HTTP POST.
// The plugin injects the data into the SignalK data model via app.handleMessage(),
// making it available at the standard REST API and broadcast to all WebSocket
// subscribers (including other MFD devices).
static void save_anchor_to_sk() {
    if (WiFi.status() != WL_CONNECTED) return;

    JsonDocument doc;
    doc["path"] = "helm_mfd.anchor";
    JsonObject val = doc["value"].to<JsonObject>();
    val["active"]           = gAnchor.active;
    val["anchor_lat"]       = gAnchor.anchor_lat;
    val["anchor_lon"]       = gAnchor.anchor_lon;
    val["radius_m"]         = gAnchor.radius_m;
    val["alarm_buffer_pct"] = gAnchor.alarm_buffer_pct;
    val["alarm"]            = gAnchor.alarm;

    String body;
    serializeJson(doc, body);

    HTTPClient http;
    http.begin(SINK_BASE "/update");
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(body);
    Serial.printf("[SK] anchor POST → sink HTTP %d  active=%d alarm=%d\n",
                  code, (int)gAnchor.active, (int)gAnchor.alarm);
    http.end();
}

// Fetch anchor state from SignalK on startup / reconnect.
// If SignalK has nothing (e.g. fresh restart) and WE have an active anchor,
// re-push our local state so SignalK (and any other devices) stay in sync.
static void restore_anchor_from_sk() {
    if (WiFi.status() != WL_CONNECTED) return;
    // If a local save is already pending, our state is newer than SignalK —
    // don't overwrite it with a stale restore (race: WS reconnect during edit).
    if (s_needs_save) {
        Serial.println("[SK] skipping restore — local save pending");
        return;
    }

    HTTPClient http;
    http.begin(SK_REST_BASE ANCHOR_PATH);
    int code = http.GET();
    Serial.printf("[SK] anchor restore ← HTTP %d\n", code);

    if (code == 200) {
        String body = http.getString();
        JsonDocument doc;
        if (!deserializeJson(doc, body)) {
            JsonObject val = doc["value"].as<JsonObject>();
            if (!val.isNull()) {
                bool active = val["active"] | false;
                double lat  = val["anchor_lat"]       | 0.0;
                double lon  = val["anchor_lon"]       | 0.0;
                float  r    = val["radius_m"]         | 30.48f;
                float  buf  = val["alarm_buffer_pct"] | 10.0f;

                if (active && (lat != 0.0 || lon != 0.0)) {
                    gAnchor.anchor_lat       = lat;
                    gAnchor.anchor_lon       = lon;
                    gAnchor.radius_m         = r;
                    gAnchor.alarm_buffer_pct = buf;
                    gAnchor.active           = true;
                    gAnchor.alarm            = false;
                    gAnchor.track.clear();
                    g_anchor_net_updated = true;
                    Serial.println("[SK] anchor state restored");
                } else if (!active && gAnchor.active) {
                    // Another device released the anchor while we were offline
                    gAnchor.active = false;
                    gAnchor.alarm  = false;
                    g_anchor_net_updated = true;
                    Serial.println("[SK] anchor released by remote device");
                }
            }
        }
    } else {
        // 404 → SignalK has no stored state (likely just restarted).
        // If WE have an active anchor, re-publish so the bus stays warm.
        if (gAnchor.active) {
            Serial.println("[SK] SK has no anchor state — re-publishing ours");
            s_needs_save = true;
        }
    }
    http.end();
}

// ── History sampling timers ───────────────────────────────────────────────────
static uint32_t hist_nav_ms  = 0;
static uint32_t hist_eng_ms  = 0;
static uint32_t hist_elec_ms = 0;

// ── Path → data field mapping ─────────────────────────────────────────────────
static void handle_value(const char* path, JsonVariant val) {
    if (!path || val.isNull()) return;

    // ── Navigation ────────────────────────────────────────────────────────────
    if (strcmp(path, "navigation.speedOverGround") == 0) {
        gNav.sog_kts    = val.as<float>() * 1.94384f;
        gNav.updated_ms = millis();

    } else if (strcmp(path, "navigation.headingMagnetic") == 0) {
        gNav.hdg_deg    = val.as<float>() * 57.2958f;
        gNav.updated_ms = millis();

    } else if (strcmp(path, "navigation.courseOverGroundTrue") == 0) {
        gNav.cog_deg    = val.as<float>() * 57.2958f;
        gNav.updated_ms = millis();

    } else if (strcmp(path, "environment.depth.belowTransducer") == 0) {
        gNav.depth_m    = val.as<float>();
        gNav.updated_ms = millis();

    // ── Engines ───────────────────────────────────────────────────────────────
    } else if (strcmp(path, "propulsion.port.revolutions") == 0) {
        gEng.port_rpm   = val.as<float>() * 60.0f;
        gEng.updated_ms = millis();

    } else if (strcmp(path, "propulsion.starboard.revolutions") == 0) {
        gEng.stbd_rpm   = val.as<float>() * 60.0f;
        gEng.updated_ms = millis();

    } else if (strcmp(path, "propulsion.port.oilPressure") == 0) {
        gEng.port_oil   = val.as<float>() * 0.000145038f;
        gEng.updated_ms = millis();

    } else if (strcmp(path, "propulsion.starboard.oilPressure") == 0) {
        gEng.stbd_oil   = val.as<float>() * 0.000145038f;
        gEng.updated_ms = millis();

    } else if (strcmp(path, "propulsion.port.temperature") == 0) {
        gEng.port_temp_f = (val.as<float>() - 273.15f) * 1.8f + 32.0f;
        gEng.updated_ms  = millis();

    } else if (strcmp(path, "propulsion.starboard.temperature") == 0) {
        gEng.stbd_temp_f = (val.as<float>() - 273.15f) * 1.8f + 32.0f;
        gEng.updated_ms  = millis();

    // ── Electrical ────────────────────────────────────────────────────────────
    } else if (strcmp(path, "electrical.batteries.0.capacity.stateOfCharge") == 0) {
        gElec.soc_pct    = val.as<float>() * 100.0f;
        gElec.updated_ms = millis();

    } else if (strcmp(path, "electrical.batteries.0.voltage") == 0) {
        gElec.volts      = val.as<float>();
        gElec.updated_ms = millis();

    } else if (strcmp(path, "electrical.batteries.0.current") == 0) {
        gElec.amps       = val.as<float>();
        gElec.updated_ms = millis();

    } else if (strcmp(path, "electrical.inverters.0.stateText") == 0) {
        const char* s = val.as<const char*>();
        if (s) {
            // Record when state changes so we can show time-in-state
            if (strncmp(gElec.state, s, sizeof(gElec.state) - 1) != 0) {
                strncpy(gElec.state, s, sizeof(gElec.state) - 1);
                gElec.state[sizeof(gElec.state) - 1] = '\0';
                gElec.state_since_ms = millis();
            }
        }
        gElec.updated_ms = millis();

    } else if (strcmp(path, "electrical.inverters.0.acout.loadPowerTotal") == 0) {
        gElec.inv_load_w = val.as<float>();
        gElec.updated_ms = millis();

    // ── helm_mfd.anchor — published by any MFD, received by all subscribers ──
    } else if (strcmp(path, "helm_mfd.anchor") == 0 && val.is<JsonObject>()) {
        bool   active = val["active"]           | false;
        double lat    = val["anchor_lat"]        | 0.0;
        double lon    = val["anchor_lon"]        | 0.0;
        float  r      = val["radius_m"]          | 30.48f;
        float  buf    = val["alarm_buffer_pct"]  | 10.0f;
        bool   alarm  = val["alarm"]             | false;

        if (active && (lat != 0.0 || lon != 0.0)) {
            gAnchor.anchor_lat       = lat;
            gAnchor.anchor_lon       = lon;
            gAnchor.radius_m         = r;
            gAnchor.alarm_buffer_pct = buf;
            gAnchor.alarm            = alarm;
            if (!gAnchor.active) {
                gAnchor.active = true;
                gAnchor.track.clear();
            }
        } else if (!active && gAnchor.active) {
            gAnchor.active = false;
            gAnchor.alarm  = false;
        }
        g_anchor_net_updated = true;

    // ── Tide data — published by signalk-becoming-tides plugin ───────────────
    } else if (strcmp(path, "environment.tide.heightNow") == 0) {
        gTides.height_m = val.as<float>();

    } else if (strcmp(path, "environment.tide.state") == 0) {
        const char* s = val.as<const char*>();
        if (s) gTides.rising = (strcmp(s, "rising") == 0);

    } else if (strcmp(path, "environment.tide.nextHighTime") == 0) {
        const char* s = val.as<const char*>();
        if (s) { strncpy(gTides.next_high_time, s, sizeof(gTides.next_high_time) - 1); }

    } else if (strcmp(path, "environment.tide.nextHighHeight") == 0) {
        gTides.next_high_m = val.as<float>();

    } else if (strcmp(path, "environment.tide.nextLowTime") == 0) {
        const char* s = val.as<const char*>();
        if (s) { strncpy(gTides.next_low_time, s, sizeof(gTides.next_low_time) - 1); }

    } else if (strcmp(path, "environment.tide.nextLowHeight") == 0) {
        gTides.next_low_m = val.as<float>();

    } else if (strcmp(path, "environment.tide.station") == 0) {
        const char* s = val.as<const char*>();
        if (s) { strncpy(gTides.station, s, sizeof(gTides.station) - 1); }

    // ── GPS position (object value: {latitude, longitude}) ────────────────────
    } else if (strcmp(path, "navigation.position") == 0 && val.is<JsonObject>()) {
        double lat = val["latitude"]  | (double)NAN;
        double lon = val["longitude"] | (double)NAN;
        if (!isnan(lat) && !isnan(lon)) {
            gNav.lat = lat;
            gNav.lon = lon;
            gNav.updated_ms = millis();
        }
    }
}

// ── History sampling ──────────────────────────────────────────────────────────
static uint32_t hist_anchor_ms = 0;

static void sample_history() {
    uint32_t now = millis();

    // Anchor position track: 5-second samples when boat is slow (<3 kt).
    // Track is cleared when the user sets an anchor position, so it always shows
    // drift history relative to the current anchor watch session.
    if (now - hist_anchor_ms >= 5000) {
        hist_anchor_ms = now;
        if (!gNav.stale() && !isnan(gNav.lat) && !isnan(gNav.lon)
            && !isnan(gNav.sog_kts) && gNav.sog_kts < 3.0f) {
            gAnchor.track.push(gNav.lat, gNav.lon);
        }
    }

    if (now - hist_nav_ms >= 2000) {           // depth every 2 s  → 300 pts = 10 min
        hist_nav_ms = now;
        if (!gNav.stale() && !isnan(gNav.depth_m))
            gHistory.depth_m.push(gNav.depth_m);
    }
    if (now - hist_eng_ms >= 60000) {          // coolant temp every 60 s → 120 pts = 2 h
        hist_eng_ms = now;
        if (!gEng.stale()) {
            // Only log temp when engine is actually running (ignition-off gives garbage readings)
            if (!isnan(gEng.port_rpm)    && gEng.port_rpm    > 100 &&
                !isnan(gEng.port_temp_f))  gHistory.port_temp_f.push(gEng.port_temp_f);
            if (!isnan(gEng.stbd_rpm)    && gEng.stbd_rpm    > 100 &&
                !isnan(gEng.stbd_temp_f))  gHistory.stbd_temp_f.push(gEng.stbd_temp_f);
        }
    }
    if (now - hist_elec_ms >= 15000) {         // SoC/amps every 15 s → 120 pts = 30 min
        hist_elec_ms = now;
        if (!gElec.stale()) {
            if (!isnan(gElec.soc_pct))    gHistory.soc_pct.push(gElec.soc_pct);
            if (!isnan(gElec.amps))       gHistory.amps.push(gElec.amps);
            if (!isnan(gElec.inv_load_w)) gHistory.inv_load_w.push(gElec.inv_load_w);
        }
    }
}

// ── WebSocket event handler ───────────────────────────────────────────────────
static void on_ws_event(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {

    case WStype_CONNECTED:
        sk_connected    = true;
        s_needs_restore = true;   // check/restore anchor state on every (re)connect
        Serial.printf("[SK] Connected to %s:%d%s\n",
                      SIGNALK_HOST, SIGNALK_PORT, SIGNALK_WS_PATH);
        break;

    case WStype_DISCONNECTED:
        sk_connected = false;
        Serial.println("[SK] Disconnected");
        break;

    case WStype_TEXT: {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, payload, length);
        if (err) break;

        JsonArray updates = doc["updates"];
        if (!updates) break;

        for (JsonObject upd : updates) {
            JsonArray values = upd["values"];
            if (!values) continue;
            for (JsonObject entry : values) {
                handle_value(entry["path"], entry["value"]);
            }
        }
        sample_history();
        break;
    }

    default: break;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
void signalk_client_init() {
    Serial.printf("[WiFi] Connecting to \"%s\"...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Non-blocking — WebSocket will connect once WiFi is ready.
    ws.begin(SIGNALK_HOST, SIGNALK_PORT, SIGNALK_WS_PATH);
    ws.onEvent(on_ws_event);
    ws.setReconnectInterval(5000);
}

void signalk_client_poll() {
    ws.loop();
    // Deferred HTTP work — runs outside WebSocket callbacks to avoid re-entrancy
    if (s_needs_restore) { s_needs_restore = false; restore_anchor_from_sk(); }
    if (s_needs_save)    { s_needs_save    = false; save_anchor_to_sk();      }
}

void signalk_queue_save_anchor() {
    s_needs_save = true;
}

bool signalk_connected() {
    return sk_connected;
}
