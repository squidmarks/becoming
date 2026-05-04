#include "signalk_client.h"
#include "vessel_data.h"
#include "config.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

static WebSocketsClient ws;
static bool             sk_connected = false;

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
    }
}

// ── History sampling ──────────────────────────────────────────────────────────
static void sample_history() {
    uint32_t now = millis();

    if (now - hist_nav_ms >= 5000) {           // depth every 5 s  → 120 pts = 10 min
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
            if (!isnan(gElec.soc_pct)) gHistory.soc_pct.push(gElec.soc_pct);
            if (!isnan(gElec.amps))    gHistory.amps.push(gElec.amps);
        }
    }
}

// ── WebSocket event handler ───────────────────────────────────────────────────
static void on_ws_event(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {

    case WStype_CONNECTED:
        sk_connected = true;
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
}

bool signalk_connected() {
    return sk_connected;
}
