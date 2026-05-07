#pragma once
// Light-mode palette — optimised for direct sunlight readability.
// All accent / alarm colours are darkened compared to the original dark-mode
// values so they remain vivid against a white background.
#define COL_BG    0xEEF1F5   // light grey page background
#define COL_SEC   0xFFFFFF   // white section cards / headers
#define COL_LABEL 0x44577A   // dark blue-grey  — units, sub-labels
#define COL_VALUE 0x0D1B2A   // near-black navy — primary value text
#define COL_GOOD  0x18A030   // darker green    (readable on white)
#define COL_WARN  0xD98000   // darker amber    (readable on white)
#define COL_ALARM 0xCC2200   // darker red      (readable on white)
#define COL_MUTED 0x9AAFBE   // medium blue-grey — stale / --- placeholders
#define COL_NAV   0x1A5FCC   // vivid blue accent
#define COL_ENG   0x198A35   // vivid green accent
#define COL_ELEC  0xB86818   // vivid amber accent
#define COL_DIV   0xC0CCDA   // light divider lines / chart grid
