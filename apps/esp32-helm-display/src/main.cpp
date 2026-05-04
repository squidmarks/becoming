/**
 * M/Y Becoming Helm Display  v0.2
 * Hardware: Waveshare ESP32-S3-Touch-LCD-4 (N16R8)
 *   - 480×480 IPS  (ST7701S, 3-wire SPI init + RGB parallel)
 *   - GT911 touch  (I2C via SensorLib TouchDrvGT911)
 *   - TCA9554PWR IO expander at 0x20 (backlight, LCD/touch reset)
 */

#include <Arduino.h>
#include <Wire.h>
#include <lvgl.h>
#include "Arduino_GFX_Library.h"
#include "TouchDrv.hpp"

#include "signalk_client.h"
#include "ui_startup.h"
#include "ui_dashboard.h"
#include "ui_nav_detail.h"
#include "ui_engine_detail.h"
#include "ui_elec_detail.h"
#include <WiFi.h>

// ── IO Expander (TCA9554PWR at 0x20) ─────────────────────────────────────────
#define TCA_ADDR    0x20
#define TCA_REG_OUT 0x01
#define TCA_REG_CFG 0x03
#define BIT_TP_RST  0
#define BIT_BL_EN   1
#define BIT_LCD_RST 2
#define BIT_BEE_EN  5

static void tca_write(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(TCA_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

static void io_expander_init() {
    uint8_t out = 0xFF & ~(1u << BIT_BEE_EN);
    tca_write(TCA_REG_OUT, out);
    tca_write(TCA_REG_CFG, 0xC0);
    delay(5);
    out &= ~(1u << BIT_LCD_RST);
    tca_write(TCA_REG_OUT, out); delay(20);
    out |= (1u << BIT_LCD_RST);
    tca_write(TCA_REG_OUT, out); delay(50);
    out &= ~(1u << BIT_TP_RST);
    tca_write(TCA_REG_OUT, out); delay(20);
    out |= (1u << BIT_TP_RST);
    tca_write(TCA_REG_OUT, out); delay(100);
    out |= (1u << BIT_BL_EN);
    tca_write(TCA_REG_OUT, out);
    Serial.println("[IO] expander OK");
}

// ── Display ───────────────────────────────────────────────────────────────────
Arduino_DataBus *bus = new Arduino_SWSPI(
    GFX_NOT_DEFINED, 42, 2, 1, GFX_NOT_DEFINED);

// bounce_buffer_size_px decouples the LCD DMA (reads SRAM) from our PSRAM writes,
// eliminating the frame-buffer race that causes tearing.
Arduino_ESP32RGBPanel *rgbpanel = new Arduino_ESP32RGBPanel(
    40, 39, 38, 41,
    46, 3, 8, 18, 17,
    14, 13, 12, 11, 10, 9,
    5, 45, 48, 47, 21,
    1, 10, 8, 50,
    1, 10, 8, 20,
    0, GFX_NOT_DEFINED, false, 0, 0,  // pclk_active_neg, prefer_speed, useBigEndian, de_idle_high, pclk_idle_high
    480 * 8);                         // bounce buffer: 8 lines of SRAM (~15 KB)

Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
    480, 480, rgbpanel, 2, true,
    bus, GFX_NOT_DEFINED,
    st7701_type1_init_operations, sizeof(st7701_type1_init_operations));

// ── Touch ─────────────────────────────────────────────────────────────────────
TouchDrvGT911 touch;

// ── LVGL ──────────────────────────────────────────────────────────────────────
static lv_disp_draw_buf_t draw_buf;

enum UIScreen { SCR_STARTUP, SCR_DASH, SCR_NAV, SCR_ENG, SCR_ELEC };
static UIScreen  ui_screen     = SCR_STARTUP;
static lv_obj_t* startup_screen    = nullptr;
static lv_obj_t* dash_screen       = nullptr;
static lv_obj_t* nav_detail_screen = nullptr;
static lv_obj_t* eng_detail_screen = nullptr;
static lv_obj_t* elec_detail_screen = nullptr;

static void disp_flush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_p) {
    uint32_t w = area->x2 - area->x1 + 1;
    uint32_t h = area->y2 - area->y1 + 1;
#if LV_COLOR_16_SWAP
    gfx->draw16bitBeRGBBitmap(area->x1, area->y1, (uint16_t *)&color_p->full, w, h);
#else
    gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)&color_p->full, w, h);
