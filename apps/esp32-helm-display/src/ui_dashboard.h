#pragma once
#include <lvgl.h>

// Build the dashboard screen. Call once after lv_init().
lv_obj_t* dashboard_create();

// Update all displayed values from gNav / gEng / gElec.
// Call from a 1-second LVGL timer.
void dashboard_refresh();

// Returns the three top-level section containers so the caller can attach
// LV_EVENT_CLICKED handlers for navigation to detail screens.
void dashboard_get_sections(lv_obj_t** nav, lv_obj_t** eng, lv_obj_t** elec);
