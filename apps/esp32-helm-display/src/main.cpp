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
#include "alarm.h"
#include "vessel_data.h"
#include "ui_startup.h"
#include "ui_dashboard.h"
#include "ui_nav_detail.h"
#include "ui_engine_detail.h"
#include "ui_elec_detail.h"
#include <WiFi.h>

// ── Board revision detection ──────────────────────────────────────────────────
// Rev 3 uses TCA9554PWR I/O expander at 0x20.
// Rev 4 uses CH32V003F4U6 smart I/O expander at 0x24 — completely different
// register map and pin assignments.
enum BoardRev { BOARD_UNKNOWN, BOARD_REV3, BOARD_REV4 };
static BoardRev s_board_rev = BOARD_UNKNOWN;

// ── Rev 3 — TCA9554 at 0x20 ──────────────────────────────────────────────────
// Register map: OUT=0x01, CFG=0x03  (1=input, 0=output in CFG)
// EXIO0=TP_RST  EXIO1=BL_EN  EXIO2=LCD_RST  EXIO4=BLC  EXIO5=BEE_EN
#define TCA_ADDR        0x20
#define TCA_REG_OUT     0x01
#define TCA_REG_CFG     0x03
#define TCA_BIT_TP_RST  0
#define TCA_BIT_BL_EN   1
#define TCA_BIT_LCD_RST 2
#define TCA_BIT_BEE_EN  5

// ── Rev 4 — CH32V003 at 0x24 ─────────────────────────────────────────────────
// Register map: OUT=0x02, DIR=0x03, PWM=0x05  (DIR: 1=output, 0=input — INVERTED)
// EXIO1=TP_RST  EXIO3=LCD_RST  EXIO5=SYS_EN  EXIO6=BEE_EN
// Backlight via PWM register 0x05 (0=bright, 247=off — inverted polarity)
#define CH32_ADDR        0x24
#define CH32_REG_OUT     0x02
#define CH32_REG_DIR     0x03
#define CH32_REG_PWM     0x05
#define CH32_BIT_TP_RST  1
#define CH32_BIT_LCD_RST 3
#define CH32_BIT_SYS_EN  5
#define CH32_BIT_BEE_EN  6

// Live output register state (shared by both board paths)
static uint8_t s_io_out = 0;

// ── Low-level I2C write helpers ───────────────────────────────────────────────
static void tca_write(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(TCA_ADDR);
    Wire.write(reg); Wire.write(val);
    Wire.endTransmission();
}
static void ch32_write(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(CH32_ADDR);
    Wire.write(reg); Wire.write(val);
    Wire.endTransmission();
}

// ── Buzzer ────────────────────────────────────────────────────────────────────
// Rev 3: active buzzer on TCA9554 EXIO5 (HIGH = on)
// Rev 4: active buzzer on CH32V003 EXIO6 (HIGH = on)
// No buzzer = beep() is a silent delay (safe to call on any board)
static void beep(int ms) {
    if (s_board_rev == BOARD_REV3) {
        tca_write(TCA_REG_OUT, s_io_out | (1u << TCA_BIT_BEE_EN));
        delay(ms);
        tca_write(TCA_REG_OUT, s_io_out);
    } else if (s_board_rev == BOARD_REV4) {
        // Buzzer must be an output: DIR bit 6 must be set.
        // We enabled it during init, so just toggle the output.
        ch32_write(CH32_REG_OUT, s_io_out | (1u << CH32_BIT_BEE_EN));
        delay(ms);
        ch32_write(CH32_REG_OUT, s_io_out);
    } else {
        delay(ms);   // unknown board — don't crash
    }
    delay(60);   // silence gap between consecutive beeps
}

