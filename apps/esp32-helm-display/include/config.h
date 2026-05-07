#pragma once

/**
 * App-wide configuration
 *
 * WiFi credentials and SignalK URL are intentionally kept here
 * (not in source control) — copy config.h.example and fill in your values,
 * or override via build_flags in platformio.ini.
 */

// ── Network ───────────────────────────────────────────────────────────────────
#ifndef WIFI_SSID
#define WIFI_SSID       "BecomingStarlink"          // Vessel WiFi SSID
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD   "Gg-7362202"                  // Set in platformio.ini or here
#endif

// SignalK server on the Pi (becoming-hub)
// Port 3100 — NOT 3000 (that's the inverter-monitor Express app)
#define SIGNALK_HOST    "192.168.1.5"
#define SIGNALK_PORT    3100
#define SIGNALK_WS_PATH "/signalk/v1/stream?subscribe=self"

// becoming-sink plugin — unauthenticated internal HTTP bridge on the Pi.
// Any app POSTs { path, value } here to publish into the SignalK data model.
// Port 3101 — exposed by the signalk-becoming-sink SignalK plugin.
#define BECOMING_SINK_PORT 3101

// OTA hostname (accessible as becoming-helm.local)
#define OTA_HOSTNAME    "becoming-helm"

// ── Display ───────────────────────────────────────────────────────────────────
#define LCD_BG_COLOR    0x0A0A12            // Dark navy background
#define LVGL_TICK_MS    5                   // LVGL tick interval (ms)
#define LVGL_BUF_LINES  40                  // Render buffer height (lines)

// ── NMEA2000 ─────────────────────────────────────────────────────────────────
#define N2K_DEVICE_NAME         "Becoming Helm Display"
#define N2K_MANUFACTURER_CODE   1850        // Waveshare (informal, non-certified)
#define N2K_DEVICE_CLASS        120         // Display
#define N2K_DEVICE_FUNCTION     130         // Alarm Enunciator / Display

// PGNs we listen to
// Navigation
#define PGN_COG_SOG             129026UL
#define PGN_VESSEL_HEADING      127250UL
#define PGN_POSITION            129025UL
#define PGN_DEPTH               128267UL
#define PGN_SPEED               128259UL
#define PGN_WIND                130306UL
// Engine
#define PGN_ENGINE_RAPID        127488UL    // Engine Parameters, Rapid Update
#define PGN_ENGINE_DYNAMIC      127489UL    // Engine Parameters, Dynamic
#define PGN_TRANSMISSION        127493UL
// Electrical
#define PGN_DC_STATUS           127506UL    // Battery status
#define PGN_DC_DETAILED         127507UL    // Battery detail
#define PGN_CHARGER_STATUS      127508UL
#define PGN_INVERTER_STATUS     127509UL

// ── Data staleness thresholds ─────────────────────────────────────────────────
// Values older than this (ms) are shown as "---"
#define STALE_TIMEOUT_NAV_MS    5000
#define STALE_TIMEOUT_ENGINE_MS 3000
#define STALE_TIMEOUT_ELEC_MS   10000

// ── UI ───────────────────────────────────────────────────────────────────────
// Enable debug mode to show raw values and connection status overlay
#ifdef DEBUG_USB_SERIAL
#define UI_DEBUG_OVERLAY    1
#endif
