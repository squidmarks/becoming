#pragma once
#include <lvgl.h>

lv_obj_t* nav_detail_create(lv_event_cb_t back_cb);
// update_chart: pass true to also redraw the history chart (do this at ~1 Hz).
void       nav_detail_refresh(bool update_chart = true);
// Evaluate anchor distance + alarm state.  Call every ~200 ms regardless of
// which screen is active so alarms fire even when the user is on another page.
// Returns true if the alarm just latched (caller can auto-navigate to SCR_NAV).
bool       nav_anchor_eval();
