#pragma once
#include <lvgl.h>

// Build the startup / connecting screen. Call once after lv_init().
lv_obj_t* startup_create();

// Update the status message shown under the spinner.
void startup_set_status(const char* msg);
