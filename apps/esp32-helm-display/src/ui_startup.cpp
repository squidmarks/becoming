#include "ui_startup.h"
#include "ui_theme.h"

static lv_obj_t* s_status_lbl = nullptr;

lv_obj_t* startup_create() {
    lv_obj_t* scr = lv_obj_create(nullptr);
    lv_obj_set_size(scr, 480, 480);
    lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Vessel name ───────────────────────────────────────────────────────────
    lv_obj_t* title = lv_label_create(scr);
    lv_label_set_text(title, "M/Y Becoming");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(title, lv_color_hex(COL_VALUE), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

    lv_obj_t* sub = lv_label_create(scr);
    lv_label_set_text(sub, "Helm Display");
    lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(sub, lv_color_hex(COL_LABEL), 0);
    lv_obj_align(sub, LV_ALIGN_TOP_MID, 0, 98);

    // ── Spinner ───────────────────────────────────────────────────────────────
    lv_obj_t* spinner = lv_spinner_create(scr, 1500, 60);
    lv_obj_set_size(spinner, 80, 80);
    lv_obj_align(spinner, LV_ALIGN_CENTER, 0, -20);
    lv_obj_set_style_arc_color(spinner, lv_color_hex(COL_NAV), LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(spinner, lv_color_hex(COL_DIV), LV_PART_MAIN);
    lv_obj_set_style_arc_width(spinner, 5, LV_PART_INDICATOR);
    lv_obj_set_style_arc_width(spinner, 5, LV_PART_MAIN);

    // ── Status text ───────────────────────────────────────────────────────────
    s_status_lbl = lv_label_create(scr);
    lv_label_set_text(s_status_lbl, "Connecting to boat network...");
    lv_obj_set_style_text_font(s_status_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_status_lbl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(s_status_lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_size(s_status_lbl, 380, 40);
    lv_obj_align(s_status_lbl, LV_ALIGN_CENTER, 0, 70);

    // ── WiFi Setup button (inactive placeholder) ──────────────────────────────
    lv_obj_t* btn = lv_btn_create(scr);
    lv_obj_set_size(btn, 200, 48);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_MID, 0, -56);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0xDDE4EE), 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0xC8D4E8), LV_STATE_PRESSED);
    lv_obj_set_style_border_color(btn, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, 8, 0);
    // No event callback — button is a stub until WiFi setup is implemented

    lv_obj_t* btn_lbl = lv_label_create(btn);
    lv_label_set_text(btn_lbl, LV_SYMBOL_WIFI "  WiFi Setup");
    lv_obj_set_style_text_font(btn_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(btn_lbl, lv_color_hex(COL_MUTED), 0);
    lv_obj_center(btn_lbl);

    lv_obj_t* note = lv_label_create(scr);
    lv_label_set_text(note, "configure network settings");
    lv_obj_set_style_text_font(note, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(note, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(note, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_size(note, 380, 20);
    lv_obj_align(note, LV_ALIGN_BOTTOM_MID, 0, -22);

    return scr;
}

void startup_set_status(const char* msg) {
    if (s_status_lbl) lv_label_set_text(s_status_lbl, msg);
}
