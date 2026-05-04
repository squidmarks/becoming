#pragma once

// Initialise WiFi and start WebSocket connection to SignalK.
// Non-blocking: returns immediately. Data arrives asynchronously via poll().
void signalk_client_init();

// Call from loop() every iteration — drives WebSocket I/O.
void signalk_client_poll();

// True when WebSocket is currently connected to SignalK.
bool signalk_connected();
