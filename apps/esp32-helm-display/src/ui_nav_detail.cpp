#include "ui_nav_detail.h"
#include "vessel_data.h"
#include "ui_theme.h"
#include "geo.h"
#include "alarm.h"
#include "signalk_client.h"
#include <Arduino.h>
#include <math.h>

// ── Layout constants ──────────────────────────────────────────────────────────
#define HDR_H        40
#define SCR_W        480
#define SCR_H        480
#define AW_FOOTER_H  80    // anchor watch footer bar height
#define AW_CHART_H   (SCR_H - AW_FOOTER_H)   // 400 px
#define AW_ANCHOR_R  120   // anchor circle screen radius (px) → 50% of 480/2

// ── Mode containers ───────────────────────────────────────────────────────────
static lv_obj_t *s_scr_ref;   // cached screen ref for mode switch
static lv_obj_t *s_ff_cont;   // fish-finder mode container
static lv_obj_t *s_aw_cont;   // anchor watch mode container

// ── Fish-finder statics ───────────────────────────────────────────────────────
static lv_obj_t *s_depth, *s_sog, *s_hdg, *s_cog;
static lv_obj_t *s_fishfinder;
static lv_obj_t  *s_ff_alarm_lbl     = nullptr;  // depth alarm status right of "DEPTH HISTORY"
static lv_obj_t  *s_tide_gauge       = nullptr;  // arc gauge in right half of depth area
static lv_obj_t  *s_ff_depth_banner  = nullptr;  // full-width alarm banner over fishfinder
static lv_obj_t  *s_ff_banner_lbl    = nullptr;  // label inside the alarm banner
static lv_obj_t  *s_ff_adj_panel     = nullptr;  // tap-to-show depth alarm overlay
static lv_obj_t  *s_ff_warn_lbl    = nullptr;  // "10 ft" inside panel
static lv_obj_t  *s_ff_alert_lbl   = nullptr;  // "5 ft" inside panel
static lv_timer_t*s_ff_adj_timer   = nullptr;
static float     s_ff_depths[HISTORY_LEN];
static uint16_t  s_ff_count  = 0;
static float     s_ff_cur_ft = 0.0f;

// ── Anchor-watch statics ──────────────────────────────────────────────────────
static lv_obj_t *s_anchor_watch;

// Top info bar — DEPTH, HDG, DIST inline right of BACK
static lv_obj_t *s_aw_depth_lbl;
static lv_obj_t *s_aw_live_hdg_lbl;
static lv_obj_t *s_aw_dist_cap;
static lv_obj_t *s_aw_dist_lbl;

// Footer buttons — one at a time, full-width
static lv_obj_t *s_aw_set_btn;       // "SET ANCHOR" — shown when no anchor active
static lv_obj_t *s_aw_release_btn;   // "RELEASE" (blue) or "! DRAGGING - RELEASE" (orange)

// On-chart adjustment overlay (tap chart to show; auto-hides after 3 s)
// Before anchoring: shows CHAIN + BUFFER (pre-set config).
// After anchoring:  shows RADIUS + BUFFER (live adjustment).
static lv_obj_t  *s_aw_adj_panel  = nullptr;
static lv_obj_t  *s_aw_radius_cap = nullptr;   // "CHAIN" or "RADIUS" label
static lv_obj_t  *s_aw_radius_lbl = nullptr;
static lv_obj_t  *s_aw_buf_lbl    = nullptr;
static lv_timer_t *s_aw_adj_timer = nullptr;

// Mode-switch button in the AW top bar (hidden when anchor is active)
static lv_obj_t  *s_aw_ff_btn     = nullptr;

// Pre-anchor configuration (shown in overlay before SET ANCHOR is pressed)
static float s_edit_chain_ft = 100.0f;   // default chain length (ft)

// Deadband timer: millis() when boat first crossed outside alarm zone.
// 0 = currently inside zone.  Alarm fires after ALARM_DEADBAND_MS continuous.
static uint32_t s_alarm_pending_ms  = 0;
static const uint32_t ALARM_DEADBAND_MS = 8000;   // 8 s continuously outside → alarm

// ── Anchor watch mode state ───────────────────────────────────────────────────
static bool  s_anchor_mode        = false;
static bool  s_anchor_mode_manual = false;

static lv_event_cb_t s_back_cb_stored = nullptr;

// ══════════════════════════════════════════════════════════════════════════════
// FISH-FINDER DRAW CALLBACK
// ══════════════════════════════════════════════════════════════════════════════
static void fishfinder_draw_cb(lv_event_t* e) {
    lv_obj_t*      obj      = lv_event_get_target(e);
    lv_draw_ctx_t* draw_ctx = lv_event_get_draw_ctx(e);

    lv_area_t a;
    lv_obj_get_coords(obj, &a);
    lv_coord_t w = lv_area_get_width(&a);
    lv_coord_t h = lv_area_get_height(&a);

    const lv_coord_t SKY_H   = 36;   // slightly taller sky to keep mast tip in view
    const lv_coord_t wl_y    = a.y1 + SKY_H;
    const lv_coord_t depth_h = h - SKY_H;

    lv_draw_rect_dsc_t rdsc;
    lv_draw_rect_dsc_init(&rdsc);
    rdsc.border_width = 0; rdsc.radius = 0; rdsc.bg_opa = LV_OPA_COVER;

    rdsc.bg_color = lv_color_make(0xB8, 0xD0, 0xE8);
    lv_area_t sky_a = { a.x1, a.y1, a.x2, wl_y };
    lv_draw_rect(draw_ctx, &rdsc, &sky_a);

    rdsc.bg_color = lv_color_make(0x2E, 0x86, 0xC8);
    lv_area_t water_a = { a.x1, wl_y, a.x2, a.y2 };
    lv_draw_rect(draw_ctx, &rdsc, &water_a);

    if (w <= 0 || depth_h <= 0 || s_ff_count == 0) return;

    float max_d = 5.0f;
    for (uint16_t i = 0; i < s_ff_count; i++)
        if (s_ff_depths[i] > max_d) max_d = s_ff_depths[i];
    if (s_ff_cur_ft > max_d) max_d = s_ff_cur_ft;
    max_d *= 1.25f;

    lv_coord_t hist_w = w * 9 / 10;
    lv_coord_t boat_x = a.x1 + (lv_coord_t)((int32_t)s_ff_count * hist_w / HISTORY_LEN);
    lv_coord_t col_w  = hist_w / HISTORY_LEN;
    if (col_w < 1) col_w = 1;

    {
        lv_draw_rect_dsc_t bot, echo;
        lv_draw_rect_dsc_init(&bot);
        bot.border_width = 0; bot.radius = 0; bot.bg_opa = LV_OPA_COVER;
        bot.bg_color = lv_color_make(0x7A, 0x5C, 0x3A);
        lv_draw_rect_dsc_init(&echo);
        echo.border_width = 0; echo.radius = 0; echo.bg_opa = LV_OPA_COVER;
        echo.bg_color = lv_color_make(0xC8, 0xA8, 0x68);

        for (uint16_t i = 0; i < s_ff_count; i++) {
            lv_coord_t dep_px = (lv_coord_t)((double)s_ff_depths[i] / max_d * depth_h);
            if (dep_px < 2)       dep_px = 2;
            if (dep_px > depth_h) dep_px = depth_h;
            lv_coord_t col_x = a.x1 + (lv_coord_t)((int32_t)i * hist_w / HISTORY_LEN);
            lv_area_t ba = { col_x, (lv_coord_t)(wl_y + dep_px), (lv_coord_t)(col_x + col_w), a.y2 };
            lv_draw_rect(draw_ctx, &bot, &ba);
            lv_area_t ea = { col_x, (lv_coord_t)(wl_y + dep_px),
                             (lv_coord_t)(col_x + col_w), (lv_coord_t)(wl_y + dep_px + 3) };
            lv_draw_rect(draw_ctx, &echo, &ea);
        }
    }

    {
        lv_coord_t beam_px = (lv_coord_t)((double)s_ff_cur_ft / max_d * depth_h);
        if (beam_px < 4)       beam_px = 4;
        if (beam_px > depth_h) beam_px = depth_h;

        lv_draw_line_dsc_t ld;
        lv_draw_line_dsc_init(&ld);
        ld.color = lv_color_make(0xFF, 0xFF, 0xAA);
        ld.width = 2; ld.opa = LV_OPA_70;
        lv_point_t p1 = { boat_x, wl_y };
        lv_point_t p2 = { boat_x, (lv_coord_t)(wl_y + beam_px) };
        lv_draw_line(draw_ctx, &ld, &p1, &p2);
    }

    {
        lv_coord_t bx = boat_x;
        lv_coord_t by = wl_y - 8;  // raise so waterline bisects the hull

        lv_draw_rect_dsc_t br;
        lv_draw_rect_dsc_init(&br);
        br.border_width = 0; br.bg_opa = LV_OPA_COVER;

        lv_point_t hull_pts[] = {
            { (lv_coord_t)(bx - 22), (lv_coord_t)(by +  0) },
            { (lv_coord_t)(bx - 22), (lv_coord_t)(by + 12) },
            { (lv_coord_t)(bx -  4), (lv_coord_t)(by + 16) },
            { (lv_coord_t)(bx + 14), (lv_coord_t)(by + 11) },
            { (lv_coord_t)(bx + 22), (lv_coord_t)(by +  4) },
            { (lv_coord_t)(bx + 18), (lv_coord_t)(by +  0) },
        };
        br.bg_color = lv_color_make(0xBB, 0xBB, 0xBB);
        lv_draw_polygon(draw_ctx, &br, hull_pts, 6);

        br.bg_color = lv_color_make(0xF0, 0xF0, 0xF0);
        br.radius = 2;
        lv_area_t cab = { (lv_coord_t)(bx - 16), (lv_coord_t)(by - 13),
                          (lv_coord_t)(bx +  4), (lv_coord_t)(by +  0) };
        lv_draw_rect(draw_ctx, &br, &cab);

        br.bg_color = lv_color_make(0xDD, 0xDD, 0xDD);
        br.radius = 1;
        lv_area_t bridge = { (lv_coord_t)(bx - 12), (lv_coord_t)(by - 20),
                             (lv_coord_t)(bx +  0), (lv_coord_t)(by - 13) };
        lv_draw_rect(draw_ctx, &br, &bridge);

        lv_draw_line_dsc_t mast;
        lv_draw_line_dsc_init(&mast);
        mast.color = lv_color_make(0x99, 0x99, 0x99);
        mast.width = 1; mast.opa = LV_OPA_COVER;
        lv_point_t m1 = { (lv_coord_t)(bx - 6), (lv_coord_t)(by - 20) };
        lv_point_t m2 = { (lv_coord_t)(bx - 6), (lv_coord_t)(by - 26) };
        lv_draw_line(draw_ctx, &mast, &m1, &m2);

        br.bg_color = lv_color_make(0x1A, 0x5A, 0x90);
        br.bg_opa = LV_OPA_60; br.radius = 0;
        lv_area_t wls = { (lv_coord_t)(bx - 22), (lv_coord_t)(by + 12),
                          (lv_coord_t)(bx + 22), (lv_coord_t)(by + 14) };
        lv_draw_rect(draw_ctx, &br, &wls);
    }

    // ── Depth alarm lines ─────────────────────────────────────────────────────
    // Yellow dashed line at WARN threshold; red dashed line at ALERT threshold.
    auto draw_alarm_line = [&](float thresh_ft, lv_color_t col_normal, lv_color_t col_active) {
        if (thresh_ft <= 0.0f) return;
        float frac = thresh_ft / max_d;
        if (frac > 1.0f) return;
        lv_coord_t ly = (lv_coord_t)(wl_y + frac * depth_h);
        lv_draw_line_dsc_t ld;
        lv_draw_line_dsc_init(&ld);
        bool active = (!isnan(s_ff_cur_ft) && s_ff_cur_ft < thresh_ft);
        ld.color = active ? col_active : col_normal;
        ld.width = 2; ld.opa = LV_OPA_90;
        for (lv_coord_t sx = a.x1; sx < a.x2; sx += 12) {
            lv_point_t lp1 = { sx,                                     ly };
            lv_point_t lp2 = { (lv_coord_t)LV_MIN(sx + 8, a.x2), ly };
            lv_draw_line(draw_ctx, &ld, &lp1, &lp2);
        }
    };
    // WARN line: yellow → bright yellow when active
    draw_alarm_line(g_depth_warn_ft,
                    lv_color_make(0xC8, 0xA0, 0x00),
                    lv_color_make(0xFF, 0xE0, 0x00));
    // ALERT line: orange-red → bright red when active
    draw_alarm_line(g_depth_alert_ft,
                    lv_color_make(0xCC, 0x40, 0x00),
                    lv_color_make(0xFF, 0x20, 0x20));
}

