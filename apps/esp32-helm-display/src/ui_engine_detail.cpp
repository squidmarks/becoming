#include "ui_engine_detail.h"
#include "vessel_data.h"
#include "ui_theme.h"
#include <Arduino.h>

#define HDR_H  40
#define SCR_W  480
#define COL_STBD 0x4488FF   // light blue for starboard

static lv_obj_t *s_scr;
static lv_obj_t *s_rpm_p, *s_rpm_s;
static lv_obj_t *s_oil_p, *s_oil_s;
static lv_obj_t *s_tmp_p, *s_tmp_s;
static lv_obj_t *s_chart;
static lv_chart_series_t *s_port_ser, *s_stbd_ser;
static lv_coord_t s_port_pts[HISTORY_LEN], s_stbd_pts[HISTORY_LEN];

// ── Shared helpers (replicated from ui_nav_detail; each TU is self-contained) ─

static lv_obj_t* detail_header(lv_obj_t* scr, uint32_t accent,
                                const char* title, lv_event_cb_t back_cb) {
    lv_obj_t* hdr = lv_obj_create(scr);
    lv_obj_set_pos(hdr, 0, 0);  lv_obj_set_size(hdr, SCR_W, HDR_H);
    lv_obj_set_style_bg_color(hdr, lv_color_hex(COL_SEC), 0);
    lv_obj_set_style_border_width(hdr, 0, 0);
    lv_obj_set_style_radius(hdr, 0, 0);
    lv_obj_set_style_pad_all(hdr, 0, 0);
    lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t* bar = lv_obj_create(hdr);
    lv_obj_set_pos(bar, 0, 0);  lv_obj_set_size(bar, 4, HDR_H);
    lv_obj_set_style_bg_color(bar, lv_color_hex(accent), 0);
    lv_obj_set_style_border_width(bar, 0, 0);  lv_obj_set_style_radius(bar, 0, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* btn = lv_btn_create(hdr);
    lv_obj_set_size(btn, 88, 30);  lv_obj_set_pos(btn, 8, 5);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x1A1A30), 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x2A2A44), LV_STATE_PRESSED);
    lv_obj_set_style_border_color(btn, lv_color_hex(accent), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, 6, 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_t* bl = lv_label_create(btn);
    lv_label_set_text(bl, LV_SYMBOL_LEFT "  BACK");
    lv_obj_set_style_text_color(bl, lv_color_hex(COL_VALUE), 0);
    lv_obj_set_style_text_font(bl, &lv_font_montserrat_14, 0);
    lv_obj_center(bl);
    if (back_cb) lv_obj_add_event_cb(btn, back_cb, LV_EVENT_CLICKED, nullptr);

    lv_obj_t* ttl = lv_label_create(hdr);
    lv_label_set_text(ttl, title);
    lv_obj_set_style_text_font(ttl, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(ttl, lv_color_hex(accent), 0);
    lv_obj_align(ttl, LV_ALIGN_CENTER, 0, 0);
    lv_obj_clear_flag(ttl, LV_OBJ_FLAG_CLICKABLE);
    return hdr;
}

static lv_obj_t* hdiv(lv_obj_t* scr, int16_t y) {
    lv_obj_t* d = lv_obj_create(scr);
    lv_obj_set_pos(d, 0, y);  lv_obj_set_size(d, SCR_W, 1);
    lv_obj_set_style_bg_color(d, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(d, 0, 0);
    lv_obj_clear_flag(d, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    return d;
}

// Simple centered label, returns widget
static lv_obj_t* clbl(lv_obj_t* p, int16_t x, int16_t y, int16_t w, int16_t h,
                        const lv_font_t* f, uint32_t c, const char* txt) {
    lv_obj_t* l = lv_label_create(p);
    lv_obj_set_pos(l, x, y);  lv_obj_set_size(l, w, h);
    lv_obj_set_style_text_font(l, f, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(c), 0);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(l, LV_LABEL_LONG_CLIP);
    lv_label_set_text(l, txt);
    lv_obj_clear_flag(l, LV_OBJ_FLAG_CLICKABLE);
    return l;
}

static lv_obj_t* make_chart(lv_obj_t* scr, int16_t y, int16_t h) {
    lv_obj_t* c = lv_chart_create(scr);
    lv_obj_set_pos(c, 10, y);  lv_obj_set_size(c, SCR_W - 20, h);
    lv_chart_set_type(c, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(c, HISTORY_LEN);
    lv_obj_set_style_bg_color(c, lv_color_hex(COL_BG), 0);
    lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(c, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_line_color(c, lv_color_hex(COL_DIV), LV_PART_MAIN);
    lv_obj_set_style_size(c, 0, LV_PART_INDICATOR);
    lv_obj_set_style_line_width(c, 2, LV_PART_ITEMS);
    lv_obj_set_style_pad_left(c, 42, 0);
    lv_obj_set_style_pad_right(c, 6, 0);
    lv_obj_set_style_pad_top(c, 4, 0);
    lv_obj_set_style_pad_bottom(c, 4, 0);
    return c;
}

// ── eng_detail_create ─────────────────────────────────────────────────────────
lv_obj_t* eng_detail_create(lv_event_cb_t back_cb) {
    s_scr = lv_obj_create(nullptr);
    lv_obj_set_size(s_scr, SCR_W, 480);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    detail_header(s_scr, COL_ENG, "ENGINES", back_cb);

    // Vertical divider between PORT and STBD columns
    lv_obj_t* vd = lv_obj_create(s_scr);
    lv_obj_set_pos(vd, 239, HDR_H);  lv_obj_set_size(vd, 1, 215);
    lv_obj_set_style_bg_color(vd, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(vd, 0, 0);
    lv_obj_clear_flag(vd, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    // Column headers
    clbl(s_scr,   0, HDR_H + 4, 240, 22, &lv_font_montserrat_14, COL_ENG,   "PORT");
    clbl(s_scr, 240, HDR_H + 4, 240, 22, &lv_font_montserrat_14, COL_STBD,  "STBD");

    // RPM row  (large)
    clbl(s_scr,   0, HDR_H + 28, 240, 16, &lv_font_montserrat_12, COL_LABEL, "RPM");
    clbl(s_scr, 240, HDR_H + 28, 240, 16, &lv_font_montserrat_12, COL_LABEL, "RPM");
    s_rpm_p = clbl(s_scr,   0, HDR_H + 46, 240, 44, &lv_font_montserrat_36, COL_MUTED, "---");
    s_rpm_s = clbl(s_scr, 240, HDR_H + 46, 240, 44, &lv_font_montserrat_36, COL_MUTED, "---");

    hdiv(s_scr, HDR_H + 96);

    // Oil pressure row
    clbl(s_scr,   0, HDR_H + 100, 240, 16, &lv_font_montserrat_12, COL_LABEL, "OIL  (psi)");
    clbl(s_scr, 240, HDR_H + 100, 240, 16, &lv_font_montserrat_12, COL_LABEL, "OIL  (psi)");
    s_oil_p = clbl(s_scr,   0, HDR_H + 118, 240, 38, &lv_font_montserrat_28, COL_MUTED, "---");
    s_oil_s = clbl(s_scr, 240, HDR_H + 118, 240, 38, &lv_font_montserrat_28, COL_MUTED, "---");

    hdiv(s_scr, HDR_H + 160);

    // Coolant temp row
    clbl(s_scr,   0, HDR_H + 164, 240, 16, &lv_font_montserrat_12, COL_LABEL, "COOLANT  (°F)");
    clbl(s_scr, 240, HDR_H + 164, 240, 16, &lv_font_montserrat_12, COL_LABEL, "COOLANT  (°F)");
    s_tmp_p = clbl(s_scr,   0, HDR_H + 182, 240, 38, &lv_font_montserrat_28, COL_MUTED, "---");
    s_tmp_s = clbl(s_scr, 240, HDR_H + 182, 240, 38, &lv_font_montserrat_28, COL_MUTED, "---");

    hdiv(s_scr, HDR_H + 226);

    // Chart legend + label
    lv_obj_t* leg = lv_label_create(s_scr);
    lv_obj_set_pos(leg, 0, HDR_H + 231);  lv_obj_set_size(leg, SCR_W, 18);
    lv_obj_set_style_text_font(leg, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(leg, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(leg, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(leg, "COOLANT TEMP | 30 min   #22AA44 PORT#   #4488FF STBD#");
    lv_label_set_recolor(leg, true);
    lv_obj_clear_flag(leg, LV_OBJ_FLAG_CLICKABLE);

    // Chart — fixed °F range covering normal and alarm zones
    s_chart = make_chart(s_scr, HDR_H + 254, 176);
    lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, 120, 240);
    lv_chart_set_axis_tick(s_chart, LV_CHART_AXIS_PRIMARY_Y, 6, 3, 4, 1, true, 42);

    s_port_ser = lv_chart_add_series(s_chart, lv_color_hex(COL_ENG),  LV_CHART_AXIS_PRIMARY_Y);
    s_stbd_ser = lv_chart_add_series(s_chart, lv_color_hex(COL_STBD), LV_CHART_AXIS_PRIMARY_Y);

    for (int i = 0; i < HISTORY_LEN; i++) {
        s_port_pts[i] = LV_CHART_POINT_NONE;
        s_stbd_pts[i] = LV_CHART_POINT_NONE;
    }
    lv_chart_set_ext_y_array(s_chart, s_port_ser, s_port_pts);
    lv_chart_set_ext_y_array(s_chart, s_stbd_ser, s_stbd_pts);

    eng_detail_refresh();
    return s_scr;
}

// ── eng_detail_refresh ────────────────────────────────────────────────────────
static lv_color_t rpm_c(float r) {
    if (isnan(r)) return lv_color_hex(COL_MUTED);
    if (r > 2900)  return lv_color_hex(COL_ALARM);
    if (r > 2600)  return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}
static lv_color_t oil_c(float p) {
    if (isnan(p))  return lv_color_hex(COL_MUTED);
    if (p < 15)    return lv_color_hex(COL_ALARM);
    if (p < 25)    return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}
static lv_color_t tmp_c(float f) {
    if (isnan(f))  return lv_color_hex(COL_MUTED);
    if (f > 215)   return lv_color_hex(COL_ALARM);
    if (f > 200)   return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}

static void slbl(lv_obj_t* o, const char* buf, lv_color_t c) {
    if (strcmp(lv_label_get_text(o), buf) != 0) lv_label_set_text(o, buf);
    if (lv_obj_get_style_text_color(o, LV_PART_MAIN).full != c.full)
        lv_obj_set_style_text_color(o, c, 0);
}

static void set_engine_vals(lv_obj_t* rpm_w, lv_obj_t* oil_w, lv_obj_t* tmp_w,
                             float rpm, float oil, float temp, bool stale) {
    char b[12];
    // Treat engine as idle when RPM data is absent or below crank threshold.
    bool running = !stale && !isnan(rpm) && rpm > 100;

    // RPM: show value when running, dashes when idle/unknown
    if (running) {
        snprintf(b, sizeof(b), "%.0f", rpm);
        slbl(rpm_w, b, rpm_c(rpm));
    } else {
        slbl(rpm_w, "---", lv_color_hex(COL_MUTED));
    }

    // Oil & temp: only valid when engine is actually running
    if (running && !isnan(oil)) {
        snprintf(b, sizeof(b), "%.0f", oil);
        slbl(oil_w, b, oil_c(oil));
    } else {
        slbl(oil_w, "---", lv_color_hex(COL_MUTED));
    }

    if (running && !isnan(temp)) {
        snprintf(b, sizeof(b), "%.0f", temp);
        slbl(tmp_w, b, tmp_c(temp));
    } else {
        slbl(tmp_w, "---", lv_color_hex(COL_MUTED));
    }
}

void eng_detail_refresh(bool update_chart) {
    bool st = gEng.stale();

    set_engine_vals(s_rpm_p, s_oil_p, s_tmp_p,
                    gEng.port_rpm, gEng.port_oil, gEng.port_temp_f, st);
    set_engine_vals(s_rpm_s, s_oil_s, s_tmp_s,
                    gEng.stbd_rpm, gEng.stbd_oil, gEng.stbd_temp_f, st);

    if (!update_chart) return;

    // Coolant temperature history chart
    uint8_t np = gHistory.port_temp_f.count;
    uint8_t ns = gHistory.stbd_temp_f.count;
    for (int i = 0; i < HISTORY_LEN; i++) {
        s_port_pts[i] = (i < np) ? (lv_coord_t)gHistory.port_temp_f.get(i) : LV_CHART_POINT_NONE;
        s_stbd_pts[i] = (i < ns) ? (lv_coord_t)gHistory.stbd_temp_f.get(i) : LV_CHART_POINT_NONE;
    }
    lv_chart_set_ext_y_array(s_chart, s_port_ser, s_port_pts);
    lv_chart_set_ext_y_array(s_chart, s_stbd_ser, s_stbd_pts);
    lv_chart_refresh(s_chart);
}
