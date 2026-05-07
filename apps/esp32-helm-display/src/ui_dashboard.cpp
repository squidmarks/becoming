#include "ui_dashboard.h"
#include "vessel_data.h"
#include "signalk_client.h"
#include <Arduino.h>

// ── Colour palette (must match ui_theme.h) ────────────────────────────────────
#define COL_BG    0xEEF1F5
#define COL_SEC   0xFFFFFF
#define COL_LABEL 0x44577A
#define COL_VALUE 0x0D1B2A
#define COL_GOOD  0x18A030
#define COL_WARN  0xD98000
#define COL_ALARM 0xCC2200
#define COL_MUTED 0x9AAFBE
#define COL_NAV   0x1A5FCC
#define COL_ENG   0x198A35
#define COL_ELEC  0xB86818
#define COL_DIV   0xC0CCDA

// ── Layout ────────────────────────────────────────────────────────────────────
#define SCR_W       480
#define SEC_H       158
#define SEC_GAP     3
#define HDR_H       28
#define CONT_Y      HDR_H
#define CONT_H      (SEC_H - HDR_H)    // 130 px

#define SEC_NAV_Y   0
#define SEC_ENG_Y   (SEC_H + SEC_GAP)
#define SEC_ELC_Y   (2 * (SEC_H + SEC_GAP))

// ENGINE: narrow P/S column on left, then 3 equal dual tiles
#define ENG_PS_W    30
#define ENG_TILE_W  ((SCR_W - ENG_PS_W) / 3)   // 150 px

// Dual-tile vertical layout (montserrat_40 values, h=44 each):
//   top_pad(4) | PORT(44) | gap(4) | STBD(44) | gap(4) | UNIT(18) | bot_pad(12)
#define DT_PORT_Y   (CONT_Y + 4)
#define DT_STBD_Y   (CONT_Y + 56)
#define DT_UNIT_Y   (CONT_Y + 106)
#define DT_PORT_CY  (DT_PORT_Y + 22)
#define DT_STBD_CY  (DT_STBD_Y + 22)

// ── Widget references ─────────────────────────────────────────────────────────
static lv_obj_t *nav_dot,   *nav_status;
static lv_obj_t *eng_dot,   *eng_status;
static lv_obj_t *elec_dot,  *elec_status;

// Section containers exposed to main.cpp for touch navigation
static lv_obj_t *s_nav_sec, *s_eng_sec, *s_elec_sec;

static lv_obj_t *nav_sog, *nav_hdg, *nav_dep;
static lv_obj_t *eng_rpm_p, *eng_rpm_s;
static lv_obj_t *eng_oil_p, *eng_oil_s;
static lv_obj_t *eng_tmp_p, *eng_tmp_s;
static lv_obj_t *elec_soc, *elec_dca, *elec_acw;

// ── Color guards (skip LVGL style write when value unchanged) ─────────────────
static inline void set_text_color(lv_obj_t* o, lv_color_t c) {
    if (lv_obj_get_style_text_color(o, LV_PART_MAIN).full != c.full)
        lv_obj_set_style_text_color(o, c, 0);
}
static inline void set_bg_color(lv_obj_t* o, lv_color_t c) {
    if (lv_obj_get_style_bg_color(o, LV_PART_MAIN).full != c.full)
        lv_obj_set_style_bg_color(o, c, 0);
}

// ── set_val ───────────────────────────────────────────────────────────────────
static void set_val(lv_obj_t* lbl, bool stale, float v,
                    const char* fmt, lv_color_t c) {
    char buf[16];
    if (stale || isnan(v)) { strcpy(buf, "---"); c = lv_color_hex(COL_MUTED); }
    else                    snprintf(buf, sizeof(buf), fmt, v);
    if (strcmp(lv_label_get_text(lbl), buf) != 0) lv_label_set_text(lbl, buf);
    set_text_color(lbl, c);
}

// ── Alarm colours ─────────────────────────────────────────────────────────────
static lv_color_t rpm_color(float r) {
    if (isnan(r))  return lv_color_hex(COL_MUTED);
    if (r > 2900)  return lv_color_hex(COL_ALARM);
    if (r > 2600)  return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}