// ── IO expander init (auto-detects Rev 3 vs Rev 4) ───────────────────────────
static void io_expander_init() {
    // Probe both addresses. Wait up to 1 s for the I2C bus to be ready
    // (XL1509 buck converter on 12 V NMEA power takes time to regulate).
    for (int attempt = 0; attempt < 50 && s_board_rev == BOARD_UNKNOWN; attempt++) {
        Wire.beginTransmission(TCA_ADDR);   // Rev 3
        if (Wire.endTransmission() == 0) { s_board_rev = BOARD_REV3; break; }
        Wire.beginTransmission(CH32_ADDR);  // Rev 4
        if (Wire.endTransmission() == 0) { s_board_rev = BOARD_REV4; break; }
        delay(20);
    }
    Serial.printf("[IO] Board: %s\n",
        s_board_rev == BOARD_REV3 ? "Rev 3 (TCA9554 @ 0x20)" :
        s_board_rev == BOARD_REV4 ? "Rev 4 (CH32V003 @ 0x24)" : "UNKNOWN");

    if (s_board_rev == BOARD_REV3) {
        // ── TCA9554 init ──────────────────────────────────────────────────────
        // Backlight OFF initially; enable only after LCD reset sequence.
        // BEE_EN LOW (buzzer off). TP_RST and LCD_RST HIGH (released).
        s_io_out = (1u << TCA_BIT_LCD_RST) | (1u << TCA_BIT_TP_RST);
        tca_write(TCA_REG_OUT, s_io_out);
        tca_write(TCA_REG_CFG, 0xC0);   // bits 7-6=input, bits 5-0=output

        // LCD reset: low 20 ms, then ≥ 120 ms before first SPI command.
        // 500 ms gives plenty of margin for the 12 V/XL1509 power path.
        s_io_out &= ~(1u << TCA_BIT_LCD_RST);
        tca_write(TCA_REG_OUT, s_io_out); delay(20);
        s_io_out |=  (1u << TCA_BIT_LCD_RST);
        tca_write(TCA_REG_OUT, s_io_out); delay(500);

        // Touch reset
        s_io_out &= ~(1u << TCA_BIT_TP_RST);
        tca_write(TCA_REG_OUT, s_io_out); delay(20);
        s_io_out |=  (1u << TCA_BIT_TP_RST);
        tca_write(TCA_REG_OUT, s_io_out); delay(100);

        // Backlight ON
        s_io_out |= (1u << TCA_BIT_BL_EN);
        tca_write(TCA_REG_OUT, s_io_out);

    } else if (s_board_rev == BOARD_REV4) {
        // ── CH32V003 init ─────────────────────────────────────────────────────
        s_io_out = 0xFF & ~(1u << CH32_BIT_BEE_EN);   // all high except buzzer
        ch32_write(CH32_REG_OUT, s_io_out);
        ch32_write(CH32_REG_DIR, 0x3A);  // 00111010 — factory safe mask

        // LCD reset (same extended delay for 12 V path)
        s_io_out &= ~(1u << CH32_BIT_LCD_RST);
        ch32_write(CH32_REG_OUT, s_io_out); delay(20);
        s_io_out |=  (1u << CH32_BIT_LCD_RST);
        ch32_write(CH32_REG_OUT, s_io_out); delay(500);

        // Touch reset
        s_io_out &= ~(1u << CH32_BIT_TP_RST);
        ch32_write(CH32_REG_OUT, s_io_out); delay(20);
        s_io_out |=  (1u << CH32_BIT_TP_RST);
        ch32_write(CH32_REG_OUT, s_io_out); delay(100);

        // Backlight ON via PWM register (lower value = brighter; 30 ≈ 100%)
        ch32_write(CH32_REG_PWM, 30);

        // Now enable BEE_EN as output (safe — output register already has it LOW)
        ch32_write(CH32_REG_DIR, 0x7A);  // 01111010 — full output mask with BEE_EN

        // Keep SYS_EN high so SW6106 (battery) doesn't cut power
        s_io_out |= (1u << CH32_BIT_SYS_EN);
        ch32_write(CH32_REG_OUT, s_io_out);

    } else {
        Serial.println("[IO] WARNING: no IO expander found — display may not work");
    }
    Serial.println("[IO] expander OK");
}

// Thin compatibility shim so existing code that references the old names
// (BIT_LCD_RST etc.) still compiles after this refactor.
#define BIT_TP_RST  TCA_BIT_TP_RST
#define BIT_BL_EN   TCA_BIT_BL_EN
#define BIT_LCD_RST TCA_BIT_LCD_RST
#define BIT_BEE_EN  TCA_BIT_BEE_EN

