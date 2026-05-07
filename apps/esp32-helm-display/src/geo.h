#pragma once
#include <math.h>

// ── Great-circle distance (Haversine) ────────────────────────────────────────
// Returns distance in metres between two WGS-84 positions.
static inline float haversine_m(double lat1, double lon1,
                                 double lat2, double lon2) {
    const double R = 6371000.0;
    double dlat = (lat2 - lat1) * M_PI / 180.0;
    double dlon = (lon2 - lon1) * M_PI / 180.0;
    double a = sin(dlat / 2) * sin(dlat / 2)
             + cos(lat1 * M_PI / 180.0) * cos(lat2 * M_PI / 180.0)
             * sin(dlon / 2) * sin(dlon / 2);
    return (float)(R * 2.0 * atan2(sqrt(a), sqrt(1.0 - a)));
}

// ── Initial bearing from point 1 → point 2 (°T, 0–360) ──────────────────────
static inline float bearing_deg_to(double lat1, double lon1,
                                    double lat2, double lon2) {
    double dlon = (lon2 - lon1) * M_PI / 180.0;
    double y = sin(dlon) * cos(lat2 * M_PI / 180.0);
    double x = cos(lat1 * M_PI / 180.0) * sin(lat2 * M_PI / 180.0)
             - sin(lat1 * M_PI / 180.0) * cos(lat2 * M_PI / 180.0) * cos(dlon);
    float b = (float)(atan2(y, x) * 180.0 / M_PI);
    return fmodf(b + 360.0f, 360.0f);
}

// ── Dead-reckoning: move (lat, lon) by dist_m at hdg_deg ─────────────────────
// Used to compute anchor position from boat position + bow heading + chain length.
static inline void move_point(double lat, double lon,
                               float hdg_deg, float dist_m,
                               double& out_lat, double& out_lon) {
    const double R = 6371000.0;
    double d    = dist_m / R;
    double b    = hdg_deg * M_PI / 180.0;
    double lat1 = lat * M_PI / 180.0;
    double lon1 = lon * M_PI / 180.0;
    double lat2 = asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(b));
    double lon2 = lon1 + atan2(sin(b) * sin(d) * cos(lat1),
                                cos(d) - sin(lat1) * sin(lat2));
    out_lat = lat2 * 180.0 / M_PI;
    out_lon = lon2 * 180.0 / M_PI;
}
