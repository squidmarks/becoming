#pragma once

// Initialise WiFi and start WebSocket connection to SignalK.
// Non-blocking: returns immediately. Data arrives asynchronously via poll().
void signalk_client_init();

// Call from loop() every iteration — drives WebSocket I/O and deferred HTTP work.
void signalk_client_poll();

// True when WebSocket is currently connected to SignalK.
bool signalk_connected();

// Queue an async HTTP PUT to persist gAnchor state at helm_mfd/anchor.
// Call after setting, releasing, or changing alarm state.
// The PUT runs on the next signalk_client_poll() to avoid blocking LVGL callbacks.
void signalk_queue_save_anchor();

// Set by signalk_client when helm_mfd.anchor arrives from the network
// (another device changed state, or state was restored on reconnect).
// main.cpp clears this flag after triggering a UI refresh.
extern bool g_anchor_net_updated;