// ══════════════════════════════════════════════════════════════════════════════
// TIDE GAUGE DRAW CALLBACK
// Right half of the depth area (x=244, y=48, w=232, h=84).
// Draws a semicircular arc from LOW (left) to HIGH (right).
// A white dot marks the current height. Arc is blue when rising, amber when
// falling. Current height in feet is shown in the centre; next event below.
// ══════════════════════════════════════════════════════════════════════════════
// Tide badge styled to match the depth display: label on top, then a large
// coloured arrow beside the value, both centred in the right panel.
// Blue = rising, red = falling.  Uses theme colours so it reads on the light bg.
static void tide_gauge_draw_cb(lv_event_t* e) {
    lv_obj_t*      obj      = lv_event_get_target(e);
    lv_draw_ctx_t* draw_ctx = lv_event_get_draw_ctx(e);
    lv_area_t a;
    lv_obj_get_coords(obj, &a);
    lv_coord_t w = lv_area_get_width(&a);
    lv_coord_t h = lv_area_get_height(&a);

    bool valid  = gTides.valid();
    bool rising = valid && gTides.rising;

    lv_color_t accent = rising ? lv_color_make(0x10, 0x70, 0xE0)   // blue
                               : lv_color_make(0xCC, 0x18, 0x18);  // red

    // ── "TIDE  |  ft" caption — same style as "DEPTH  |  ft" ─────────────────
    {
        lv_draw_label_dsc_t ld;
        lv_draw_label_dsc_init(&ld);
        ld.color = lv_color_hex(COL_LABEL);
        ld.font  = &lv_font_montserrat_14;
        ld.align = LV_TEXT_ALIGN_CENTER;
        lv_area_t la = { a.x1, a.y1, a.x2, (lv_coord_t)(a.y1 + 20) };
        lv_draw_label(draw_ctx, &ld, &la, "TIDE  |  ft", nullptr);
    }

    // ── No data ───────────────────────────────────────────────────────────────
    if (!valid) {
        lv_draw_label_dsc_t ld;
        lv_draw_label_dsc_init(&ld);
        ld.color = lv_color_hex(COL_MUTED);
        ld.font  = &lv_font_montserrat_28;
        ld.align = LV_TEXT_ALIGN_CENTER;
        lv_area_t la = { a.x1, (lv_coord_t)(a.y1 + 22), a.x2, (lv_coord_t)(a.y1 + 60) };
        lv_draw_label(draw_ctx, &ld, &la, "---", nullptr);
        return;
    }

    // ── Arrow + value block, centred together in the middle zone ──────────────
    // Block composition: arrow (28px wide) + 8px gap + ~100px text = ~136px total.
    // Centre the block horizontally within the panel.
    const lv_coord_t ARROW_W  = 28;   // 2 × half-width
    const lv_coord_t ARROW_H  = 24;   // triangle height
    const lv_coord_t GAP      = 8;
    const lv_coord_t TEXT_W   = 120;
    const lv_coord_t BLOCK_W  = ARROW_W + GAP + TEXT_W;
    const lv_coord_t MID_Y    = a.y1 + 22 + (h - 22 - 18) / 2;  // vert centre of middle zone

    lv_coord_t block_x = a.x1 + (w - BLOCK_W) / 2;   // left edge of block
    lv_coord_t arr_cx  = block_x + ARROW_W / 2;
    lv_coord_t arr_cy  = MID_Y;

    // Filled triangle
    lv_draw_rect_dsc_t adsc;
    lv_draw_rect_dsc_init(&adsc);
    adsc.bg_color     = accent;
    adsc.bg_opa       = LV_OPA_COVER;
    adsc.border_width = 0;

    lv_point_t pts[3];
    lv_coord_t hw = ARROW_W / 2;
    lv_coord_t hh = ARROW_H / 2;
    if (rising) {
        pts[0] = { arr_cx,               (lv_coord_t)(arr_cy - hh) };  // tip top
        pts[1] = { (lv_coord_t)(arr_cx - hw), (lv_coord_t)(arr_cy + hh) };
        pts[2] = { (lv_coord_t)(arr_cx + hw), (lv_coord_t)(arr_cy + hh) };
    } else {
        pts[0] = { arr_cx,               (lv_coord_t)(arr_cy + hh) };  // tip bottom
        pts[1] = { (lv_coord_t)(arr_cx - hw), (lv_coord_t)(arr_cy - hh) };
        pts[2] = { (lv_coord_t)(arr_cx + hw), (lv_coord_t)(arr_cy - hh) };
    }
    lv_draw_polygon(draw_ctx, &adsc, pts, 3);

    // Height value — near-black (COL_VALUE), same font size as depth
    char hbuf[12];
    snprintf(hbuf, sizeof(hbuf), "%.1f", gTides.height_ft());
    lv_draw_label_dsc_t hl;
    lv_draw_label_dsc_init(&hl);
    hl.font  = &lv_font_montserrat_44;
    hl.color = lv_color_hex(COL_VALUE);
    hl.align = LV_TEXT_ALIGN_LEFT;
    lv_coord_t text_x = block_x + ARROW_W + GAP;
    lv_area_t hla = { text_x, (lv_coord_t)(MID_Y - 28),
                      (lv_coord_t)(text_x + TEXT_W), (lv_coord_t)(MID_Y + 28) };
    lv_draw_label(draw_ctx, &hl, &hla, hbuf, nullptr);

    // ── Next tidal event (bottom row) ─────────────────────────────────────────
    char nbuf[20];
    snprintf(nbuf, sizeof(nbuf), "%s %.1fft %s",
             rising ? "HI" : "LO",
             rising ? gTides.next_high_ft() : gTides.next_low_ft(),
             rising ? gTides.next_high_time : gTides.next_low_time);
    lv_draw_label_dsc_t nl;
    lv_draw_label_dsc_init(&nl);
    nl.font  = &lv_font_montserrat_12;
    nl.color = lv_color_hex(COL_LABEL);
    nl.align = LV_TEXT_ALIGN_CENTER;
    lv_area_t nla = { a.x1, (lv_coord_t)(a.y2 - 17), a.x2, a.y2 };
    lv_draw_label(draw_ctx, &nl, &nla, nbuf, nullptr);
}

