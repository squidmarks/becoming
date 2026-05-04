#pragma once
#include <lvgl.h>

lv_obj_t* elec_detail_create(lv_event_cb_t back_cb);
// update_chart: pass true to also redraw the history chart (do this at ~1 Hz).
void       elec_detail_refresh(bool update_chart = true);
