#pragma once

// ── Alarm system ──────────────────────────────────────────────────────────────
// Two alarm sources:
//   ALARM_ANCHOR — anchor dragging (double-beep every 2.5 s)
//   ALARM_DEPTH  — shallow water, progressive: period shortens as depth
//                  decreases from warn threshold toward alert threshold.
//                  At warn depth: ~2 s between beeps.
//                  At alert depth: ~200 ms (near-continuous).
//
// Call alarm_raise() / alarm_clear() from the main timer.
// Call alarm_tick() every 200 ms from the UI timer.

enum AlarmType { ALARM_NONE = 0, ALARM_DEPTH = 1, ALARM_ANCHOR = 2 };

// Depth alarm thresholds in feet.  warn > alert.  0 = disabled.
// warn  — outer zone: alarm starts, slow beeping.
// alert — inner zone: maximum urgency, near-continuous beeping.
extern float g_depth_warn_ft;
extern float g_depth_alert_ft;

// Beep period for depth alarm in 200 ms ticks (1 = 200 ms, 10 = 2 s).
// Set by main.cpp each tick based on current depth vs. thresholds.
extern int g_depth_alarm_period;

// When true the depth alarm beeper is muted but the visual indicator stays.
// Automatically cleared when depth rises back above g_depth_warn_ft.
extern bool g_depth_alarm_silenced;

void alarm_raise(AlarmType type);
void alarm_clear(AlarmType type);
void alarm_tick();          // call once per 200 ms UI timer tick
AlarmType alarm_current();  // returns the currently active alarm type
