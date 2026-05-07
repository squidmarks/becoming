#include "ui_elec_detail.h"
#include "vessel_data.h"
#include "ui_theme.h"
#include <Arduino.h>

#define HDR_H  40
#define SCR_W  480

// Arc left edge / top — 170×170 sits on the left of the top section
#define ARC_X    6
#define ARC_Y    48
#define ARC_W   170
#define ARC_H   170

// Right-column stats start just past the arc + a divider gap
#define STAT_X  188
#define STAT_W  (SCR_W - STAT_X - 6)   // 286 px

// Top section ends below the arc; chart follows immediately after a small gap
#define TOP_END  222   // y of the horizontal divider under the top section
#define CHART_Y  236   // chart top (14 px gap after divider, label is inside chart)

static lv_obj_t *s_scr;
static lv_obj_t *s_arc;
static lv_obj_t *s_soc_lbl;   // % text inside arc
static lv_obj_t *s_amps, *s_acw;
static lv_obj_t *s_state_lbl;
static lv_obj_t *s_chart;
static lv_chart_series_t *s_amps_ser;   // DC amps (left axis, blue)
static lv_chart_series_t *s_acw_ser;    // AC load watts (right axis, amber)
static lv_coord_t s_amps_pts[HISTORY_LEN];
static lv_coord_t s_acw_pts[HISTORY_LEN];

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
    lv_obj_set_style_bg_color(btn, lv_color_hex(0xE0E8F4), 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0xC8D8F0), LV_STATE_PRESSED);
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