static lv_color_t oil_color(float p, float r) {
    if (isnan(p))             return lv_color_hex(COL_MUTED);
    if (!isnan(r) && r < 200) return lv_color_hex(COL_VALUE);
    if (p < 15) return lv_color_hex(COL_ALARM);
    if (p < 25) return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}
static lv_color_t temp_color(float f, float r) {
    if (isnan(f))             return lv_color_hex(COL_MUTED);
    if (!isnan(r) && r < 200) return lv_color_hex(COL_VALUE);
    if (f > 215) return lv_color_hex(COL_ALARM);
    if (f > 200) return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}
static lv_color_t soc_color(float p) {
    if (isnan(p)) return lv_color_hex(COL_MUTED);
    if (p < 20)   return lv_color_hex(COL_ALARM);
    if (p < 40)   return lv_color_hex(COL_WARN);
    return lv_color_hex(COL_VALUE);
}

// ── Section status text helpers ───────────────────────────────────────────────
// Returns a static string literal (safe to strcmp against lv_label_get_text).

static const char* nav_status_str() {
    if (gNav.stale() || isnan(gNav.sog_kts)) return "";
    if (gNav.sog_kts > 1.5f)  return "UNDERWAY";
    if (gAnchor.active) {
        return gAnchor.alarm ? "DRAGGING" : "ANCHORED";
    }
    if (gNav.sog_kts > 0.3f)  return "AT REST";
    return "AT ANCHOR";
}

static const char* eng_status_str() {
    if (gEng.stale()) return "";
    bool p = !isnan(gEng.port_rpm) && gEng.port_rpm > 100;
    bool s = !isnan(gEng.stbd_rpm) && gEng.stbd_rpm > 100;
    if (p && s)  return "RUNNING";
    if (p)       return "PORT ONLY";
    if (s)       return "STBD ONLY";
    return "IDLE";
}

static const char* elec_status_str() {
    if (gElec.stale() || !gElec.state[0]) return "";
    const char* st = gElec.state;
    if (strstr(st, "nvert"))  return "INVERTING";
    if (strstr(st, "ypass"))  return "BYPASS";
    if (strstr(st, "loat"))   return "FLOAT";
    if (strstr(st, "bsorb"))  return "ABSORB";
    if (strstr(st, "ulk"))    return "BULK";
    if (strstr(st, "harg"))   return "CHARGING";
    if (strstr(st, "ff"))     return "OFF";
    return "ERROR";
}

static void set_status(lv_obj_t* lbl, const char* s) {
    if (strcmp(lv_label_get_text(lbl), s) != 0) lv_label_set_text(lbl, s);
}