// ── Alarm state machine ───────────────────────────────────────────────────────
// alarm_tick() is called every 200 ms from the UI timer.
// Patterns (each tick = 200 ms):
//   ALARM_ANCHOR : double-beep every 2.5 s
//   ALARM_DEPTH  : single beep, period set by g_depth_alarm_period (1–10 ticks)
//                  1 tick = 200 ms (urgent), 10 ticks = 2 s (relaxed warning)

float g_depth_warn_ft      = 10.0f;  // outer warning zone — alarm starts here
float g_depth_alert_ft     =  5.0f;  // inner alert zone — maximum urgency
int   g_depth_alarm_period = 10;     // updated every tick by depth evaluation below
bool  g_depth_alarm_silenced = false; // mutes beeper; visual indicator stays

static AlarmType s_alarm      = ALARM_NONE;
static int       s_alarm_tick = 0;

void alarm_raise(AlarmType type) {
    if ((int)type > (int)s_alarm) { s_alarm = type; s_alarm_tick = 0; }
}
void alarm_clear(AlarmType type) {
    if (s_alarm == type) { s_alarm = ALARM_NONE; s_alarm_tick = 0; }
}
AlarmType alarm_current() { return s_alarm; }

void alarm_tick() {
    if (s_alarm == ALARM_NONE) { s_alarm_tick = 0; return; }
    s_alarm_tick++;

    if (s_alarm == ALARM_ANCHOR) {
        // Double-beep every 2.5 s (12 ticks × 200 ms)
        if (s_alarm_tick == 1) beep(120);
        else if (s_alarm_tick == 2) beep(120);
        if (s_alarm_tick >= 12) s_alarm_tick = 0;

    } else if (s_alarm == ALARM_DEPTH) {
        // Progressive: single beep, interval = g_depth_alarm_period × 200 ms.
        // Silenced = visual indicator stays but no beep.
        if (!g_depth_alarm_silenced) {
            if (s_alarm_tick == 1) beep(80);
        }
        if (s_alarm_tick >= g_depth_alarm_period) s_alarm_tick = 0;
    }
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

    // ── Anchor evaluation (runs every 200 ms regardless of active screen) ──────
    // Recalculates distance to anchor and latches gAnchor.alarm.
    // Returns true the moment the alarm fires — auto-navigate to NAV screen.
    if (nav_anchor_eval() && ui_screen != SCR_NAV) {
        ui_screen = SCR_NAV;
        lv_scr_load_anim(nav_detail_screen, LV_SCR_LOAD_ANIM_FADE_ON, 300, 0, false);
    }

    // Raise/clear beeper based on gAnchor.alarm (set by nav_anchor_eval above)
    if (gAnchor.active && gAnchor.alarm)
        alarm_raise(ALARM_ANCHOR);
    else
        alarm_clear(ALARM_ANCHOR);

    // Shallow-water depth alarm — progressive frequency between warn and alert zones
    if (g_depth_warn_ft > 0.0f && !gNav.stale() && !isnan(gNav.depth_m)) {
        float depth_ft = gNav.depth_m * 3.28084f;
        if (depth_ft < g_depth_warn_ft) {
            // Compute period: slow at warn threshold, fast at/below alert threshold
            if (depth_ft <= g_depth_alert_ft) {
                g_depth_alarm_period = 1;   // near-continuous
            } else {
                float range = g_depth_warn_ft - g_depth_alert_ft;
                float ratio = (range > 0.1f) ? (depth_ft - g_depth_alert_ft) / range : 0.0f;
                g_depth_alarm_period = (int)(1.0f + ratio * 9.0f + 0.5f);  // 1–10
            }
            alarm_raise(ALARM_DEPTH);
        } else {
            // Depth safe — clear alarm and reset silenced flag so next
            // shallow-water event starts with the beeper active again.
            alarm_clear(ALARM_DEPTH);
            g_depth_alarm_silenced = false;
        }
    } else {
        alarm_clear(ALARM_DEPTH);
    }

    alarm_tick();

    switch (ui_screen) {
        case SCR_STARTUP:
            // Startup checks only need 1 Hz — connection state changes slowly.
            if (!slow) break;
            if (signalk_connected()) {
                ui_screen = SCR_DASH;
                lv_scr_load_anim(dash_screen, LV_SCR_LOAD_ANIM_FADE_ON, 400, 0, true);
            } else if (WiFi.status() == WL_CONNECTED) {
                startup_set_status("WiFi connected\nWaiting for SignalK...");
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

    // Anchor state arrived from the network (another MFD or on-reconnect restore).
    if (g_anchor_net_updated) {
        g_anchor_net_updated = false;
        // If the restored state has an active alarm, jump straight to NAV screen.
        if (gAnchor.active && gAnchor.alarm && ui_screen != SCR_NAV) {
            ui_screen = SCR_NAV;
            lv_scr_load_anim(nav_detail_screen, LV_SCR_LOAD_ANIM_FADE_ON, 300, 0, false);
        } else if (ui_screen == SCR_NAV) {
            nav_detail_refresh();
        }
    }
}

// ── setup ─────────────────────────────────────────────────────────────────────
void setup() {
    // Allow 3.3 V rail to stabilise.  On a 12 V NMEA2000 supply the XL1509
    // buck needs more time than USB 5 V.  1500 ms is generous but harmless on
    // a warm reset (rails already up) and prevents the black-screen cold-boot.
    delay(1500);

    Serial.begin(115200);
    Serial.println("\n=== M/Y Becoming Helm Display v0.2 ===");

    // Hardware
    Wire.begin(15, 7);

    // SW6106 keepalive — only relevant when running on USB-C / LiPo battery.
    // On wide-voltage (12 V NMEA2000 → XL1509), the SW6106 can interfere with
    // I2C when unpowered; skip it if the device doesn't ACK.  The Waveshare
    // wiki confirms this: "When using wide voltage power supply, I2C devices
    // cannot be identified, caused by the low SW6106 I2C."
    {
        Wire.beginTransmission(0x3C);
        bool sw6106_present = (Wire.endTransmission() == 0);
        if (sw6106_present) {
            for (uint8_t rv[][2] = {{0x38, 0x0A}, {0x03, 0x01}}; auto& r : rv) {
                Wire.beginTransmission(0x3C);
                Wire.write(r[0]); Wire.write(r[1]);
                Wire.endTransmission();
            }
            Serial.println("[PWR] SW6106 keepalive written");
        } else {
            Serial.println("[PWR] SW6106 not detected (wide-voltage mode)");
        }
    }

    io_expander_init();

    // ── Startup beep: one short beep = hardware init OK ──────────────────────
    // If the display is still black after this beep, the problem is in the
    // LCD SPI init (gfx->begin), not in the IO expander or power supply.
    beep(120);

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

    // Display — retry up to 5 times with increasing delays between attempts.
    // On 12 V power the 3.3 V rail settles slowly; gfx->begin() can return
    // false on first call but succeed once the rail is stable.
    bool disp_ok = false;
    for (int attempt = 1; attempt <= 5; attempt++) {
        if (gfx->begin()) {
            Serial.printf("[DISP] OK (attempt %d)\n", attempt);
            disp_ok = true;
            break;
        }
        Serial.printf("[DISP] begin() failed, attempt %d/5\n", attempt);
        // Re-pulse LCD_RST and wait longer on each retry
        int rst_wait = 500 + attempt * 200;   // 700, 900, 1100, 1300 ms
        if (s_board_rev == BOARD_REV3) {
            s_io_out &= ~(1u << TCA_BIT_LCD_RST);
            tca_write(TCA_REG_OUT, s_io_out); delay(20);
            s_io_out |=  (1u << TCA_BIT_LCD_RST);
            tca_write(TCA_REG_OUT, s_io_out); delay(rst_wait);
        } else if (s_board_rev == BOARD_REV4) {
            s_io_out &= ~(1u << CH32_BIT_LCD_RST);
            ch32_write(CH32_REG_OUT, s_io_out); delay(20);
            s_io_out |=  (1u << CH32_BIT_LCD_RST);
            ch32_write(CH32_REG_OUT, s_io_out); delay(rst_wait);
        }
        // Single pip beep per retry so we can count attempts
        beep(60);
    }
    if (!disp_ok) {
        // Three long beeps = all retries exhausted, display dead
        Serial.println("[DISP] FAILED all attempts");
        beep(400); beep(400); beep(400);
    }

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

    // Two short beeps = app is fully loaded and running.
    // Diagnostic: 1 beep = hardware OK, app failed; 2 beeps = all good.
    beep(80); beep(80);

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
