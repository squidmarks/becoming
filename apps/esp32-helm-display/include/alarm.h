#pragma once

// ── Alarm system ──────────────────────────────────────────────────────────────
// Two alarm sources with distinct beep patterns:
//   ALARM_ANCHOR  — anchor dragging (double-beep every 2.5 s)
//   ALARM_DEPTH   — shallow water (triple rapid-beep every 4 s)
//
// Call alarm_raise() / alarm_clear() from UI refresh code whenever the
// condition becomes true/false.  Call alarm_tick() from the 200 ms UI timer.
// The actual beep is produced by beep() in main.cpp (active buzzer via the
// IO expander — the same buzzer used for startup diagnostics).

enum AlarmType { ALARM_NONE = 0, ALARM_DEPTH = 1, ALARM_ANCHOR = 2 };

// Depth alarm threshold in feet.  0 = disabled.  Adjustable from the UI.
extern float g_depth_alarm_ft;

void alarm_raise(AlarmType type);
void alarm_clear(AlarmType type);
void alarm_tick();   // call once per 200 ms UI timer tick