// ══════════════════════════════════════════════════════════════════════════════
// ANCHOR WATCH DRAW CALLBACK
// Chart area: 480 × AW_CHART_H (400 px). Centre = (240, 200).
// Scale is fixed so the anchor circle always fills 50% of screen width.
// ══════════════════════════════════════════════════════════════════════════════
static void anchor_watch_draw_cb(lv_event_t* e) {
    lv_obj_t*      obj      = lv_event_get_target(e);
    lv_draw_ctx_t* draw_ctx = lv_event_get_draw_ctx(e);

    lv_area_t a;
    lv_obj_get_coords(obj, &a);
    lv_coord_t w  = lv_area_get_width(&a);
    lv_coord_t h  = lv_area_get_height(&a);
    lv_coord_t cx = a.x1 + w / 2;
    lv_coord_t cy = a.y1 + h / 2;  // centre of 480×400 chart = (240, 200)

    // ── Navy background ───────────────────────────────────────────────────────
    lv_draw_rect_dsc_t rdsc;
    lv_draw_rect_dsc_init(&rdsc);
    rdsc.bg_color = lv_color_make(0x06, 0x14, 0x30);
    rdsc.bg_opa = LV_OPA_COVER; rdsc.border_width = 0; rdsc.radius = 0;
    lv_draw_rect(draw_ctx, &rdsc, &a);

    // ── North indicator — right edge of chart, below top bar ─────────────────
    {
        lv_coord_t nx = (lv_coord_t)(a.x2 - 16);
        lv_coord_t ny = (lv_coord_t)(a.y1 + 62);
        lv_point_t tri[] = {
            { nx,           ny      },
            { (lv_coord_t)(nx - 5), (lv_coord_t)(ny + 10) },
            { (lv_coord_t)(nx + 5), (lv_coord_t)(ny + 10) },
        };
        rdsc.bg_color = lv_color_make(0xFF, 0xFF, 0xFF);
        rdsc.bg_opa = LV_OPA_60; rdsc.radius = 0;
        lv_draw_polygon(draw_ctx, &rdsc, tri, 3);

        lv_draw_label_dsc_t ldsc;
        lv_draw_label_dsc_init(&ldsc);
        ldsc.font  = &lv_font_montserrat_12;
        ldsc.color = lv_color_make(0xFF, 0xFF, 0xFF);
        ldsc.opa   = LV_OPA_60;
        lv_area_t la = { (lv_coord_t)(nx - 5), (lv_coord_t)(ny + 12),
                         (lv_coord_t)(nx + 8),  (lv_coord_t)(ny + 26) };
        lv_draw_label(draw_ctx, &ldsc, &la, "N", nullptr);
    }

    bool has_pos   = !isnan(gNav.lat) && !isnan(gNav.lon) && !gNav.stale();
    bool has_track = gAnchor.track.count > 0;

    if (!has_pos && !has_track && !gAnchor.active) {
        lv_draw_label_dsc_t ldsc;
        lv_draw_label_dsc_init(&ldsc);
        ldsc.font  = &lv_font_montserrat_16;
        ldsc.color = lv_color_make(0x44, 0x88, 0xCC);
        ldsc.opa   = LV_OPA_COVER;
        lv_area_t la = { (lv_coord_t)(a.x1 + 80), (lv_coord_t)(cy - 12),
                         (lv_coord_t)(a.x2 - 80), (lv_coord_t)(cy + 12) };
        lv_draw_label(draw_ctx, &ldsc, &la, "Waiting for GPS...", nullptr);
        return;
    }

    // ── Scale and reference point ─────────────────────────────────────────────
    // When anchor active: anchor at centre, fixed scale so anchor circle = 120 px radius.
    // Scale auto-expands if boat drifts far beyond alarm radius.
    // Without anchor: auto-scale on track extent with first track point at centre.
    double ref_lat, ref_lon;
    float  scale_px_m;

    if (gAnchor.active) {
        ref_lat = gAnchor.anchor_lat;
        ref_lon = gAnchor.anchor_lon;

        float alarm_r_m = gAnchor.radius_m * (1.0f + gAnchor.alarm_buffer_pct / 100.0f);
        float show_r_m  = alarm_r_m * 1.3f;  // leave 30% margin around alarm circle

        // Expand to show boat if it has drifted well outside the alarm circle
        if (!isnan(gAnchor.dist_m) && gAnchor.dist_m > show_r_m)
            show_r_m = gAnchor.dist_m * 1.15f;

        scale_px_m = (float)AW_ANCHOR_R / gAnchor.radius_m;  // anchor circle = 120 px
        // Clamp scale if show_r_m requires more room than (screen_half / show_r_m)
        float max_scale = (float)(w < h ? w : h) * 0.48f / show_r_m;
        if (scale_px_m > max_scale) scale_px_m = max_scale;

    } else {
        if (has_track) {
            PosPoint fp = gAnchor.track.get(0);
            ref_lat = fp.lat; ref_lon = fp.lon;
        } else {
            ref_lat = gNav.lat; ref_lon = gNav.lon;
        }
        float max_d = 10.0f;
        for (uint16_t i = 0; i < gAnchor.track.count; i++) {
            PosPoint p = gAnchor.track.get(i);
            float d = haversine_m(ref_lat, ref_lon, p.lat, p.lon);
            if (d > max_d) max_d = d;
        }
        if (has_pos) {
            float d = haversine_m(ref_lat, ref_lon, gNav.lat, gNav.lon);
            if (d > max_d) max_d = d;
        }
        scale_px_m = (float)(w < h ? w : h) * 0.40f / (max_d * 1.5f);
    }
    if (scale_px_m > 50.0f) scale_px_m = 50.0f;

    // Flat-earth local scale factors (accurate for anchor-watch distances)
    float cos_ref  = cosf((float)(ref_lat * (float)M_PI / 180.0f));
    float lon_to_m = 111320.0f * cos_ref;
    float lat_to_m = 111320.0f;

    // ── Anchor and alarm circles ──────────────────────────────────────────────
    if (gAnchor.active) {
        lv_draw_arc_dsc_t ad;
        lv_draw_arc_dsc_init(&ad);

        // Inner circle: the anchor radius the user set (blue-white)
        lv_coord_t anchor_r_px = (lv_coord_t)(gAnchor.radius_m * scale_px_m);
        ad.color = lv_color_make(0x60, 0xA0, 0xFF);
        ad.width = 2; ad.opa = LV_OPA_60;
        lv_point_t cpt = { cx, cy };
        lv_draw_arc(draw_ctx, &ad, &cpt, (uint16_t)anchor_r_px, 0, 360);

        // Anchor radius label (inside, at 3 o'clock position)
        if (anchor_r_px > 20) {
            char rbuf[12];
            snprintf(rbuf, sizeof(rbuf), "%d ft",
                     (int)roundf(gAnchor.radius_m * 3.28084f));
            lv_draw_label_dsc_t ldsc;
            lv_draw_label_dsc_init(&ldsc);
            ldsc.font  = &lv_font_montserrat_12;
            ldsc.color = lv_color_make(0x60, 0xA0, 0xFF);
            ldsc.opa   = LV_OPA_70;
            lv_area_t la = { (lv_coord_t)(cx + anchor_r_px - 60), (lv_coord_t)(cy - 8),
                             (lv_coord_t)(cx + anchor_r_px + 2),  (lv_coord_t)(cy + 8) };
            lv_draw_label(draw_ctx, &ldsc, &la, rbuf, nullptr);
        }

        // Outer circle: alarm radius (green OK / red dragging)
        float alarm_r_m  = gAnchor.radius_m * (1.0f + gAnchor.alarm_buffer_pct / 100.0f);
        lv_coord_t alarm_r_px = (lv_coord_t)(alarm_r_m * scale_px_m);
        ad.color = gAnchor.alarm ? lv_color_make(0xFF, 0x30, 0x10)
                                  : lv_color_make(0x20, 0xCC, 0x60);
        ad.width = 3; ad.opa = LV_OPA_80;
        lv_draw_arc(draw_ctx, &ad, &cpt, (uint16_t)alarm_r_px, 0, 360);

        // Alarm radius label (outside the circle)
        if (alarm_r_px > 20) {
            char rbuf[14];
            snprintf(rbuf, sizeof(rbuf), "%d ft",
                     (int)roundf(alarm_r_m * 3.28084f));
            lv_draw_label_dsc_t ldsc;
            lv_draw_label_dsc_init(&ldsc);
            ldsc.font  = &lv_font_montserrat_12;
            ldsc.color = gAnchor.alarm ? lv_color_make(0xFF, 0x60, 0x40)
                                        : lv_color_make(0x40, 0xDD, 0x80);
            ldsc.opa = LV_OPA_80;
            lv_area_t la = { (lv_coord_t)(cx + alarm_r_px + 3), (lv_coord_t)(cy - 8),
                             (lv_coord_t)(cx + alarm_r_px + 56), (lv_coord_t)(cy + 8) };
            lv_draw_label(draw_ctx, &ldsc, &la, rbuf, nullptr);
        }

        // Cross-hair at anchor centre
        lv_draw_line_dsc_t ld;
        lv_draw_line_dsc_init(&ld);
        ld.color = lv_color_make(0x50, 0x50, 0x50);
        ld.width = 1; ld.opa = LV_OPA_50;
        lv_point_t ch1 = { (lv_coord_t)(cx - 14), cy };
        lv_point_t ch2 = { (lv_coord_t)(cx + 14), cy };
        lv_draw_line(draw_ctx, &ld, &ch1, &ch2);
        ch1 = { cx, (lv_coord_t)(cy - 14) };
        ch2 = { cx, (lv_coord_t)(cy + 14) };
        lv_draw_line(draw_ctx, &ld, &ch1, &ch2);
    }

    // ── Drift track ───────────────────────────────────────────────────────────
    if (has_track) {
        rdsc.radius = LV_RADIUS_CIRCLE;
        rdsc.border_width = 0;
        uint16_t n = gAnchor.track.count;
        for (uint16_t i = 0; i < n; i++) {
            PosPoint p = gAnchor.track.get(i);
            float dx_m = (float)((p.lon - ref_lon) * lon_to_m);
            float dy_m = (float)((p.lat - ref_lat) * lat_to_m);
            lv_coord_t px = cx + (lv_coord_t)(dx_m * scale_px_m);
            lv_coord_t py = cy - (lv_coord_t)(dy_m * scale_px_m);
            if (px < a.x1 - 4 || px > a.x2 + 4 || py < a.y1 - 4 || py > a.y2 + 4) continue;

            uint8_t br = (uint8_t)(40 + 200 * i / (n > 1 ? n - 1 : 1));
            rdsc.bg_color = lv_color_make(br, br, br);
            rdsc.bg_opa   = LV_OPA_90;
            lv_area_t dot = { (lv_coord_t)(px - 2), (lv_coord_t)(py - 2),
                              (lv_coord_t)(px + 2), (lv_coord_t)(py + 2) };
            lv_draw_rect(draw_ctx, &rdsc, &dot);
        }
    }

    // ── Anchor symbol (gold, at chart centre) ─────────────────────────────────
    if (gAnchor.active) {
        lv_draw_line_dsc_t ld;
        lv_draw_line_dsc_init(&ld);
        ld.color = lv_color_make(0xFF, 0xCC, 0x44);
        ld.opa   = LV_OPA_COVER;

        ld.width = 3;
        lv_point_t p1 = { cx, (lv_coord_t)(cy - 10) };
        lv_point_t p2 = { cx, (lv_coord_t)(cy + 14) };
        lv_draw_line(draw_ctx, &ld, &p1, &p2);

        p1 = { (lv_coord_t)(cx - 11), (lv_coord_t)(cy - 6) };
        p2 = { (lv_coord_t)(cx + 11), (lv_coord_t)(cy - 6) };
        lv_draw_line(draw_ctx, &ld, &p1, &p2);

        ld.width = 2;
        p1 = { cx, (lv_coord_t)(cy + 14) };
        p2 = { (lv_coord_t)(cx - 10), (lv_coord_t)(cy + 5) };
        lv_draw_line(draw_ctx, &ld, &p1, &p2);

        p1 = { cx, (lv_coord_t)(cy + 14) };
        p2 = { (lv_coord_t)(cx + 10), (lv_coord_t)(cy + 5) };
        lv_draw_line(draw_ctx, &ld, &p1, &p2);

        lv_draw_arc_dsc_t ad;
        lv_draw_arc_dsc_init(&ad);
        ad.color = lv_color_make(0xFF, 0xCC, 0x44);
        ad.width = 2; ad.opa = LV_OPA_COVER;
        lv_point_t cpt = { cx, (lv_coord_t)(cy - 14) };
        lv_draw_arc(draw_ctx, &ad, &cpt, 4, 0, 360);
    }

    // ── Boat (top-down, heading-rotated polygon) ──────────────────────────────
    if (has_pos) {
        float dx_m = (float)((gNav.lon - ref_lon) * lon_to_m);
        float dy_m = (float)((gNav.lat - ref_lat) * lat_to_m);
        lv_coord_t bx = cx + (lv_coord_t)(dx_m * scale_px_m);
        lv_coord_t by = cy - (lv_coord_t)(dy_m * scale_px_m);

        float hdg_deg = isnan(gNav.hdg_deg) ? 0.0f : gNav.hdg_deg;
        float rad = hdg_deg * (float)M_PI / 180.0f;
        float c = cosf(rad), s = sinf(rad);

        const float bp[5][2] = { {0,-13}, {8,-2}, {6,10}, {-6,10}, {-8,-2} };
        lv_point_t bp_rot[5];
        for (int i = 0; i < 5; i++) {
            bp_rot[i] = {
                (lv_coord_t)(bx + (lv_coord_t)(bp[i][0]*c - bp[i][1]*s)),
                (lv_coord_t)(by + (lv_coord_t)(bp[i][0]*s + bp[i][1]*c))
            };
        }
        rdsc.bg_color = lv_color_make(0xFF, 0xCC, 0x00);
        rdsc.bg_opa = LV_OPA_COVER; rdsc.radius = 0;
        lv_draw_polygon(draw_ctx, &rdsc, bp_rot, 5);

        lv_draw_line_dsc_t ld;
        lv_draw_line_dsc_init(&ld);
        ld.color = lv_color_make(0xFF, 0xFF, 0xFF);
        ld.width = 2; ld.opa = LV_OPA_80;
        lv_point_t pl1 = {
            (lv_coord_t)(bx + (lv_coord_t)( 0*c - (-13.0f)*s )),
            (lv_coord_t)(by + (lv_coord_t)( 0*s + (-13.0f)*c ))
        };
        lv_point_t pl2 = {
            (lv_coord_t)(bx + (lv_coord_t)( 0*c - (-22.0f)*s )),
            (lv_coord_t)(by + (lv_coord_t)( 0*s + (-22.0f)*c ))
        };
        lv_draw_line(draw_ctx, &ld, &pl1, &pl2);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// UI STATE HELPER
// ══════════════════════════════════════════════════════════════════════════════
static void aw_update_ui() {
    // Footer: one button visible at a time
    if (gAnchor.active) {
        lv_obj_add_flag  (s_aw_set_btn,     LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_aw_release_btn, LV_OBJ_FLAG_HIDDEN);
        // Orange + alarm label when dragging, blue + normal label when OK
        lv_obj_set_style_bg_color(s_aw_release_btn,
            gAnchor.alarm ? lv_color_make(0xC0, 0x50, 0x00)
                          : lv_color_make(0x18, 0x30, 0x60), 0);
        lv_obj_set_style_bg_color(s_aw_release_btn,
            gAnchor.alarm ? lv_color_make(0xD0, 0x70, 0x10)
                          : lv_color_make(0x28, 0x50, 0x90), LV_STATE_PRESSED);
        lv_obj_t* rlbl = lv_obj_get_child(s_aw_release_btn, 0);
        if (rlbl) lv_label_set_text(rlbl, gAnchor.alarm ? "! DRAGGING  -  RELEASE" : "RELEASE");
    } else {
        lv_obj_clear_flag(s_aw_set_btn,     LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag  (s_aw_release_btn, LV_OBJ_FLAG_HIDDEN);
    }

    // Overlay caption: "CHAIN" before set (configuring), "RADIUS" after (adjusting)
    if (s_aw_radius_cap)
        lv_label_set_text(s_aw_radius_cap, gAnchor.active ? "RADIUS" : "CHAIN");

    // Overlay values
    if (s_aw_radius_lbl && s_aw_buf_lbl) {
        char buf[20];
        float r = gAnchor.active ? gAnchor.radius_m : (s_edit_chain_ft * 0.3048f);
        snprintf(buf, sizeof(buf), "%d ft", (int)roundf(r * 3.28084f));
        lv_label_set_text(s_aw_radius_lbl, buf);
        snprintf(buf, sizeof(buf), "%.0f%%", gAnchor.alarm_buffer_pct);
        lv_label_set_text(s_aw_buf_lbl, buf);
    }

    // Mode-switch "FF" button: hide while anchor is active (don't let user
    // accidentally switch away while monitoring), show otherwise.
    if (s_aw_ff_btn) {
        if (gAnchor.active) lv_obj_add_flag  (s_aw_ff_btn, LV_OBJ_FLAG_HIDDEN);
        else                lv_obj_clear_flag(s_aw_ff_btn, LV_OBJ_FLAG_HIDDEN);
    }
}

// ── Adjustment overlay auto-hide timer callback ───────────────────────────────
static void aw_hide_adj(lv_timer_t*) {
    if (s_aw_adj_panel) lv_obj_add_flag(s_aw_adj_panel, LV_OBJ_FLAG_HIDDEN);
    s_aw_adj_timer = nullptr;
}

// Show/toggle the radius/buffer overlay.
// Called from both s_anchor_watch (chart tap) and s_aw_adj_panel (panel tap).
// Tapping the CHART when panel is visible dismisses it; tapping the PANEL resets the timer.
static void on_show_adj(lv_event_t* e) {
    if (!s_aw_adj_panel) return;
    bool visible = !lv_obj_has_flag(s_aw_adj_panel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_t* target = lv_event_get_current_target(e);

    if (target == s_anchor_watch) {
        // Chart tapped
        if (visible) {
            // Dismiss the overlay
            lv_obj_add_flag(s_aw_adj_panel, LV_OBJ_FLAG_HIDDEN);
            if (s_aw_adj_timer) { lv_timer_del(s_aw_adj_timer); s_aw_adj_timer = nullptr; }
            return;
        }
    }
    // Show or keep visible — sync labels to current gAnchor state, (re)start hide timer
    aw_update_ui();
    lv_obj_clear_flag(s_aw_adj_panel, LV_OBJ_FLAG_HIDDEN);
    if (s_aw_adj_timer) {
        lv_timer_reset(s_aw_adj_timer);
    } else {
        s_aw_adj_timer = lv_timer_create(aw_hide_adj, 3000, nullptr);
        lv_timer_set_repeat_count(s_aw_adj_timer, 1);
    }
}

// ── Anchor control button callbacks ──────────────────────────────────────────
// SET ANCHOR: compute anchor position (current GPS + heading + chain length)
// and activate monitoring.  No popup — chain/buffer are pre-configured via
// the on-chart overlay (tap chart to show it).
static void on_set_anchor(lv_event_t*) {
    if (isnan(gNav.lat) || isnan(gNav.lon)) return;   // need a valid GPS fix
    float chain_m = s_edit_chain_ft * 0.3048f;
    float hdg     = isnan(gNav.hdg_deg) ? 0.0f : gNav.hdg_deg;
    move_point(gNav.lat, gNav.lon, hdg, chain_m,
               gAnchor.anchor_lat, gAnchor.anchor_lon);
    gAnchor.radius_m   = chain_m;
    gAnchor.active     = true;
    gAnchor.alarm      = false;
    s_alarm_pending_ms = 0;
    gAnchor.track.clear();
    aw_update_ui();
    signalk_queue_save_anchor();   // publish to SignalK → syncs all devices
}

static void on_release(lv_event_t*) {
    gAnchor.active     = false;
    gAnchor.alarm      = false;
    s_alarm_pending_ms = 0;
    gAnchor.track.clear();
    aw_update_ui();
    signalk_queue_save_anchor();   // publish released state to SignalK
}
// ── Depth alarm threshold controls ───────────────────────────────────────────
static void update_ff_alarm_ui() {
    // Header status label
    if (s_ff_alarm_lbl) {
        if (g_depth_warn_ft <= 0.0f) {
            lv_label_set_text(s_ff_alarm_lbl, "DEPTH ALM: OFF");
        } else {
            char buf[40];
            snprintf(buf, sizeof(buf), "WARN %dft  ALRT %dft",
                     (int)g_depth_warn_ft, (int)g_depth_alert_ft);
            lv_label_set_text(s_ff_alarm_lbl, buf);
        }
    }
    // Overlay panel value labels
    if (s_ff_warn_lbl) {
        char buf[12];
        if (g_depth_warn_ft <= 0.0f) snprintf(buf, sizeof(buf), "OFF");
        else                          snprintf(buf, sizeof(buf), "%d ft", (int)g_depth_warn_ft);
        lv_label_set_text(s_ff_warn_lbl, buf);
    }
    if (s_ff_alert_lbl) {
        char buf[12];
        snprintf(buf, sizeof(buf), "%d ft", (int)g_depth_alert_ft);
        lv_label_set_text(s_ff_alert_lbl, buf);
    }
    if (s_fishfinder) lv_obj_invalidate(s_fishfinder);
}

// Depth alarm banner — shown across the top of the fishfinder when ALARM_DEPTH
// is active.  Amber = warning zone, red = alert zone.  Tap to silence the beeper.
// Automatically hidden when the alarm clears.
static void on_silence_depth(lv_event_t*) {
    g_depth_alarm_silenced = true;
    // Banner stays visible as a reminder — update_ff_depth_banner() will restyle it
}

static void update_ff_depth_banner() {
    if (!s_ff_depth_banner || !s_ff_banner_lbl) return;

    bool alarm_on = (alarm_current() == ALARM_DEPTH);
    if (!alarm_on) {
        lv_obj_add_flag(s_ff_depth_banner, LV_OBJ_FLAG_HIDDEN);
        return;
    }

    lv_obj_clear_flag(s_ff_depth_banner, LV_OBJ_FLAG_HIDDEN);

    // Determine severity: alert zone if depth < alert threshold
    float depth_ft = isnan(gNav.depth_m) ? 999.0f : gNav.depth_m * 3.28084f;
    bool  in_alert = (depth_ft <= g_depth_alert_ft);

    if (g_depth_alarm_silenced) {
        // Muted — grey banner, no action needed
        lv_obj_set_style_bg_color(s_ff_depth_banner, lv_color_make(0x50, 0x50, 0x58), 0);
        lv_label_set_text(s_ff_banner_lbl,
                          in_alert ? "DEPTH ALERT (silenced)" : "DEPTH WARNING (silenced)");
    } else if (in_alert) {
        lv_obj_set_style_bg_color(s_ff_depth_banner, lv_color_hex(COL_ALARM), 0);
        lv_label_set_text(s_ff_banner_lbl, "DEPTH ALERT  -  tap to silence");
    } else {
        lv_obj_set_style_bg_color(s_ff_depth_banner, lv_color_hex(COL_WARN), 0);
        lv_label_set_text(s_ff_banner_lbl, "DEPTH WARNING  -  tap to silence");
    }
}

static void ff_adj_timer_kick() {
    if (!s_ff_adj_timer) return;
    lv_timer_reset(s_ff_adj_timer);
    lv_timer_resume(s_ff_adj_timer);
}

// ── Mode switch helpers ───────────────────────────────────────────────────────
// These are forward-declared as callbacks; s_aw_cont is defined later in the
// file but both containers are file-scope statics so all callbacks can use them.
static void switch_to_anchor_watch(lv_event_t*) {
    s_anchor_mode        = true;
    s_anchor_mode_manual = true;
    lv_obj_add_flag  (s_ff_cont, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s_aw_cont, LV_OBJ_FLAG_HIDDEN);
    aw_update_ui();
}
static void switch_to_fishfinder(lv_event_t*) {
    s_anchor_mode        = false;
    s_anchor_mode_manual = true;
    lv_obj_clear_flag(s_ff_cont, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag  (s_aw_cont, LV_OBJ_FLAG_HIDDEN);
}

static void on_warn_minus(lv_event_t*) {
    float next = g_depth_warn_ft - 1.0f;
    if (next <= g_depth_alert_ft) next = 0.0f;   // decrement to off
    g_depth_warn_ft = fmaxf(0.0f, next);
    if (g_depth_warn_ft == 0.0f) g_depth_alert_ft = 0.0f;
    update_ff_alarm_ui();
    ff_adj_timer_kick();
}
static void on_warn_plus(lv_event_t*) {
    if (g_depth_warn_ft == 0.0f) {
        g_depth_warn_ft  = 10.0f;
        g_depth_alert_ft =  5.0f;
    } else {
        g_depth_warn_ft = fminf(200.0f, g_depth_warn_ft + 1.0f);
    }
    update_ff_alarm_ui();
    ff_adj_timer_kick();
}
static void on_alert_minus(lv_event_t*) {
    if (g_depth_warn_ft == 0.0f) return;
    g_depth_alert_ft = fmaxf(1.0f, g_depth_alert_ft - 1.0f);
    if (g_depth_alert_ft >= g_depth_warn_ft) g_depth_alert_ft = g_depth_warn_ft - 1.0f;
    update_ff_alarm_ui();
    ff_adj_timer_kick();
}
static void on_alert_plus(lv_event_t*) {
    if (g_depth_warn_ft == 0.0f) return;
    g_depth_alert_ft = fminf(g_depth_warn_ft - 1.0f, g_depth_alert_ft + 1.0f);
    update_ff_alarm_ui();
    ff_adj_timer_kick();
}

// Clear alarm latch + pending timer; call after user acknowledgement or when
// adjustments bring the boat back inside the alarm zone.
static void aw_clear_alarm() {
    gAnchor.alarm      = false;
    s_alarm_pending_ms = 0;
    aw_update_ui();
    signalk_queue_save_anchor();  // publish alarm=false to SignalK
}

// Re-evaluate alarm after a radius/buffer change: auto-clear if boat is now safe.
static void aw_maybe_clear_alarm_after_adjustment() {
    if (!gAnchor.alarm && s_alarm_pending_ms == 0) return;
    if (isnan(gAnchor.dist_m)) return;
    float new_alarm_r = gAnchor.radius_m * (1.0f + gAnchor.alarm_buffer_pct / 100.0f);
    if (gAnchor.dist_m <= new_alarm_r)
        aw_clear_alarm();
}

static void on_radius_minus(lv_event_t*) {
    if (gAnchor.active) {
        gAnchor.radius_m = fmaxf(5.0f, gAnchor.radius_m - 3.048f);  // -10 ft
        aw_maybe_clear_alarm_after_adjustment();
        signalk_queue_save_anchor();
    } else {
        s_edit_chain_ft = fmaxf(10.0f, s_edit_chain_ft - 10.0f);
    }
    aw_update_ui();
    if (s_aw_adj_timer) lv_timer_reset(s_aw_adj_timer);
}
static void on_radius_plus(lv_event_t*) {
    if (gAnchor.active) {
        gAnchor.radius_m = fminf(457.2f, gAnchor.radius_m + 3.048f);
        aw_maybe_clear_alarm_after_adjustment();
        signalk_queue_save_anchor();
    } else {
        s_edit_chain_ft = fminf(600.0f, s_edit_chain_ft + 10.0f);
    }
    aw_update_ui();
    if (s_aw_adj_timer) lv_timer_reset(s_aw_adj_timer);
}
static void on_buffer_minus(lv_event_t*) {
    gAnchor.alarm_buffer_pct = fmaxf(0.0f, gAnchor.alarm_buffer_pct - 5.0f);
    if (gAnchor.active) signalk_queue_save_anchor();
    aw_update_ui();
    if (s_aw_adj_timer) lv_timer_reset(s_aw_adj_timer);
}
static void on_buffer_plus(lv_event_t*) {
    gAnchor.alarm_buffer_pct = fminf(50.0f, gAnchor.alarm_buffer_pct + 5.0f);
    aw_maybe_clear_alarm_after_adjustment();
    if (gAnchor.active) signalk_queue_save_anchor();
    aw_update_ui();
    if (s_aw_adj_timer) lv_timer_reset(s_aw_adj_timer);
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════
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

static lv_obj_t* val_block(lv_obj_t* scr,
                             int16_t x, int16_t y, int16_t w,
                             const char* unit_label,
                             const lv_font_t* vfont, uint32_t vcol) {
    lv_obj_t* u = lv_label_create(scr);
    lv_obj_set_pos(u, x, y);  lv_obj_set_size(u, w, 18);
    lv_obj_set_style_text_font(u, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(u, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(u, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(u, unit_label);
    lv_obj_clear_flag(u, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t* v = lv_label_create(scr);
    lv_obj_set_pos(v, x, y + 20);  lv_obj_set_size(v, w, 46);
    lv_obj_set_style_text_font(v, vfont, 0);
    lv_obj_set_style_text_color(v, lv_color_hex(vcol), 0);
    lv_obj_set_style_text_align(v, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(v, "---");
    lv_obj_clear_flag(v, LV_OBJ_FLAG_CLICKABLE);
    return v;
}

// ── Anchor watch overlay helpers ──────────────────────────────────────────────

static lv_obj_t* aw_panel(lv_obj_t* par, int16_t x, int16_t y, int16_t w, int16_t h) {
    lv_obj_t* p = lv_obj_create(par);
    lv_obj_set_pos(p, x, y); lv_obj_set_size(p, w, h);
    lv_obj_set_style_bg_color(p, lv_color_make(0x08, 0x18, 0x38), 0);
    lv_obj_set_style_bg_opa(p, LV_OPA_70, 0);
    lv_obj_set_style_border_color(p, lv_color_make(0x30, 0x60, 0xA0), 0);
    lv_obj_set_style_border_width(p, 1, 0);
    lv_obj_set_style_radius(p, 8, 0);
    lv_obj_set_style_pad_all(p, 0, 0);
    lv_obj_clear_flag(p, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    return p;
}

static lv_obj_t* aw_btn(lv_obj_t* par, int16_t x, int16_t y, int16_t w, int16_t h,
                          const char* label, lv_event_cb_t cb) {
    lv_obj_t* btn = lv_btn_create(par);
    lv_obj_set_pos(btn, x, y); lv_obj_set_size(btn, w, h);
    lv_obj_set_style_bg_color(btn, lv_color_make(0x18, 0x30, 0x60), 0);
    lv_obj_set_style_bg_color(btn, lv_color_make(0x28, 0x50, 0x90), LV_STATE_PRESSED);
    lv_obj_set_style_border_color(btn, lv_color_make(0x44, 0x88, 0xCC), 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_radius(btn, 6, 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
    lv_obj_t* lbl = lv_label_create(btn);
    lv_label_set_text(lbl, label);
    lv_obj_set_style_text_color(lbl, lv_color_make(0xFF, 0xFF, 0xFF), 0);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, 0);
    lv_obj_center(lbl);
    if (cb) lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);
    return btn;
}

static lv_obj_t* aw_lbl(lv_obj_t* par, int16_t x, int16_t y,
                          const char* txt, const lv_font_t* font, uint32_t color) {
    lv_obj_t* l = lv_label_create(par);
    lv_obj_set_pos(l, x, y);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
    lv_label_set_text(l, txt);
    lv_obj_clear_flag(l, LV_OBJ_FLAG_CLICKABLE);
    return l;
}

// ── Make a transparent full-screen container (no border, no padding) ──────────
static lv_obj_t* transparent_cont(lv_obj_t* par, int16_t x, int16_t y,
                                    int16_t w, int16_t h) {
    lv_obj_t* c = lv_obj_create(par);
    lv_obj_set_pos(c, x, y); lv_obj_set_size(c, w, h);
    lv_obj_set_style_bg_opa(c, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(c, 0, 0);
    lv_obj_set_style_pad_all(c, 0, 0);
    lv_obj_set_style_radius(c, 0, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANCHOR WATCH SCREEN BUILD
// Layout:
//   Chart  (480×400): full-screen anchor chart (draw callback)
//   Top bar (480×52, overlaid at y=0): BACK + DEPTH / HDG / DIST
//   Adj overlay (440×90, overlaid ~y=305): tap chart to show; auto-hides 3s
//   Footer (480×80, at y=400): SET ANCHOR (full-width) or ACK/RELEASE halves
// ══════════════════════════════════════════════════════════════════════════════
static void build_anchor_watch(lv_obj_t* par) {

    // ── Chart canvas (480×400) — clickable to reveal adj overlay ─────────────
    s_anchor_watch = lv_obj_create(par);
    lv_obj_set_pos(s_anchor_watch, 0, 0);
    lv_obj_set_size(s_anchor_watch, SCR_W, AW_CHART_H);
    lv_obj_set_style_bg_opa(s_anchor_watch, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_anchor_watch, 0, 0);
    lv_obj_set_style_pad_all(s_anchor_watch, 0, 0);
    lv_obj_set_style_radius(s_anchor_watch, 0, 0);
    lv_obj_clear_flag(s_anchor_watch, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(s_anchor_watch, anchor_watch_draw_cb, LV_EVENT_DRAW_MAIN, nullptr);
    lv_obj_add_event_cb(s_anchor_watch, on_show_adj,          LV_EVENT_CLICKED,   nullptr);

    // ── Top info bar (480×52, overlaid on chart) ──────────────────────────────
    lv_obj_t* top = aw_panel(par, 0, 0, SCR_W, 52);
    lv_obj_set_style_radius(top, 0, 0);
    lv_obj_set_style_border_side(top, LV_BORDER_SIDE_BOTTOM, 0);

    lv_obj_t* back_btn = aw_btn(top, 4, 4, 84, 44, LV_SYMBOL_LEFT " BACK",
                                  s_back_cb_stored);
    (void)back_btn;

    // DEPTH  |  HDG  |  DIST — three columns right of BACK
    aw_lbl(top, 100, 5,  "DEPTH", &lv_font_montserrat_12, 0x8899AA);
    s_aw_depth_lbl    = aw_lbl(top, 100, 19, "---", &lv_font_montserrat_18, 0xFFFFFF);

    aw_lbl(top, 224, 5,  "HDG",  &lv_font_montserrat_12, 0x8899AA);
    s_aw_live_hdg_lbl = aw_lbl(top, 224, 19, "---", &lv_font_montserrat_18, 0xFFFFFF);

    s_aw_dist_cap = aw_lbl(top, 308, 5,  "DIST", &lv_font_montserrat_12, 0x8899AA);
    s_aw_dist_lbl = aw_lbl(top, 308, 19, "---",  &lv_font_montserrat_18, 0xFFFFFF);
    lv_obj_add_flag(s_aw_dist_cap, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s_aw_dist_lbl, LV_OBJ_FLAG_HIDDEN);

    // "FISHFINDER" mode-switch button — right side of top bar.
    // Hidden while anchor is active (managed by aw_update_ui).
    s_aw_ff_btn = aw_btn(top, 394, 4, 80, 44, "FF", switch_to_fishfinder);

    // ── Adjustment overlay (tap chart to show; auto-hides after 3 s) ─────────
    // Positioned low on the chart above the footer; clear of the anchor circles.
    // Two rows: [−10ft] RADIUS: XXX ft [+10ft]  and  [−5%] BUFFER: XX% [+5%]
    s_aw_adj_panel = aw_panel(par, 20, 278, 440, 110);
    lv_obj_set_style_pad_hor(s_aw_adj_panel, 6, 0);
    lv_obj_set_style_pad_ver(s_aw_adj_panel, 6, 0);
    lv_obj_add_flag(s_aw_adj_panel, LV_OBJ_FLAG_HIDDEN);
    // Intercept taps on the overlay itself to reset the hide timer
    lv_obj_add_event_cb(s_aw_adj_panel, on_show_adj, LV_EVENT_CLICKED, nullptr);

    // Row helpers — each row: [−] at x=0 | label+value in centre | [+] at x=386
    // Panel inner width = 440 - 12 (pad_hor) = 428 px.
    // Each row: [−] 60px | label 308px | [+] 60px  (total 428)
    auto mk_adj_row = [&](int16_t ry, const char* cap, lv_obj_t** cap_out,
                          lv_obj_t** val_out,
                          lv_event_cb_t minus_cb, lv_event_cb_t plus_cb) {
        aw_btn(s_aw_adj_panel,   0, ry, 60, 42, "-", minus_cb);
        aw_btn(s_aw_adj_panel, 368, ry, 60, 42, "+", plus_cb);
        lv_obj_t* cap_l = aw_lbl(s_aw_adj_panel, 62, ry + 2, cap,
                                  &lv_font_montserrat_12, 0x8899AA);
        lv_obj_set_size(cap_l, 306, 16);
        lv_obj_set_style_text_align(cap_l, LV_TEXT_ALIGN_CENTER, 0);
        if (cap_out) *cap_out = cap_l;
        *val_out = aw_lbl(s_aw_adj_panel, 62, ry + 20, "---",
                          &lv_font_montserrat_18, 0xCCDDFF);
        lv_obj_set_size(*val_out, 306, 22);
        lv_obj_set_style_text_align(*val_out, LV_TEXT_ALIGN_CENTER, 0);
    };
    // CHAIN label changes to RADIUS after anchor is set (aw_update_ui handles it)
    mk_adj_row(4,  "CHAIN",  &s_aw_radius_cap, &s_aw_radius_lbl, on_radius_minus, on_radius_plus);
    mk_adj_row(52, "BUFFER", nullptr,           &s_aw_buf_lbl,    on_buffer_minus, on_buffer_plus);

    // ── Footer bar (480×80, solid dark navy) ──────────────────────────────────
    lv_obj_t* footer = lv_obj_create(par);
    lv_obj_set_pos(footer, 0, AW_CHART_H);
    lv_obj_set_size(footer, SCR_W, AW_FOOTER_H);
    lv_obj_set_style_bg_color(footer, lv_color_make(0x06, 0x14, 0x30), 0);
    lv_obj_set_style_bg_opa(footer, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(footer, lv_color_make(0x30, 0x60, 0xA0), 0);
    lv_obj_set_style_border_width(footer, 1, 0);
    lv_obj_set_style_border_side(footer, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_radius(footer, 0, 0);
    lv_obj_set_style_pad_all(footer, 0, 0);
    lv_obj_clear_flag(footer, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);

    // SET ANCHOR — full-width, shown when no anchor active
    s_aw_set_btn = aw_btn(footer, 0, 0, SCR_W, AW_FOOTER_H, "SET ANCHOR", on_set_anchor);
    lv_obj_set_style_text_font(lv_obj_get_child(s_aw_set_btn, 0), &lv_font_montserrat_20, 0);

    // RELEASE — full-width, shown when anchor active.
    // Label and colour change dynamically (blue=OK, orange=dragging alarm).
    s_aw_release_btn = aw_btn(footer, 0, 0, SCR_W, AW_FOOTER_H, "RELEASE", on_release);
    lv_obj_set_style_text_font(lv_obj_get_child(s_aw_release_btn, 0), &lv_font_montserrat_20, 0);
    lv_obj_add_flag(s_aw_release_btn, LV_OBJ_FLAG_HIDDEN);

    // Initialise label values and sync visibility
    aw_update_ui();
}

// ══════════════════════════════════════════════════════════════════════════════
// NAV DETAIL CREATE
// ══════════════════════════════════════════════════════════════════════════════
lv_obj_t* nav_detail_create(lv_event_cb_t back_cb) {
    s_back_cb_stored = back_cb;

    lv_obj_t* scr = lv_obj_create(nullptr);
    s_scr_ref = scr;
    lv_obj_set_size(scr, SCR_W, SCR_H);
    lv_obj_set_style_bg_color(scr, lv_color_hex(COL_BG), 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Fish-finder container ─────────────────────────────────────────────────
    s_ff_cont = transparent_cont(scr, 0, 0, SCR_W, SCR_H);

    {
        lv_obj_t* hdr = detail_header(s_ff_cont, COL_NAV, "NAVIGATION", back_cb);
        // "ANCHOR" mode-switch button — right side of the header bar
        lv_obj_t* aw_mode_btn = lv_btn_create(hdr);
        lv_obj_set_pos(aw_mode_btn, 384, 5);
        lv_obj_set_size(aw_mode_btn, 88, 30);
        lv_obj_set_style_bg_color(aw_mode_btn, lv_color_make(0x18, 0x30, 0x60), 0);
        lv_obj_set_style_bg_color(aw_mode_btn, lv_color_make(0x28, 0x50, 0x90), LV_STATE_PRESSED);
        lv_obj_set_style_border_color(aw_mode_btn, lv_color_make(0x44, 0x88, 0xCC), 0);
        lv_obj_set_style_border_width(aw_mode_btn, 1, 0);
        lv_obj_set_style_radius(aw_mode_btn, 6, 0);
        lv_obj_set_style_shadow_width(aw_mode_btn, 0, 0);
        lv_obj_t* aml = lv_label_create(aw_mode_btn);
        lv_label_set_text(aml, "ANCHOR");
        lv_obj_set_style_text_color(aml, lv_color_make(0xFF, 0xFF, 0xFF), 0);
        lv_obj_set_style_text_font(aml, &lv_font_montserrat_12, 0);
        lv_obj_center(aml);
        lv_obj_add_event_cb(aw_mode_btn, switch_to_anchor_watch, LV_EVENT_CLICKED, nullptr);
    }

    // ── Depth (left half) ─────────────────────────────────────────────────────
    lv_obj_t* dep_cap = lv_label_create(s_ff_cont);
    lv_obj_set_pos(dep_cap, 0, 48);  lv_obj_set_size(dep_cap, SCR_W / 2, 20);
    lv_obj_set_style_text_font(dep_cap, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(dep_cap, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(dep_cap, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(dep_cap, "DEPTH  |  ft");
    lv_obj_clear_flag(dep_cap, LV_OBJ_FLAG_CLICKABLE);

    s_depth = lv_label_create(s_ff_cont);
    lv_obj_set_pos(s_depth, 0, 70);  lv_obj_set_size(s_depth, SCR_W / 2, 56);
    lv_obj_set_style_text_font(s_depth, &lv_font_montserrat_44, 0);
    lv_obj_set_style_text_color(s_depth, lv_color_hex(COL_MUTED), 0);
    lv_obj_set_style_text_align(s_depth, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text(s_depth, "---");
    lv_obj_clear_flag(s_depth, LV_OBJ_FLAG_CLICKABLE);

    // Vertical divider between depth and tide gauge
    {
        lv_obj_t* vd = lv_obj_create(s_ff_cont);
        lv_obj_set_pos(vd, SCR_W / 2, 48);  lv_obj_set_size(vd, 1, 80);
        lv_obj_set_style_bg_color(vd, lv_color_hex(COL_DIV), 0);
        lv_obj_set_style_border_width(vd, 0, 0);
        lv_obj_clear_flag(vd, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    }

    // ── Tide gauge (right half, custom draw) ──────────────────────────────────
    s_tide_gauge = lv_obj_create(s_ff_cont);
    lv_obj_set_pos(s_tide_gauge, SCR_W / 2 + 2, 46);
    lv_obj_set_size(s_tide_gauge, SCR_W / 2 - 6, 84);
    lv_obj_set_style_bg_opa(s_tide_gauge, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(s_tide_gauge, 0, 0);
    lv_obj_set_style_pad_all(s_tide_gauge, 0, 0);
    lv_obj_set_style_radius(s_tide_gauge, 0, 0);
    lv_obj_clear_flag(s_tide_gauge, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(s_tide_gauge, tide_gauge_draw_cb, LV_EVENT_DRAW_MAIN, nullptr);

    hdiv(s_ff_cont, 132);

    s_sog = val_block(s_ff_cont,   0, 138, 160, "SOG  (kt)",
                      &lv_font_montserrat_34, COL_VALUE);
    s_hdg = val_block(s_ff_cont, 160, 138, 160, "HDG  (\xc2\xb0M)",
                      &lv_font_montserrat_34, COL_VALUE);
    s_cog = val_block(s_ff_cont, 320, 138, 160, "COG  (\xc2\xb0T)",
                      &lv_font_montserrat_34, COL_VALUE);

    for (int vdx : {159, 319}) {
        lv_obj_t* vd = lv_obj_create(s_ff_cont);
        lv_obj_set_pos(vd, vdx, 138);  lv_obj_set_size(vd, 1, 72);
        lv_obj_set_style_bg_color(vd, lv_color_hex(COL_DIV), 0);
        lv_obj_set_style_border_width(vd, 0, 0);
        lv_obj_clear_flag(vd, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    }

    hdiv(s_ff_cont, 216);

    // ── "DEPTH HISTORY" row — title left, depth alarm status right ─────────
    lv_obj_t* ff_lbl = lv_label_create(s_ff_cont);
    lv_obj_set_pos(ff_lbl, 0, 220);  lv_obj_set_size(ff_lbl, SCR_W / 2, 16);
    lv_obj_set_style_text_font(ff_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(ff_lbl, lv_color_hex(COL_LABEL), 0);
    lv_obj_set_style_text_align(ff_lbl, LV_TEXT_ALIGN_LEFT, 0);
    lv_label_set_text(ff_lbl, "  DEPTH HISTORY | 10 min");
    lv_obj_clear_flag(ff_lbl, LV_OBJ_FLAG_CLICKABLE);

    s_ff_alarm_lbl = lv_label_create(s_ff_cont);
    lv_obj_set_pos(s_ff_alarm_lbl, SCR_W / 2, 220);
    lv_obj_set_size(s_ff_alarm_lbl, SCR_W / 2, 16);
    lv_obj_set_style_text_font(s_ff_alarm_lbl, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(s_ff_alarm_lbl, lv_color_make(0xC8, 0xA0, 0x00), 0);
    lv_obj_set_style_text_align(s_ff_alarm_lbl, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_clear_flag(s_ff_alarm_lbl, LV_OBJ_FLAG_CLICKABLE);

    s_fishfinder = lv_obj_create(s_ff_cont);
    lv_obj_set_pos(s_fishfinder, 4, 240);
    lv_obj_set_size(s_fishfinder, SCR_W - 8, 236);
    lv_obj_set_style_bg_opa(s_fishfinder, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(s_fishfinder, lv_color_hex(COL_DIV), 0);
    lv_obj_set_style_border_width(s_fishfinder, 1, 0);
    lv_obj_set_style_pad_all(s_fishfinder, 0, 0);
    lv_obj_set_style_radius(s_fishfinder, 0, 0);
    lv_obj_clear_flag(s_fishfinder, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(s_fishfinder, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(s_fishfinder, fishfinder_draw_cb, LV_EVENT_DRAW_MAIN, nullptr);
    lv_obj_add_event_cb(s_fishfinder, [](lv_event_t*) {
        if (!s_ff_adj_panel) return;
        bool hidden = lv_obj_has_flag(s_ff_adj_panel, LV_OBJ_FLAG_HIDDEN);
        if (hidden) {
            update_ff_alarm_ui();
            lv_obj_clear_flag(s_ff_adj_panel, LV_OBJ_FLAG_HIDDEN);
            ff_adj_timer_kick();
        } else {
            lv_obj_add_flag(s_ff_adj_panel, LV_OBJ_FLAG_HIDDEN);
            if (s_ff_adj_timer) lv_timer_pause(s_ff_adj_timer);
        }
    }, LV_EVENT_CLICKED, nullptr);

    // Depth alarm banner — overlaid at the top of the fishfinder, hidden by default.
    // Amber for warning zone, red for alert zone.  Tap silences the beeper.
    s_ff_depth_banner = lv_btn_create(s_ff_cont);
    lv_obj_set_pos(s_ff_depth_banner, 0, 240);
    lv_obj_set_size(s_ff_depth_banner, SCR_W, 30);
    lv_obj_set_style_radius(s_ff_depth_banner, 0, 0);
    lv_obj_set_style_pad_all(s_ff_depth_banner, 4, 0);
    lv_obj_set_style_bg_color(s_ff_depth_banner, lv_color_hex(COL_WARN), 0);
    lv_obj_set_style_shadow_width(s_ff_depth_banner, 0, 0);
    lv_obj_add_flag(s_ff_depth_banner, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(s_ff_depth_banner, on_silence_depth, LV_EVENT_CLICKED, nullptr);

    s_ff_banner_lbl = lv_label_create(s_ff_depth_banner);
    lv_obj_set_style_text_font(s_ff_banner_lbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(s_ff_banner_lbl, lv_color_make(0xFF, 0xFF, 0xFF), 0);
    lv_obj_set_style_text_align(s_ff_banner_lbl, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(s_ff_banner_lbl, SCR_W - 8);
    lv_obj_align(s_ff_banner_lbl, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(s_ff_banner_lbl, "");

    // ── Depth alarm adjustment overlay panel ─────────────────────────────────
    // Appears on tap of the fishfinder; auto-hides after 4 s.
    // Layout: two rows — WARN and ALERT — each with [−] value [+]
    {
        const lv_coord_t PW = 300;
        const lv_coord_t PH = 110;
        const lv_coord_t PX = (SCR_W - PW) / 2;
        const lv_coord_t PY = 360;   // inside fishfinder area (240+236=476, panel bottom=470)

        s_ff_adj_panel = lv_obj_create(s_ff_cont);
        lv_obj_set_pos(s_ff_adj_panel, PX, PY);
        lv_obj_set_size(s_ff_adj_panel, PW, PH);
        lv_obj_set_style_bg_color(s_ff_adj_panel, lv_color_make(0x08, 0x10, 0x28), 0);
        lv_obj_set_style_bg_opa(s_ff_adj_panel, LV_OPA_90, 0);
        lv_obj_set_style_border_color(s_ff_adj_panel, lv_color_make(0x40, 0x60, 0xA0), 0);
        lv_obj_set_style_border_width(s_ff_adj_panel, 1, 0);
        lv_obj_set_style_radius(s_ff_adj_panel, 8, 0);
        lv_obj_set_style_pad_all(s_ff_adj_panel, 0, 0);
        lv_obj_clear_flag(s_ff_adj_panel, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(s_ff_adj_panel, LV_OBJ_FLAG_HIDDEN);

        // Helper: create a row with cap label | [−] | value label | [+]
        // Returns the value label widget.
        auto mk_row = [&](lv_coord_t ry, const char* cap,
                          lv_color_t cap_col,
                          lv_event_cb_t minus_cb, lv_event_cb_t plus_cb) -> lv_obj_t* {
            const lv_coord_t BTN_W = 56, BTN_H = 44;
            const lv_coord_t VAL_W = 80;
            const lv_coord_t CAP_W = 60;

            // Cap label (WARN / ALRT)
            lv_obj_t* cap_l = lv_label_create(s_ff_adj_panel);
            lv_obj_set_pos(cap_l, 8, ry + (BTN_H - 18) / 2);
            lv_obj_set_size(cap_l, CAP_W, 20);
            lv_obj_set_style_text_font(cap_l, &lv_font_montserrat_16, 0);
            lv_obj_set_style_text_color(cap_l, cap_col, 0);
            lv_label_set_text(cap_l, cap);
            lv_obj_clear_flag(cap_l, LV_OBJ_FLAG_CLICKABLE);

            // [−] button
            lv_obj_t* bm = lv_btn_create(s_ff_adj_panel);
            lv_obj_set_pos(bm, CAP_W + 8, ry);
            lv_obj_set_size(bm, BTN_W, BTN_H);
            lv_obj_set_style_bg_color(bm, lv_color_make(0x20, 0x20, 0x50), 0);
            lv_obj_set_style_border_color(bm, lv_color_make(0x50, 0x70, 0xB0), 0);
            lv_obj_set_style_border_width(bm, 1, 0);
            lv_obj_set_style_radius(bm, 6, 0);
            lv_obj_t* bml = lv_label_create(bm); lv_obj_center(bml);
            lv_obj_set_style_text_font(bml, &lv_font_montserrat_20, 0);
            lv_obj_set_style_text_color(bml, lv_color_make(0xFF,0xFF,0xFF), 0);
            lv_label_set_text(bml, "-");
            lv_obj_add_event_cb(bm, minus_cb, LV_EVENT_CLICKED, nullptr);

            // Value label
            lv_obj_t* val = lv_label_create(s_ff_adj_panel);
            lv_obj_set_pos(val, CAP_W + BTN_W + 12, ry + (BTN_H - 20) / 2);
            lv_obj_set_size(val, VAL_W, 24);
            lv_obj_set_style_text_font(val, &lv_font_montserrat_20, 0);
            lv_obj_set_style_text_color(val, lv_color_make(0xFF,0xFF,0xFF), 0);
            lv_obj_set_style_text_align(val, LV_TEXT_ALIGN_CENTER, 0);
            lv_obj_clear_flag(val, LV_OBJ_FLAG_CLICKABLE);

            // [+] button
            lv_obj_t* bp = lv_btn_create(s_ff_adj_panel);
            lv_obj_set_pos(bp, CAP_W + BTN_W + VAL_W + 16, ry);
            lv_obj_set_size(bp, BTN_W, BTN_H);
            lv_obj_set_style_bg_color(bp, lv_color_make(0x20, 0x20, 0x50), 0);
            lv_obj_set_style_border_color(bp, lv_color_make(0x50, 0x70, 0xB0), 0);
            lv_obj_set_style_border_width(bp, 1, 0);
            lv_obj_set_style_radius(bp, 6, 0);
            lv_obj_t* bpl = lv_label_create(bp); lv_obj_center(bpl);
            lv_obj_set_style_text_font(bpl, &lv_font_montserrat_20, 0);
            lv_obj_set_style_text_color(bpl, lv_color_make(0xFF,0xFF,0xFF), 0);
            lv_label_set_text(bpl, "+");
            lv_obj_add_event_cb(bp, plus_cb, LV_EVENT_CLICKED, nullptr);

            return val;
        };

        s_ff_warn_lbl  = mk_row(8,  "WARN",
                                lv_color_make(0xFF, 0xD0, 0x00),
                                on_warn_minus, on_warn_plus);
        s_ff_alert_lbl = mk_row(58, "ALRT",
                                lv_color_make(0xFF, 0x60, 0x20),
                                on_alert_minus, on_alert_plus);

        // Auto-hide timer — started when panel opens, resets on each button press
        s_ff_adj_timer = lv_timer_create([](lv_timer_t* t) {
            if (s_ff_adj_panel) lv_obj_add_flag(s_ff_adj_panel, LV_OBJ_FLAG_HIDDEN);
            lv_timer_pause(t);
        }, 4000, nullptr);
        lv_timer_pause(s_ff_adj_timer);  // start paused; activated on panel open

        update_ff_alarm_ui();
    }

    // ── Anchor watch container ─────────────────────────────────────────────────
    s_aw_cont = transparent_cont(scr, 0, 0, SCR_W, SCR_H);
    lv_obj_add_flag(s_aw_cont, LV_OBJ_FLAG_HIDDEN);

    build_anchor_watch(s_aw_cont);

    nav_detail_refresh();
    return scr;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANCHOR EVALUATION — runs every 200 ms regardless of active screen
// ══════════════════════════════════════════════════════════════════════════════
// Recalculates distance/bearing from the current GPS fix to the anchor and
// runs the deadband + latch alarm logic.  Returns true the moment the alarm
// latches so the caller (main.cpp) can auto-navigate to the NAV screen.
bool nav_anchor_eval() {
    if (!gAnchor.active) {
        gAnchor.dist_m  = NAN;
        gAnchor.brg_deg = NAN;
        s_alarm_pending_ms = 0;
        return false;
    }

    bool st = gNav.stale();
    if (st || isnan(gNav.lat) || isnan(gNav.lon)) {
        gAnchor.dist_m  = NAN;
        gAnchor.brg_deg = NAN;
        return false;
    }

    gAnchor.dist_m  = haversine_m(gNav.lat, gNav.lon,
                                   gAnchor.anchor_lat, gAnchor.anchor_lon);
    gAnchor.brg_deg = bearing_deg_to(gNav.lat, gNav.lon,
                                      gAnchor.anchor_lat, gAnchor.anchor_lon);

    // Deadband + latch:
    //  • Alarm fires only after boat is continuously outside alarm_r for
    //    ALARM_DEADBAND_MS (8 s) — prevents false trips from GPS jitter.
    //  • Once latched, alarm stays until user taps ACK / adjusts radius.
    float alarm_r = gAnchor.radius_m * (1.0f + gAnchor.alarm_buffer_pct / 100.0f);

    if (!gAnchor.alarm) {
        if (gAnchor.dist_m > alarm_r) {
            if (s_alarm_pending_ms == 0)
                s_alarm_pending_ms = millis();
            else if (millis() - s_alarm_pending_ms >= ALARM_DEADBAND_MS) {
                gAnchor.alarm      = true;
                s_alarm_pending_ms = 0;
                aw_update_ui();
                signalk_queue_save_anchor();
                return true;   // just latched — caller should switch to NAV screen
            }
        } else {
            if (s_alarm_pending_ms != 0) {
                s_alarm_pending_ms = 0;
                aw_update_ui();
            }
        }
    }
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// NAV DETAIL REFRESH
// ══════════════════════════════════════════════════════════════════════════════
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
    // ── Auto-switch between fish-finder and anchor watch ──────────────────────
    // If anchor is active (set locally or restored from network), always show
    // anchor watch — don't let the SOG-based auto-switch override it.
    if (gAnchor.active && !s_anchor_mode) {
        s_anchor_mode = true;
        lv_obj_add_flag  (s_ff_cont, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(s_aw_cont, LV_OBJ_FLAG_HIDDEN);
    }

    if (!s_anchor_mode_manual && !gNav.stale() && !isnan(gNav.sog_kts)) {
        bool want_anchor = gNav.sog_kts < 1.0f;
        // Only auto-switch to fishfinder if no active anchor watch
        bool want_ff     = gNav.sog_kts > 1.5f && !gAnchor.active;
        if (want_anchor && !s_anchor_mode) {
            s_anchor_mode = true;
            lv_obj_add_flag  (s_ff_cont, LV_OBJ_FLAG_HIDDEN);
            lv_obj_clear_flag(s_aw_cont, LV_OBJ_FLAG_HIDDEN);
        } else if (want_ff && s_anchor_mode) {
            s_anchor_mode        = false;
            s_anchor_mode_manual = false;
            lv_obj_clear_flag(s_ff_cont, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag  (s_aw_cont, LV_OBJ_FLAG_HIDDEN);
            if (!gAnchor.active) gAnchor.track.clear();
        }
    }

    // ── Anchor watch mode ─────────────────────────────────────────────────────
    if (s_anchor_mode) {
        // Distance/alarm state is maintained by nav_anchor_eval() called from
        // the main timer — no need to recalculate here.
        bool st = gNav.stale();

        // Update data overlay
        char buf[18];

        if (!st && !isnan(gNav.depth_m))
            snprintf(buf, sizeof(buf), "%.1f ft", gNav.depth_m * 3.28084f);
        else strcpy(buf, "---");
        lv_label_set_text(s_aw_depth_lbl, buf);

        if (!st && !isnan(gNav.hdg_deg))
            snprintf(buf, sizeof(buf), "%.0f\xc2\xb0M", gNav.hdg_deg);
        else strcpy(buf, "---");
        lv_label_set_text(s_aw_live_hdg_lbl, buf);

        if (gAnchor.active && !isnan(gAnchor.dist_m)) {
            snprintf(buf, sizeof(buf), "%.0f ft", gAnchor.dist_m * 3.28084f);
            lv_label_set_text(s_aw_dist_lbl, buf);
            lv_obj_clear_flag(s_aw_dist_cap, LV_OBJ_FLAG_HIDDEN);
            lv_obj_clear_flag(s_aw_dist_lbl, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(s_aw_dist_cap, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(s_aw_dist_lbl, LV_OBJ_FLAG_HIDDEN);
        }

        aw_update_ui();
        lv_obj_invalidate(s_anchor_watch);
        return;
    }

    // ── Fish-finder mode ──────────────────────────────────────────────────────
    bool st = gNav.stale();
    slbl(s_depth, st, gNav.depth_m * 3.28084f, "%.1f", COL_VALUE);
    slbl(s_sog,   st, gNav.sog_kts,             "%.1f", COL_VALUE);
    slbl(s_hdg,   st, gNav.hdg_deg,             "%.0f", COL_VALUE);
    slbl(s_cog,   st, gNav.cog_deg,             "%.0f", COL_VALUE);
    if (s_tide_gauge) lv_obj_invalidate(s_tide_gauge);
    update_ff_depth_banner();

    s_ff_cur_ft = (st || isnan(gNav.depth_m)) ? 0.0f : gNav.depth_m * 3.28084f;

    if (update_chart) {
        s_ff_count = gHistory.depth_m.count;
        for (uint16_t i = 0; i < s_ff_count; i++)
            s_ff_depths[i] = gHistory.depth_m.get(i) * 3.28084f;
    }

    lv_obj_invalidate(s_fishfinder);
}