// ── Section scaffold ──────────────────────────────────────────────────────────
static lv_obj_t* make_section(lv_obj_t* parent, int16_t y,
                               uint32_t accent, const char* title,
                               lv_event_cb_t tap_cb,
                               lv_obj_t** dot_out,
                               lv_obj_t** status_out) {
    lv_obj_t* sec = lv_obj_create(parent);
    lv_obj_set_pos(sec, 0, y);  lv_obj_set_size(sec, SCR_W, SEC_H);
    lv_obj_set_style_bg_color(sec, lv_color_hex(COL_SEC), 0);
    lv_obj_set_style_border_width(sec, 0, 0);  lv_obj_set_style_radius(sec, 0, 0);
    lv_obj_set_style_pad_all(sec, 0, 0);
    lv_obj_clear_flag(sec, LV_OBJ_FLAG_SCROLLABLE);
    if (tap_cb) lv_obj_add_event_cb(sec, tap_cb, LV_EVENT_CLICKED, nullptr);

    // Accent bar
    lv_obj_t* bar = lv_obj_create(sec);
    lv_obj_set_pos(bar, 0, 0);  lv_obj_set_size(bar, 4, HDR_H);
    lv_obj_set_style_bg_color(bar, lv_color_hex(accent), 0);
    lv_obj_set_style_border_width(bar, 0, 0);  lv_obj_set_style_radius(bar, 0, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

    // Section title (left)
    lv_obj_t* lbl = lv_label_create(sec);
    lv_label_set_text(lbl, title);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_18, 0);
    lv_obj_set_style_text_color(lbl, lv_color_hex(accent), 0);
    lv_obj_set_pos(lbl, 12, 4);
    lv_obj_clear_flag(lbl, LV_OBJ_FLAG_CLICKABLE);

    // Status text (right-justified in header, before dot+chevron area)
    // Occupies x=0..SCR_W-50, right-aligned — stays clear of the 50px dot/chevron zone
    lv_obj_t* status = lv_label_create(sec);
    lv_label_set_text(status, "");
    lv_obj_set_style_text_font(status, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(status, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_size(status, SCR_W - 50, HDR_H);
    lv_obj_set_pos(status, 0, 0);
    lv_obj_set_style_text_align(status, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_set_style_pad_top(status, 7, 0);
    lv_obj_set_style_pad_right(status, 4, 0);
    lv_obj_clear_flag(status, LV_OBJ_FLAG_CLICKABLE);
    *status_out = status;

    // Live-data dot
    lv_obj_t* dot = lv_obj_create(sec);
    lv_obj_set_size(dot, 8, 8);
    lv_obj_align(dot, LV_ALIGN_TOP_RIGHT, -24, 10);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_border_width(dot, 0, 0);
    lv_obj_clear_flag(dot, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    *dot_out = dot;

    // Chevron (rightmost)
    lv_obj_t* chev = lv_label_create(sec);
    lv_label_set_text(chev, LV_SYMBOL_RIGHT);
    lv_obj_set_style_text_color(chev, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_font(chev, &lv_font_montserrat_14, 0);
    lv_obj_align(chev, LV_ALIGN_TOP_RIGHT, -8, 6);
    lv_obj_clear_flag(chev, LV_OBJ_FLAG_CLICKABLE);

    return sec;
}

// ── Centered fixed-width label ────────────────────────────────────────────────
static lv_obj_t* clabel(lv_obj_t* parent,
                          int16_t x, int16_t y, int16_t w, int16_t h,
                          const lv_font_t* font, uint32_t col, const char* txt) {
    lv_obj_t* l = lv_label_create(parent);
    lv_obj_set_pos(l, x, y);  lv_obj_set_size(l, w, h);
    lv_label_set_long_mode(l, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(col), 0);
    lv_label_set_text(l, txt);
    lv_obj_clear_flag(l, LV_OBJ_FLAG_CLICKABLE);
    return l;
}

// ── Single-value tile ─────────────────────────────────────────────────────────
static lv_obj_t* make_tile(lv_obj_t* parent, int16_t x, int16_t w,
                             const char* unit_str, const char* name_str,
                             const lv_font_t* vfont = &lv_font_montserrat_48,
                             int16_t tile_h = CONT_H) {
    int16_t val_h = 54, sub_h = 20;
    int16_t top   = (tile_h - val_h - 6 - sub_h) / 2;
    lv_obj_t* val = clabel(parent, x, CONT_Y + top, w, val_h, vfont, COL_MUTED, "---");
    char combo[32]; snprintf(combo, sizeof(combo), "%s  %s", unit_str, name_str);
    clabel(parent, x, CONT_Y + top + val_h + 6, w, sub_h,
           &lv_font_montserrat_16, COL_LABEL, combo);
    return val;
}

// ── Dual-value tile (PORT / STBD stacked, P/S labels handled externally) ──────
struct DualTile { lv_obj_t* p; lv_obj_t* s; };

static DualTile make_dual_tile(lv_obj_t* parent, int16_t x, int16_t w,
                                const char* unit_str) {
    lv_obj_t* pv = clabel(parent, x, DT_PORT_Y, w, 44,
                            &lv_font_montserrat_40, COL_MUTED, "---");
    lv_obj_t* sv = clabel(parent, x, DT_STBD_Y, w, 44,
                            &lv_font_montserrat_40, COL_MUTED, "---");
    clabel(parent, x, DT_UNIT_Y, w, 18,
           &lv_font_montserrat_16, COL_LABEL, unit_str);
    return {pv, sv};
}

// ── Dividers ──────────────────────────────────────────────────────────────────
static void add_divider(lv_obj_t* parent, int16_t x, int16_t y, int16_t h) {
    lv_obj_t* d = lv_obj_create(parent);
    lv_obj_set_pos(d, x, y);  lv_obj_set_size(d, 1, h);
    lv_obj_set_style_bg_color(d, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(d, 0, 0);
    lv_obj_clear_flag(d, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
}
static void full_div(lv_obj_t* p, int16_t x) {
    add_divider(p, x, CONT_Y + 10, CONT_H - 20);
}

// ── dashboard_create() ────────────────────────────────────────────────────────
lv_obj_t* dashboard_create() {
    lv_obj_t* scr = lv_obj_create(nullptr);
    lv_obj_set_size(scr, SCR_W, 480);
    lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── NAV  3 × 160px ───────────────────────────────────────────────────────
    // nullptr tap_cb: touch handlers are registered from main.cpp via dashboard_get_sections()
    lv_obj_t* nav_sec = make_section(scr, SEC_NAV_Y, COL_NAV, "NAV",
                                     nullptr, &nav_dot, &nav_status);
    s_nav_sec = nav_sec;
    nav_sog = make_tile(nav_sec, 0,   160, "kt",        "SOG");
    nav_hdg = make_tile(nav_sec, 160, 160, "\xc2\xb0M", "HDG");
    nav_dep = make_tile(nav_sec, 320, 160, "ft",        "DEPTH");
    full_div(nav_sec, 160);
    full_div(nav_sec, 320);

    // ── ENGINE  P/S labels + 3 × 150px dual tiles ────────────────────────────
    lv_obj_t* eng_sec = make_section(scr, SEC_ENG_Y, COL_ENG, "ENGINES",
                                     nullptr, &eng_dot, &eng_status);
    s_eng_sec = eng_sec;

    // "P" and "S" row labels on the far left, vertically aligned with value rows
    clabel(eng_sec, 0, DT_PORT_CY - 11, ENG_PS_W, 22,
           &lv_font_montserrat_20, COL_LABEL, "P");
    clabel(eng_sec, 0, DT_STBD_CY - 11, ENG_PS_W, 22,
           &lv_font_montserrat_20, COL_LABEL, "S");

    { DualTile t = make_dual_tile(eng_sec, ENG_PS_W,               ENG_TILE_W, "RPM");
      eng_rpm_p = t.p; eng_rpm_s = t.s; }
    { DualTile t = make_dual_tile(eng_sec, ENG_PS_W + ENG_TILE_W,   ENG_TILE_W, "psi  OIL");
      eng_oil_p = t.p; eng_oil_s = t.s; }
    { DualTile t = make_dual_tile(eng_sec, ENG_PS_W + 2*ENG_TILE_W, ENG_TILE_W,
                                   "\xc2\xb0" "F  COOLANT");
      eng_tmp_p = t.p; eng_tmp_s = t.s; }

    full_div(eng_sec, ENG_PS_W + ENG_TILE_W);
    full_div(eng_sec, ENG_PS_W + 2*ENG_TILE_W);

    // ── ELECTRICAL  3 × 160px (full height, state in header) ─────────────────
    lv_obj_t* elec_sec = make_section(scr, SEC_ELC_Y, COL_ELEC, "ELECTRICAL",
                                      nullptr, &elec_dot, &elec_status);
    s_elec_sec = elec_sec;
    elec_soc = make_tile(elec_sec, 0,   160, "%",  "SOC");
    elec_dca = make_tile(elec_sec, 160, 160, "A",  "DC AMPS");
    elec_acw = make_tile(elec_sec, 320, 160, "W",  "AC LOAD");
    full_div(elec_sec, 160);
    full_div(elec_sec, 320);

    return scr;
}

// ── dashboard_get_sections() ──────────────────────────────────────────────────
void dashboard_get_sections(lv_obj_t** nav, lv_obj_t** eng, lv_obj_t** elec) {
    *nav  = s_nav_sec;
    *eng  = s_eng_sec;
    *elec = s_elec_sec;
}

// ── dashboard_refresh() ───────────────────────────────────────────────────────
void dashboard_refresh() {
    static uint32_t prev_nav_ms = 0, prev_eng_ms = 0, prev_elec_ms = 0;
    static bool     prev_nav_st = false, prev_eng_st = false, prev_elec_st = false;
    static bool     prev_sk     = false;

    bool sk         = signalk_connected();
    bool sk_changed = (sk != prev_sk);
    prev_sk = sk;

    // ── NAV ──────────────────────────────────────────────────────────────────
    bool nav_stale = gNav.stale();
    if (gNav.updated_ms != prev_nav_ms || nav_stale != prev_nav_st || sk_changed) {
        prev_nav_ms = gNav.updated_ms;
        prev_nav_st = nav_stale;
        set_bg_color(nav_dot, (sk && !nav_stale) ? lv_color_hex(COL_GOOD)
                                                  : lv_color_hex(COL_MUTED));
        set_val(nav_sog, nav_stale, gNav.sog_kts,            "%.1f", lv_color_hex(COL_VALUE));
        set_val(nav_hdg, nav_stale, gNav.hdg_deg,            "%.0f", lv_color_hex(COL_VALUE));
        set_val(nav_dep, nav_stale, gNav.depth_m * 3.28084f, "%.1f", lv_color_hex(COL_VALUE));
        set_status(nav_status, nav_status_str());
    }

    // ── ENGINES ───────────────────────────────────────────────────────────────
    bool eng_stale = gEng.stale();
    if (gEng.updated_ms != prev_eng_ms || eng_stale != prev_eng_st || sk_changed) {
        prev_eng_ms = gEng.updated_ms;
        prev_eng_st = eng_stale;
        set_bg_color(eng_dot, (sk && !eng_stale) ? lv_color_hex(COL_GOOD)
                                                  : lv_color_hex(COL_MUTED));
        // Show oil and coolant only when the engine is actually running;
        // sensors give invalid readings with ignition off.
        bool port_on = !eng_stale && !isnan(gEng.port_rpm) && gEng.port_rpm > 100;
        bool stbd_on = !eng_stale && !isnan(gEng.stbd_rpm) && gEng.stbd_rpm > 100;

        set_val(eng_rpm_p, !port_on, gEng.port_rpm,    "%.0f", rpm_color(gEng.port_rpm));
        set_val(eng_rpm_s, !stbd_on, gEng.stbd_rpm,   "%.0f", rpm_color(gEng.stbd_rpm));
        set_val(eng_oil_p, !port_on, gEng.port_oil,    "%.0f", oil_color(gEng.port_oil, gEng.port_rpm));
        set_val(eng_oil_s, !stbd_on, gEng.stbd_oil,    "%.0f", oil_color(gEng.stbd_oil, gEng.stbd_rpm));
        set_val(eng_tmp_p, !port_on, gEng.port_temp_f, "%.0f", temp_color(gEng.port_temp_f, gEng.port_rpm));
        set_val(eng_tmp_s, !stbd_on, gEng.stbd_temp_f, "%.0f", temp_color(gEng.stbd_temp_f, gEng.stbd_rpm));
        set_status(eng_status, eng_status_str());
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    bool elec_stale = gElec.stale();
    if (gElec.updated_ms != prev_elec_ms || elec_stale != prev_elec_st || sk_changed) {
        prev_elec_ms = gElec.updated_ms;
        prev_elec_st = elec_stale;
        set_bg_color(elec_dot, (sk && !elec_stale) ? lv_color_hex(COL_GOOD)
                                                    : lv_color_hex(COL_MUTED));

        set_val(elec_soc, elec_stale, gElec.soc_pct, "%.0f", soc_color(gElec.soc_pct));

        // DC amps: Victron reports positive = discharging, negative = charging.
        // Negate for display so + means charging (adding to battery) = green.
        if (!elec_stale && !isnan(gElec.amps)) {
            float disp_a = -gElec.amps;   // flip: + = charging, - = discharging
            char buf[12]; snprintf(buf, sizeof(buf), "%+.1f", disp_a);
            if (strcmp(lv_label_get_text(elec_dca), buf) != 0) lv_label_set_text(elec_dca, buf);
            set_text_color(elec_dca, disp_a > 0 ? lv_color_hex(COL_GOOD)
                                                 : lv_color_hex(COL_VALUE));
        } else {
            if (strcmp(lv_label_get_text(elec_dca), "---") != 0) lv_label_set_text(elec_dca, "---");
            set_text_color(elec_dca, lv_color_hex(COL_MUTED));
        }

        set_val(elec_acw, elec_stale, gElec.inv_load_w, "%.0f", lv_color_hex(COL_VALUE));

        set_status(elec_status, elec_status_str());
    }
}