#endif
    lv_disp_flush_ready(drv);
}

static void touch_read(lv_indev_drv_t *drv, lv_indev_data_t *data) {
    const TouchPoints& pts = touch.getTouchPoints();
    if (pts.hasPoints()) {
        const TouchPoint& p = pts.getPoint(0);
        // Display is rotated 180°; mirror coordinates accordingly.
        data->point.x = gfx->width()  - (int16_t)p.x;
        data->point.y = gfx->height() - (int16_t)p.y;
        data->state   = LV_INDEV_STATE_PR;
    } else {
        data->state = LV_INDEV_STATE_REL;
    }
    (void)drv;
}

static void lvgl_tick(void *) { lv_tick_inc(2); }

// ── Navigation callbacks ───────────────────────────────────────────────────────
static void on_back_to_dash(lv_event_t*) {
    ui_screen = SCR_DASH;
    lv_scr_load_anim(dash_screen, LV_SCR_LOAD_ANIM_MOVE_RIGHT, 250, 0, false);
}
static void on_nav_tap(lv_event_t*) {
    ui_screen = SCR_NAV;
    nav_detail_refresh();
    lv_scr_load_anim(nav_detail_screen, LV_SCR_LOAD_ANIM_MOVE_LEFT, 250, 0, false);
}
static void on_eng_tap(lv_event_t*) {
    ui_screen = SCR_ENG;
    eng_detail_refresh();
    lv_scr_load_anim(eng_detail_screen, LV_SCR_LOAD_ANIM_MOVE_LEFT, 250, 0, false);
}
static void on_elec_tap(lv_event_t*) {
    ui_screen = SCR_ELEC;
    elec_detail_refresh();
    lv_scr_load_anim(elec_detail_screen, LV_SCR_LOAD_ANIM_MOVE_LEFT, 250, 0, false);
}

// ── 1-second UI refresh timer ────────────────────────────────────────────────
static uint32_t startup_ms = 0;

// Tick counter shared by the timer — used to derive 1 Hz sub-rate from 5 Hz timer.
static uint8_t s_slow_tick = 0;

static void ui_refresh_cb(lv_timer_t *) {
    // s_slow_tick increments every 200 ms; rolls over at 5 → 1 Hz "slow" rate.
    bool slow = (++s_slow_tick >= 5);
    if (slow) s_slow_tick = 0;

    switch (ui_screen) {
        case SCR_STARTUP:
            // Startup checks only need 1 Hz — connection state changes slowly.
            if (!slow) break;
            if (signalk_connected()) {
                ui_screen = SCR_DASH;
                lv_scr_load_anim(dash_screen, LV_SCR_LOAD_ANIM_FADE_ON, 400, 0, true);
            } else if (WiFi.status() == WL_CONNECTED) {
                startup_set_status("WiFi connected\nWaiting for SignalK\xe2\x80\xa6");
            } else if ((millis() - startup_ms) > 30000) {
                ui_screen = SCR_DASH;
                startup_set_status("Connection timed out");
                lv_scr_load_anim(dash_screen, LV_SCR_LOAD_ANIM_FADE_ON, 400, 200, true);
            }
            break;
        case SCR_DASH:  dashboard_refresh();          break;
        case SCR_NAV:   nav_detail_refresh(slow);     break;
        case SCR_ENG:   eng_detail_refresh(slow);     break;
        case SCR_ELEC:  elec_detail_refresh(slow);    break;
    }
}

