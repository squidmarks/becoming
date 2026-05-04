#include "ui_nav_detail.h"
#include "vessel_data.h"
#include "ui_theme.h"
#include <Arduino.h>

// ── Layout ────────────────────────────────────────────────────────────────────
// 480×480  Header=40  Depth block=120  SOG/HDG row=75  COG row=45  chart area
#define HDR_H  40
#define SCR_W  480

// ── Widgets ───────────────────────────────────────────────────────────────────
static lv_obj_t *s_scr;
static lv_obj_t *s_depth, *s_sog, *s_hdg, *s_cog;
static lv_obj_t *s_chart;
static lv_chart_series_t *s_dep_ser;
static lv_coord_t s_dep_pts[HISTORY_LEN];

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

// Returns value label.
static lv_obj_t* val_block(lv_obj_t* scr,
                             int16_t x, int16_t y, int16_t w,
                             const char* unit_label,
                             const lv_font_t* vfont, uint32_t vcol) {
    lv_obj_t* u = lv_label_create(scr);
    lv_obj_set_pos(u, x, y);  lv_obj_set_size(u, w, 16);
    lv_obj_set_style_text_font(u, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(u, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(u, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(u, unit_label);
    lv_obj_clear_flag(u, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t* v = lv_label_create(scr);
    lv_obj_set_pos(v, x, y + 18);  lv_obj_set_size(v, w, 44);
    lv_obj_set_style_text_font(v, vfont, 0);
    lv_obj_set_style_text_color(v, lv_color_hex(vcol), 0);
    lv_obj_set_style_text_align(v, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(v, "---");
    lv_obj_clear_flag(v, LV_OBJ_FLAG_CLICKABLE);
    return v;
}

static lv_obj_t* chart_label(lv_obj_t* scr, int16_t y, const char* txt) {
    lv_obj_t* l = lv_label_create(scr);
    lv_obj_set_pos(l, 0, y);  lv_obj_set_size(l, SCR_W, 20);
    lv_obj_set_style_text_font(l, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
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
    lv_obj_set_style_size(c, 0, LV_PART_INDICATOR);  // no dots
    lv_obj_set_style_line_width(c, 2, LV_PART_ITEMS);
    lv_obj_set_style_pad_left(c, 42, 0);
    lv_obj_set_style_pad_right(c, 6, 0);
    lv_obj_set_style_pad_top(c, 4, 0);
    lv_obj_set_style_pad_bottom(c, 4, 0);
    return c;
}

// ── nav_detail_create ─────────────────────────────────────────────────────────
lv_obj_t* nav_detail_create(lv_event_cb_t back_cb) {
    s_scr = lv_obj_create(nullptr);
    lv_obj_set_size(s_scr, SCR_W, 480);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);

    detail_header(s_scr, COL_NAV, "NAVIGATION", back_cb);

    // Large depth
    lv_obj_t* dep_cap = lv_label_create(s_scr);
    lv_obj_set_pos(dep_cap, 0, 50);  lv_obj_set_size(dep_cap, SCR_W, 18);
    lv_obj_set_style_text_font(dep_cap, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(dep_cap, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(dep_cap, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(dep_cap, "DEPTH  |  ft");
    lv_obj_clear_flag(dep_cap, LV_OBJ_FLAG_CLICKABLE);

    s_depth = lv_label_create(s_scr);
    lv_obj_set_pos(s_depth, 0, 72);  lv_obj_set_size(s_depth, SCR_W, 52);
    lv_obj_set_style_text_font(s_depth, &lv_font_montserrat_36, 0);
    lv_obj_set_style_text_color(s_depth, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(s_depth, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_depth, "---");
    lv_obj_clear_flag(s_depth, LV_OBJ_FLAG_CLICKABLE);

    hdiv(s_scr, 134);

    // SOG and HDG columns
    s_sog = val_block(s_scr,   0, 142, 240, "SOG  (kt)",  &lv_font_montserrat_28, COL_VALUE);
    s_hdg = val_block(s_scr, 240, 142, 240, "HDG  (°M)",  &lv_font_montserrat_28, COL_VALUE);

    lv_obj_t* vd = lv_obj_create(s_scr);  // vertical divider between columns
    lv_obj_set_pos(vd, 239, 142);  lv_obj_set_size(vd, 1, 70);
    lv_obj_set_style_bg_color(vd, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(vd, 0, 0);
    lv_obj_clear_flag(vd, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    hdiv(s_scr, 218);

    // COG row
    s_cog = val_block(s_scr, 0, 226, 240, "COG  (°T)", &lv_font_montserrat_28, COL_VALUE);

    hdiv(s_scr, 278);
    chart_label(s_scr, 283, "DEPTH HISTORY  |  last 10 min");

    // Chart
    s_chart = make_chart(s_scr, 308, 160);
    lv_chart_set_axis_tick(s_chart, LV_CHART_AXIS_PRIMARY_Y, 6, 3, 4, 1, true, 42);
    s_dep_ser = lv_chart_add_series(s_chart, lv_color_hex(COL_NAV), LV_CHART_AXIS_PRIMARY_Y);

    for (int i = 0; i < HISTORY_LEN; i++) s_dep_pts[i] = LV_CHART_POINT_NONE;
    lv_chart_set_ext_y_array(s_chart, s_dep_ser, s_dep_pts);
    lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y, 0, 50);

    nav_detail_refresh();
    return s_scr;
}

// ── nav_detail_refresh ────────────────────────────────────────────────────────
static void slbl(lv_obj_t* o, bool bad, float v, const char* fmt, uint32_t c) {
    char buf[12];
    if (bad || isnan(v)) { strcpy(buf, "---"); c = COL_MUTED; }
    else snprintf(buf, sizeof(buf), fmt, v);
    if (strcmp(lv_label_get_text(o), buf) != 0) lv_label_set_text(o, buf);
    lv_color_t lc = lv_color_hex(c);
    if (lv_obj_get_style_text_color(o, LV_PART_MAIN).full != lc.full)
        lv_obj_set_style_text_color(o, lc, 0);
}

void nav_detail_refresh(bool update_chart) {
    bool st = gNav.stale();
    slbl(s_depth, st, gNav.depth_m * 3.28084f, "%.1f", COL_VALUE);
    slbl(s_sog,   st, gNav.sog_kts,             "%.1f", COL_VALUE);
    slbl(s_hdg,   st, gNav.hdg_deg,             "%.0f", COL_VALUE);
    slbl(s_cog,   st, gNav.cog_deg,             "%.0f", COL_VALUE);

    if (!update_chart) return;

    // Update depth history chart
    uint8_t n = gHistory.depth_m.count;
    lv_coord_t mn = 32767, mx = -32767;
    for (int i = 0; i < HISTORY_LEN; i++) {
        if (i < n) {
            lv_coord_t v = (lv_coord_t)(gHistory.depth_m.get(i) * 3.28084f);
            s_dep_pts[i] = v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        } else {
            s_dep_pts[i] = LV_CHART_POINT_NONE;
        }
    }
    if (n > 0) {
        lv_coord_t pad = (lv_coord_t)((mx - mn) / 4);
        if (pad < 3) pad = 3;
        lv_chart_set_range(s_chart, LV_CHART_AXIS_PRIMARY_Y,
                           (mn - pad > 0) ? mn - pad : 0, mx + pad);
    }
    lv_chart_set_ext_y_array(s_chart, s_dep_ser, s_dep_pts);
    lv_chart_refresh(s_chart);
}
