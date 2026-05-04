#pragma once

/**
 * Waveshare ESP32-S3-Touch-LCD-4  —  Pin Definitions
 *
 * Chip:    ESP32-S3-N16R8 (16 MB QIO flash, 8 MB OPI PSRAM)
 * Display: 480×480 IPS, ST7701S controller (3-wire SPI init + RGB parallel pixels)
 * Touch:   GT911 (I2C, INT on GPIO16 direct)
 * IO exp:  TCA9554PWR (I2C 0x20, shares I2C1 bus on V4 boards)
 *
 * Source: https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-4
 * Confirmed via official pin table and TWAI demo source code.
 */

// ── I2C bus (touch + IO expander + RTC, all share this bus on V4) ─────────────
#define PIN_I2C_SDA         15
#define PIN_I2C_SCL         7

// ── TCA9554PWR  IO expander (I2C 0x20) ───────────────────────────────────────
// Standard 8-bit GPIO expander.  Direction register: 0=output, 1=input.
#define TCA9554_ADDR        0x20
#define TCA9554_REG_INPUT      0x00   // Input port (read-only)
#define TCA9554_REG_OUTPUT     0x01   // Output port
#define TCA9554_REG_POLARITY   0x02   // Polarity inversion (unused)
#define TCA9554_REG_CONFIG     0x03   // Pin direction: 0=output, 1=input

// EXIO bit assignments (from Waveshare wiki pin table)
#define EXIO_TP_RST         0   // Touch reset (output, active LOW)
#define EXIO_BL_EN          1   // Backlight enable (output, HIGH=on)
#define EXIO_LCD_RST        2   // LCD reset (output, active LOW)
#define EXIO_SD_CS          3   // TF card chip select (output, active LOW)
#define EXIO_BLC            4   // Backlight control / PWM (output)
#define EXIO_BEE_EN         5   // Buzzer enable (output, HIGH=on)
#define EXIO_RTC_INT        6   // RTC interrupt (input, active LOW)
#define EXIO_DO1            7   // Spare / DO1 (input)

// Direction: EXIO6 and EXIO7 are inputs; all others are outputs.
// TCA9554: 1=input, 0=output (opposite of CH32V003)
#define TCA9554_DIR_MASK    0xC0   // 0b11000000 — bits 6 and 7 as inputs

// ── LCD (ST7701S — 3-wire SPI init + RGB parallel pixel data) ─────────────────
// 3-wire SPI for ST7701S initialisation commands
#define PIN_LCD_CS          42
#define PIN_LCD_SCK         2
#define PIN_LCD_MOSI        1
// LCD reset via TCA9554 EXIO_LCD_RST

// RGB parallel interface
#define PIN_LCD_DE          40
#define PIN_LCD_VSYNC       39
#define PIN_LCD_HSYNC       38
#define PIN_LCD_PCLK        41

// Red (R1–R5; R0 not connected)
#define PIN_LCD_R1          46
#define PIN_LCD_R2          3
#define PIN_LCD_R3          8
#define PIN_LCD_R4          18
#define PIN_LCD_R5          17

// Green (G0–G5)
#define PIN_LCD_G0          14
#define PIN_LCD_G1          13
#define PIN_LCD_G2          12
#define PIN_LCD_G3          11
#define PIN_LCD_G4          10
#define PIN_LCD_G5          9

// Blue (B1–B5; B0 not connected)
#define PIN_LCD_B1          5
#define PIN_LCD_B2          45
#define PIN_LCD_B3          48
#define PIN_LCD_B4          47
#define PIN_LCD_B5          21

// RGB timing parameters (from Waveshare sample code)
#define LCD_HSYNC_POL       1
#define LCD_HSYNC_FP        10
#define LCD_HSYNC_PW        8
#define LCD_HSYNC_BP        50
#define LCD_VSYNC_POL       1
#define LCD_VSYNC_FP        10
#define LCD_VSYNC_PW        8
#define LCD_VSYNC_BP        20

// ── Capacitive Touch (GT911) ──────────────────────────────────────────────────
// I2C address set during power-on reset by INT pin level:
//   INT low  → 0x5D  |  INT high → 0x14
#define TP_I2C_ADDR_PRIMARY   0x5D
#define TP_I2C_ADDR_SECONDARY 0x14

// INT pin is a direct GPIO (not through IO expander)
#define PIN_TP_INT          16   // Touch interrupt (input, active LOW)
// RST via TCA9554 EXIO_TP_RST

// ── CAN / NMEA2000 ────────────────────────────────────────────────────────────
// Confirmed from Waveshare TWAI demo: RX_PIN(0), TX_PIN(6)
#define PIN_CAN_RX          0
#define PIN_CAN_TX          6

// ── RS-485 ───────────────────────────────────────────────────────────────────
// Confirmed from Waveshare RS485 demo: Serial2(baud, cfg, RX=43, TX=44)
#define PIN_RS485_RX        43
#define PIN_RS485_TX        44

// ── TF Card (SPI) ─────────────────────────────────────────────────────────────
#define PIN_SD_MOSI         35
#define PIN_SD_MISO         36
#define PIN_SD_CLK          37
// CS via TCA9554 EXIO_SD_CS

// ── RTC (PCF85063A) ───────────────────────────────────────────────────────────
// Shares I2C bus. INT via TCA9554 EXIO_RTC_INT.
#define PCF85063_I2C_ADDR   0x51

// ── Display resolution ────────────────────────────────────────────────────────
#define LCD_WIDTH           480
#define LCD_HEIGHT          480