// ── setup ─────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n=== M/Y Becoming Helm Display v0.2 ===");

    // Hardware
    Wire.begin(15, 7);

    // SW6106 battery/power-management IC (I2C 0x3C).
    // Two writes are needed for stable standalone (non-USB) boot:
    //  1. Reg 0x38 = 0x0A — disable light-load shutdown so the IC doesn't cut
    //     power during the quiet early-boot phase before the display draws current.
    //  2. Reg 0x03 = 0x01 — assert the "system keep-alive" bit so the IC knows
    //     the MCU is running and should stay powered.
    // These are no-ops if the IC isn't present (e.g. V1 boards without battery).
    for (uint8_t reg_val[][2] = {{0x38, 0x0A}, {0x03, 0x01}};
         auto& rv : reg_val) {
        Wire.beginTransmission(0x3C);
        Wire.write(rv[0]);
        Wire.write(rv[1]);
        Wire.endTransmission();
    }
    Serial.println("[PWR] SW6106 keepalive written");

    io_expander_init();

    // Touch
    uint8_t gt911_addr = 0;
    for (uint8_t a : {(uint8_t)0x5D, (uint8_t)0x14}) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) { gt911_addr = a; break; }
    }
    touch.setPins(-1, -1);
    if (!touch.begin(Wire, gt911_addr ? gt911_addr : 0x5D, 15, 7)) {
        Serial.println("[TOUCH] GT911 init failed");
    } else {
        touch.setMaxTouchPoint(1);
        Serial.printf("[TOUCH] GT911 OK at 0x%02X\n", gt911_addr);
    }

    // Display
    gfx->begin();
    Serial.println("[DISP] OK");

    // LVGL
    lv_init();

    // Two strip buffers in internal DMA-capable RAM (480×40 lines each).
    // The bounce buffer on the RGB panel decouples the LCD DMA from our PSRAM
    // writes, so the strip-copy in disp_flush no longer races against the LCD.
    const size_t buf_px = 480 * 40;
    lv_color_t *buf1 = (lv_color_t *)heap_caps_malloc(buf_px * sizeof(lv_color_t),
                                                       MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA);
    lv_color_t *buf2 = (lv_color_t *)heap_caps_malloc(buf_px * sizeof(lv_color_t),
                                                       MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA);
    if (!buf1) buf1 = (lv_color_t *)malloc(buf_px * sizeof(lv_color_t));
    if (!buf2) buf2 = (lv_color_t *)malloc(buf_px * sizeof(lv_color_t));
    lv_disp_draw_buf_init(&draw_buf, buf1, buf2, buf_px);

    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.hor_res  = 480;
    disp_drv.ver_res  = 480;
    disp_drv.flush_cb = disp_flush;
    disp_drv.draw_buf = &draw_buf;
    lv_disp_drv_register(&disp_drv);

    static lv_indev_drv_t indev_drv;
    lv_indev_drv_init(&indev_drv);
    indev_drv.type    = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = touch_read;
    lv_indev_drv_register(&indev_drv);

    const esp_timer_create_args_t tick_args = { .callback = lvgl_tick, .name = "lvgl_tick" };
    esp_timer_handle_t tick_timer;
    esp_timer_create(&tick_args, &tick_timer);
    esp_timer_start_periodic(tick_timer, 2000);  // 2 ms

    // Build all screens
    startup_screen     = startup_create();
    dash_screen        = dashboard_create();
    nav_detail_screen  = nav_detail_create(on_back_to_dash);
    eng_detail_screen  = eng_detail_create(on_back_to_dash);
    elec_detail_screen = elec_detail_create(on_back_to_dash);

    // Wire section tap handlers on the dashboard
    lv_obj_t *nav_s, *eng_s, *elec_s;
    dashboard_get_sections(&nav_s, &eng_s, &elec_s);
    lv_obj_add_event_cb(nav_s,  on_nav_tap,  LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(eng_s,  on_eng_tap,  LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(elec_s, on_elec_tap, LV_EVENT_CLICKED, nullptr);

    lv_scr_load(startup_screen);
    Serial.println("[UI] Startup screen");

    startup_ms = millis();
    // 200 ms = 5 Hz — fast enough for smooth RPM and nav updates.
    // LVGL widget guards (set_val / slbl string compares) ensure redraws only
    // happen when the value actually changes, so the extra polling is cheap.
    lv_timer_create(ui_refresh_cb, 200, nullptr);

    // SignalK client (non-blocking: starts WiFi + WebSocket in background)
    signalk_client_init();
}

// ── loop ──────────────────────────────────────────────────────────────────────
void loop() {
    signalk_client_poll();   // WebSocket I/O
    lv_timer_handler();      // LVGL draw + timers
    delay(5);
}
