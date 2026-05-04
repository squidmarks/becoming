#include "ui_elec_detail.h"
#include "vessel_data.h"
#include "ui_theme.h"
#include <Arduino.h>

#define HDR_H  40
#define SCR_W  480

static lv_obj_t *s_scr;
static lv_obj_t *s_arc;
static lv_obj_t *s_soc_lbl;   // % text inside arc
static lv_obj_t *s_amps, *s_volts, *s_acw;
static lv_obj_t *s_state_lbl;
static lv_obj_t *s_chart;
static lv_chart_series_t *s_soc_ser;
static lv_coord_t s_soc_pts[HISTORY_LEN];

// ── Helpers ───────────────────────────────────────────────────────────────────
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

static lv_obj_t* stat_block(lv_obj_t* scr,
                              int16_t x, int16_t y, int16_t w,
                              const char* cap) {
    lv_obj_t* cl = lv_label_create(scr);
    lv_obj_set_pos(cl, x, y);  lv_obj_set_size(cl, w, 16);
    lv_obj_set_style_text_font(cl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(cl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(cl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(cl, cap);
    lv_obj_clear_flag(cl, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t* vl = lv_label_create(scr);
    lv_obj_set_pos(vl, x, y + 18);  lv_obj_set_size(vl, w, 34);
    lv_obj_set_style_text_font(vl, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(vl, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(vl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(vl, "---");
    lv_obj_clear_flag(vl, LV_OBJ_FLAG_CLICKABLE);
    return vl;
}

static lv_color_t soc_color(float p) {
    if (isnan(p)) return lv_color_hex(COL_MUTED);
    if (p < 20)   return lv_color_hex(COL_ALARM);
    if (p < 40)   return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_GOOD);
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

// ── elec_detail_create ────────────────────────────────────────────────────────
lv_obj_t* elec_detail_create(lv_event_cb_t back_cb) {
    s_scr = lv_obj_create(nullptr);
    lv_obj_set_size(s_scr, SCR_W, 480);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    detail_header(s_scr, COL_ELEC, "ELECTRICAL", back_cb);

    // State text at top of primary area
    s_state_lbl = lv_label_create(s_scr);
    lv_obj_set_pos(s_state_lbl, 0, HDR_H + 4);
    lv_obj_set_size(s_state_lbl, SCR_W, 18);
    lv_obj_set_style_text_font(s_state_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(s_state_lbl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(s_state_lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_state_lbl, "");
    lv_obj_clear_flag(s_state_lbl, LV_OBJ_FLAG_CLICKABLE);

    // SOC arc gauge — centred, 170×170 px
    s_arc = lv_arc_create(s_scr);
    lv_obj_set_size(s_arc, 170, 170);
    lv_obj_align(s_arc, LV_ALIGN_TOP_MID, 0, HDR_H + 24);

    // Background arc track
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(COL_DIV), LV_PART_MAIN);
    lv_obj_set_style_arc_width(s_arc, 20, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(s_arc, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_border_width(s_arc, 0, LV_PART_MAIN);

    // Indicator arc
    lv_obj_set_style_arc_color(s_arc, lv_color_hex(COL_GOOD), LV_PART_INDICATOR);
    lv_obj_set_style_arc_width(s_arc, 20, LV_PART_INDICATOR);

    // Hide knob
    lv_obj_set_style_bg_opa(s_arc, LV_OPA_TRANSP, LV_PART_KNOB);
    lv_obj_set_style_pad_all(s_arc, 0, LV_PART_KNOB);
    lv_obj_set_style_size(s_arc, 0, LV_PART_KNOB);

    // Arc geometry: 270° sweep from lower-left to lower-right (via top)
    lv_arc_set_rotation(s_arc, 135);
    lv_arc_set_bg_start_angle(s_arc, 0);
    lv_arc_set_bg_end_angle(s_arc, 270);
    lv_arc_set_range(s_arc, 0, 100);
    lv_arc_set_value(s_arc, 0);
    lv_obj_clear_flag(s_arc, LV_OBJ_FLAG_CLICKABLE);

    // SoC % text centered inside arc
    s_soc_lbl = lv_label_create(s_scr);
    lv_obj_set_size(s_soc_lbl, 120, 44);
    lv_obj_align_to(s_soc_lbl, s_arc, LV_ALIGN_CENTER, 0, -4);
    lv_obj_set_style_text_font(s_soc_lbl, &lv_font_montserrat_36, 0);
    lv_obj_set_style_text_color(s_soc_lbl, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(s_soc_lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_soc_lbl, "---%");
    lv_obj_clear_flag(s_soc_lbl, LV_OBJ_FLAG_CLICKABLE);

    // "SOC" sub-label
    lv_obj_t* sl = lv_label_create(s_scr);
    lv_obj_set_size(sl, 120, 18);
    lv_obj_align_to(sl, s_arc, LV_ALIGN_CENTER, 0, 28);
    lv_obj_set_style_text_font(sl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(sl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(sl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(sl, "STATE OF CHARGE");
    lv_obj_clear_flag(sl, LV_OBJ_FLAG_CLICKABLE);

    // Stats row below arc: Amps | Volts | AC Watts
    // Arc bottom is at HDR_H + 24 + 170 = HDR_H + 194
    int16_t row_y = HDR_H + 200;

    // Vertical dividers in stats row
    lv_obj_t* vd1 = lv_obj_create(s_scr);
    lv_obj_set_pos(vd1, 159, row_y);  lv_obj_set_size(vd1, 1, 56);
    lv_obj_set_style_bg_color(vd1, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(vd1, 0, 0);
    lv_obj_clear_flag(vd1, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* vd2 = lv_obj_create(s_scr);
    lv_obj_set_pos(vd2, 319, row_y);  lv_obj_set_size(vd2, 1, 56);
    lv_obj_set_style_bg_color(vd2, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(vd2, 0, 0);
    lv_obj_clear_flag(vd2, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    s_amps  = stat_block(s_scr,   0, row_y, 160, "DC  (A)");
    s_volts = stat_block(s_scr, 160, row_y, 160, "VOLTAGE  (V)");
    s_acw   = stat_block(s_scr, 320, row_y, 160, "AC LOAD  (W)");

    hdiv(s_scr, row_y + 62);

    lv_obj_t* cl = lv_label_create(s_scr);
    lv_obj_set_pos(cl, 0, row_y + 67);  lv_obj_set_size(cl, SCR_W, 18);
    lv_obj_set_style_text_font(cl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(cl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(cl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(cl, "STATE OF CHARGE  |  last 30 min");
    lv_obj_clear_flag(cl, LV_OBJ_FLAG_CLICKABLE);

    s_chart = make_chart(s_scr, row_y + 90, 480 - (row_y + 95));
    lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, 0, 100);
    lv_chart_set_axis_tick(s_chart, LV_CHART_AXIS_PRIMARY_Y, 6, 3, 5, 1, true, 42);
    s_soc_ser = lv_chart_add_series(s_chart, lv_color_hex(COL_GOOD), LV_CHART_AXIS_PRIMARY_Y);

    for (int i = 0; i < HISTORY_LEN; i++) s_soc_pts[i] = LV_CHART_POINT_NONE;
    lv_chart_set_ext_y_array(s_chart, s_soc_ser, s_soc_pts);

    elec_detail_refresh();
    return s_scr;
}

// ── elec_detail_refresh ───────────────────────────────────────────────────────
static void slbl(lv_obj_t* o, const char* buf, lv_color_t c) {
    if (strcmp(lv_label_get_text(o), buf) != 0) lv_label_set_text(o, buf);
    if (lv_obj_get_style_text_color(o, LV_PART_MAIN).full != c.full)
        lv_obj_set_style_text_color(o, c, 0);
}

void elec_detail_refresh(bool update_chart) {
    bool st = gElec.stale();
    char b[16];

    // State text
    const char* state_str = "";
    if (!st && gElec.state[0]) {
        const char* s = gElec.state;
        if      (strstr(s, "nvert"))  state_str = "INVERTING";
        else if (strstr(s, "ypass"))  state_str = "BYPASS";
        else if (strstr(s, "loat"))   state_str = "FLOAT";
        else if (strstr(s, "bsorb"))  state_str = "ABSORB";
        else if (strstr(s, "ulk"))    state_str = "BULK";
        else if (strstr(s, "harg"))   state_str = "CHARGING";
        else if (strstr(s, "ff"))     state_str = "OFF";
        else                          state_str = gElec.state;
    }
    if (strcmp(lv_label_get_text(s_state_lbl), state_str) != 0)
        lv_label_set_text(s_state_lbl, state_str);

    // Arc + SoC label — use roundf() so display matches the dashboard's "%.0f"
    if (!st && !isnan(gElec.soc_pct)) {
        int soc = (int)roundf(gElec.soc_pct);
        lv_arc_set_value(s_arc, soc);
        lv_obj_set_style_arc_color(s_arc, soc_color(gElec.soc_pct), LV_PART_INDICATOR);
        snprintf(b, sizeof(b), "%.0f%%", gElec.soc_pct);
        slbl(s_soc_lbl, b, soc_color(gElec.soc_pct));
    } else {
        lv_arc_set_value(s_arc, 0);
        lv_obj_set_style_arc_color(s_arc, lv_color_hex(COL_MUTED), LV_PART_INDICATOR);
        slbl(s_soc_lbl, "---%", lv_color_hex(COL_MUTED));
    }

    // DC amps (flipped: + = charging)
    if (!st && !isnan(gElec.amps)) {
        float da = -gElec.amps;
        snprintf(b, sizeof(b), "%+.1f", da);
        slbl(s_amps, b, da > 0 ? lv_color_hex(COL_GOOD) : lv_color_hex(COL_VALUE));
    } else {
        slbl(s_amps, "---", lv_color_hex(COL_MUTED));
    }

    // Voltage
    if (!st && !isnan(gElec.volts)) {
        snprintf(b, sizeof(b), "%.1f", gElec.volts);
        slbl(s_volts, b, lv_color_hex(COL_VALUE));
    } else {
        slbl(s_volts, "---", lv_color_hex(COL_MUTED));
    }

    // AC watts
    if (!st && !isnan(gElec.inv_load_w)) {
        snprintf(b, sizeof(b), "%.0f", gElec.inv_load_w);
        slbl(s_acw, b, lv_color_hex(COL_VALUE));
    } else {
        slbl(s_acw, "---", lv_color_hex(COL_MUTED));
    }

    if (!update_chart) return;

    // SoC history chart with auto-ranging so small changes are visible
    uint8_t n = gHistory.soc_pct.count;
    lv_coord_t mn = 100, mx = 0;
    for (int i = 0; i < HISTORY_LEN; i++) {
        if (i < n) {
            lv_coord_t v = (lv_coord_t)gHistory.soc_pct.get(i);
            s_soc_pts[i] = v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        } else {
            s_soc_pts[i] = LV_CHART_POINT_NONE;
        }
    }
    if (n > 0) {
        // Zoom into the range of observed values with a comfortable margin
        lv_coord_t pad = (lv_coord_t)((mx - mn) / 4);
        if (pad < 5) pad = 5;
        lv_coord_t lo = (mn - pad < 0)   ? 0   : mn - pad;
        lv_coord_t hi = (mx + pad > 100) ? 100 : mx + pad;
        lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, lo, hi);
    }
    lv_chart_set_ext_y_array(s_chart, s_soc_ser, s_soc_pts);
    lv_chart_refresh(s_chart);
}