// Larger stat block: font_12 caption + font_36 value (total ~62 px tall)
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
    lv_obj_set_pos(vl, x, y + 18);  lv_obj_set_size(vl, w, 44);
    lv_obj_set_style_text_font(vl, &lv_font_montserrat_36, 0);
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
    // Both axes' labels are drawn OUTSIDE the chart widget boundary.
    // Left gap (48 px) gives the primary-Y labels room on screen (x ≥ 6).
    // Right gap (52 px) gives the secondary-Y labels room on screen (x ≤ 474).
    lv_obj_set_pos(c, 48, y);  lv_obj_set_size(c, SCR_W - 100, h);
    lv_chart_set_type(c, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(c, HISTORY_LEN);
    lv_obj_set_style_bg_color(c, lv_color_hex(COL_SEC), 0);
    lv_obj_set_style_text_color(c, lv_color_hex(COL_LABEL), LV_PART_TICKS);
    lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(c, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_line_color(c, lv_color_hex(COL_DIV), LV_PART_MAIN);
    lv_obj_set_style_size(c, 0, LV_PART_INDICATOR);
    lv_obj_set_style_line_width(c, 2, LV_PART_ITEMS);
    lv_obj_set_style_pad_left  (c, 42, 0);
    lv_obj_set_style_pad_right (c,  4, 0);
    lv_obj_set_style_pad_top   (c, 20, 0);   // headroom for the in-chart title
    lv_obj_set_style_pad_bottom(c,  4, 0);
    return c;
}

// ── elec_detail_create ────────────────────────────────────────────────────────
lv_obj_t* elec_detail_create(lv_event_cb_t back_cb) {
    s_scr = lv_obj_create(nullptr);
    lv_obj_set_size(s_scr, SCR_W, 480);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    // Header with state label right-justified inside it
    lv_obj_t* hdr = detail_header(s_scr, COL_ELEC, "ELECTRICAL", back_cb);

    s_state_lbl = lv_label_create(hdr);
    lv_obj_set_pos (s_state_lbl, SCR_W - 118, 0);
    lv_obj_set_size(s_state_lbl, 110, HDR_H);
    lv_obj_set_style_text_font (s_state_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(s_state_lbl, lv_color_hex(COL_ELEC), 0);
    lv_obj_set_style_text_align(s_state_lbl, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_set_style_pad_top   (s_state_lbl, 13, 0);
    lv_obj_set_style_pad_right (s_state_lbl,  6, 0);
    lv_label_set_text(s_state_lbl, "");
    lv_obj_clear_flag(s_state_lbl, LV_OBJ_FLAG_CLICKABLE);

    // ── SOC arc — left side ───────────────────────────────────────────────────
    s_arc = lv_arc_create(s_scr);
    lv_obj_set_pos (s_arc, ARC_X, ARC_Y);
    lv_obj_set_size(s_arc, ARC_W, ARC_H);

    lv_obj_set_style_arc_color(s_arc, lv_color_hex(COL_DIV),  LV_PART_MAIN);
    lv_obj_set_style_arc_width(s_arc, 20, LV_PART_MAIN);
    lv_obj_set_style_bg_opa   (s_arc, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_border_width(s_arc, 0, LV_PART_MAIN);

    lv_obj_set_style_arc_color(s_arc, lv_color_hex(COL_GOOD), LV_PART_INDICATOR);
    lv_obj_set_style_arc_width(s_arc, 20, LV_PART_INDICATOR);

    lv_obj_set_style_bg_opa(s_arc, LV_OPA_TRANSP, LV_PART_KNOB);
    lv_obj_set_style_pad_all(s_arc, 0, LV_PART_KNOB);
    lv_obj_set_style_size   (s_arc, 0, LV_PART_KNOB);

    lv_arc_set_rotation     (s_arc, 135);
    lv_arc_set_bg_start_angle(s_arc, 0);
    lv_arc_set_bg_end_angle  (s_arc, 270);
    lv_arc_set_range(s_arc, 0, 100);
    lv_arc_set_value(s_arc, 0);
    lv_obj_clear_flag(s_arc, LV_OBJ_FLAG_CLICKABLE);

    // SoC % text centered in arc
    s_soc_lbl = lv_label_create(s_scr);
    lv_obj_set_size(s_soc_lbl, 120, 44);
    lv_obj_align_to(s_soc_lbl, s_arc, LV_ALIGN_CENTER, 0, -6);
    lv_obj_set_style_text_font (s_soc_lbl, &lv_font_montserrat_36, 0);
    lv_obj_set_style_text_color(s_soc_lbl, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(s_soc_lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_soc_lbl, "---%");
    lv_obj_clear_flag(s_soc_lbl, LV_OBJ_FLAG_CLICKABLE);

    // "STATE OF CHARGE" sub-label inside arc
    lv_obj_t* sl = lv_label_create(s_scr);
    lv_obj_set_size(sl, 140, 16);
    lv_obj_align_to(sl, s_arc, LV_ALIGN_CENTER, 0, 30);
    lv_obj_set_style_text_font (sl, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_color(sl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(sl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(sl, "STATE OF CHARGE");
    lv_obj_clear_flag(sl, LV_OBJ_FLAG_CLICKABLE);

    // ── Vertical divider between arc and stats ─────────────────────────────
    lv_obj_t* vdiv = lv_obj_create(s_scr);
    lv_obj_set_pos (vdiv, STAT_X - 6, ARC_Y);
    lv_obj_set_size(vdiv, 1, TOP_END - ARC_Y);
    lv_obj_set_style_bg_color(vdiv, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(vdiv, 0, 0);
    lv_obj_clear_flag(vdiv, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    // ── Right-column: DC Amps and AC Load (two large blocks) ──────────────
    // Two blocks × 62 px each, 24 px gap, centred within the 174 px arc height.
    // Block layout: caption (16 px) + value (44 px, font_36) + 2 px slack = 62 px
    // Total span: 62 + 24 + 62 = 148 px.  Starting y = ARC_Y + (174-148)/2 ≈ ARC_Y + 13
    int16_t sy = ARC_Y + 13;

    s_amps = stat_block(s_scr, STAT_X, sy,       STAT_W, "DC  (A)");
    s_acw  = stat_block(s_scr, STAT_X, sy + 86,  STAT_W, "AC LOAD  (W)");

    // ── Horizontal divider ─────────────────────────────────────────────────
    hdiv(s_scr, TOP_END);

    // ── Dual-series history chart ──────────────────────────────────────────
    s_chart = make_chart(s_scr, CHART_Y, 480 - CHART_Y - 4);

    // Title label centred over the chart's inner plot area.
    // Chart: x=48, w=380. Plot area: x=48+42=90, w=380-42-4=334.
    lv_obj_t* cl = lv_label_create(s_scr);
    lv_obj_set_pos (cl, 90, CHART_Y + 5);
    lv_obj_set_size(cl, 334, 14);
    lv_obj_set_style_text_font (cl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(cl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(cl, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(cl, "DC Amps (A)  and  AC Load (W)  |  last 75 min");
    lv_obj_clear_flag(cl, LV_OBJ_FLAG_CLICKABLE);

    // Primary Y axis — DC Amps (left, blue); initial ±10 A, autoscales
    lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, -10, 10);
    lv_chart_set_axis_tick(s_chart, LV_CHART_AXIS_PRIMARY_Y,
                            6, 3, 5, 1, true, 42);

    // Secondary Y axis — AC Load W (right, amber); initial 0-100 W, autoscales
    lv_chart_set_range(s_chart, LV_CHART_AXIS_SECONDARY_Y, 0, 100);
    lv_chart_set_axis_tick(s_chart, LV_CHART_AXIS_SECONDARY_Y,
                            6, 3, 5, 1, true, 42);

    s_amps_ser = lv_chart_add_series(s_chart,
                    lv_color_hex(COL_NAV), LV_CHART_AXIS_PRIMARY_Y);
    s_acw_ser  = lv_chart_add_series(s_chart,
                    lv_color_hex(COL_ELEC), LV_CHART_AXIS_SECONDARY_Y);

    for (int i = 0; i < HISTORY_LEN; i++) {
        s_amps_pts[i] = LV_CHART_POINT_NONE;
        s_acw_pts[i]  = LV_CHART_POINT_NONE;
    }
    lv_chart_set_ext_y_array(s_chart, s_amps_ser, s_amps_pts);
    lv_chart_set_ext_y_array(s_chart, s_acw_ser,  s_acw_pts);

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

    // State text (now lives in the header)
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

    // Arc + SoC label
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

    // AC watts
    if (!st && !isnan(gElec.inv_load_w)) {
        snprintf(b, sizeof(b), "%.0f", gElec.inv_load_w);
        slbl(s_acw, b, lv_color_hex(COL_VALUE));
    } else {
        slbl(s_acw, "---", lv_color_hex(COL_MUTED));
    }

    if (!update_chart) return;

    // ── DC Amps history (primary Y, left axis) ────────────────────────────────
    // Sign-flipped so positive = charging (consistent with the stat block).
    // Stored as integer amps (rounded) for the integer lv_coord_t.
    uint16_t n_amps = gHistory.amps.count;
    lv_coord_t amps_mn = 0, amps_mx = 0;
    for (int i = 0; i < HISTORY_LEN; i++) {
        if (i < n_amps) {
            lv_coord_t v = (lv_coord_t)roundf(-gHistory.amps.get(i));
            s_amps_pts[i] = v;
            if (v < amps_mn) amps_mn = v;
            if (v > amps_mx) amps_mx = v;
        } else {
            s_amps_pts[i] = LV_CHART_POINT_NONE;
        }
    }
    {
        // Symmetric range around 0; minimum ±10 A; add ~20 % headroom
        lv_coord_t extreme = (lv_coord_t)max(abs(amps_mn), abs(amps_mx));
        if (extreme < 10) extreme = 10;
        lv_coord_t margin = max((lv_coord_t)2, (lv_coord_t)(extreme / 5));
        lv_coord_t lim = extreme + margin;
        lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, -lim, lim);
    }
    lv_chart_set_ext_y_array(s_chart, s_amps_ser, s_amps_pts);

    // ── AC Load history (secondary Y, right axis) ─────────────────────────────
    // Always ≥ 0; minimum ceiling 100 W; rounds up to next 100 W boundary.
    uint16_t n_acw = gHistory.inv_load_w.count;
    lv_coord_t acw_mx = 0;
    for (int i = 0; i < HISTORY_LEN; i++) {
        if (i < n_acw) {
            lv_coord_t v = (lv_coord_t)roundf(gHistory.inv_load_w.get(i));
            s_acw_pts[i] = v;
            if (v > acw_mx) acw_mx = v;
        } else {
            s_acw_pts[i] = LV_CHART_POINT_NONE;
        }
    }
    lv_coord_t acw_ceil = ((acw_mx / 100) + 1) * 100;
    if (acw_ceil < 100) acw_ceil = 100;
    lv_chart_set_range(s_chart, LV_CHART_AXIS_SECONDARY_Y, 0, acw_ceil);
    lv_chart_set_ext_y_array(s_chart, s_acw_ser, s_acw_pts);

    lv_chart_refresh(s_chart);
}
