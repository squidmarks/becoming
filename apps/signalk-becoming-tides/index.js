'use strict';

/*
 * signalk-becoming-tides
 *
 * Periodically fetches NOAA CO-OPS tide predictions for the nearest tide
 * station and publishes them to the SignalK data model via app.handleMessage().
 *
 * No API key required.  US coastal waters only.
 *
 * Paths published (values in SI units — meters):
 *   environment.tide.station        string  — name of the nearest NOAA station
 *   environment.tide.heightNow      number  — interpolated current height (m)
 *   environment.tide.state          string  — "rising" or "falling" (backward-compat)
 *   environment.tide.phase          string  — "flood" | "slack_high" | "ebb" | "slack_low"
 *   environment.tide.nextHighTime   string  — local time string "H:MMa/p"
 *   environment.tide.nextHighHeight number  — next high tide height (m)
 *   environment.tide.nextLowTime    string  — local time string "H:MMa/p"
 *   environment.tide.nextLowHeight  number  — next low tide height (m)
 *
 * Accessible after publish at:
 *   GET http://becoming-hub:3100/signalk/v1/api/vessels/self/environment/tide/...
 */

const https = require('https');

const NOAA_STATIONS_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const NOAA_API_BASE     = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const FT_TO_M           = 0.3048;

// ── Utilities ──────────────────────────────────────────────────────────────────

function distNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fetch a URL, parse JSON, reject on non-200 or parse error.
// NOAA returns times like "2026-05-08 14:30" — replace the space with T before
// passing to new Date() so it parses correctly as local time.
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('NOAA request timed out')); });
  });
}

// Convert "2026-05-08 14:30" → "2:30p"  (12-hour local)
function fmt12h(noaaTimeStr) {
  const parts = noaaTimeStr.trim().split(' ');
  const hhmm  = parts[parts.length - 1];   // "14:30"
  const [hh, mm] = hhmm.split(':').map(Number);
  const h      = hh % 12 || 12;
  const suffix = hh < 12 ? 'a' : 'p';
  return `${h}:${String(mm).padStart(2, '0')}${suffix}`;
}

// Build today+tomorrow date range in YYYYMMDD format.
function dateRange() {
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = d =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `begin_date=${fmt(today)}&end_date=${fmt(tomorrow)}`;
}

// Derive a four-phase tide description from height fraction within the cycle.
//   slack thresholds: top/bottom 10% of range → slack high / slack low
//   otherwise: flood (rising) or ebb (falling)
function tidePhase(heightM, nextHighM, nextLowM, rising) {
  if (heightM == null || nextHighM == null || nextLowM == null) {
    return rising ? 'flood' : 'ebb';
  }
  const lo    = Math.min(nextLowM, nextHighM);
  const hi    = Math.max(nextLowM, nextHighM);
  const range = hi - lo;
  const frac  = range > 0.05 ? (heightM - lo) / range : 0.5;
  if (frac >= 0.90) return 'slack_high';
  if (frac <= 0.10) return 'slack_low';
  return rising ? 'flood' : 'ebb';
}

// ── Main plugin ───────────────────────────────────────────────────────────────

module.exports = function (app) {
  const plugin = {
    id:          'becoming-tides',
    name:        'Becoming Tides',
    description: 'Fetches NOAA tide predictions for the nearest tide station and publishes to SignalK'
  };

  plugin.schema = {
    title: 'Becoming Tides',
    type: 'object',
    properties: {
      pollIntervalMin: {
        type: 'number',
        title: 'Poll interval (minutes)',
        default: 15
      },
      restationDistNm: {
        type: 'number',
        title: 'Re-search station if boat moves this many nm',
        default: 20
      }
    }
  };

  let pollTimer        = null;
  let stationsCache    = null;   // full NOAA station list — fetched once per session
  let stationId        = null;
  let stationName      = null;
  let lastLat          = null;
  let lastLon          = null;
  let pluginOpts       = {};

  // ── Station discovery ──────────────────────────────────────────────────────

  async function loadStations() {
    if (stationsCache) return stationsCache;
    app.debug('Fetching NOAA tide station list (~500 KB, once per session)...');
    const data = await fetchJson(NOAA_STATIONS_URL);
    stationsCache = data.stations || [];
    app.debug(`Loaded ${stationsCache.length} tide prediction stations`);
    return stationsCache;
  }

  async function findNearest(lat, lon) {
    const stations = await loadStations();
    let best = null, bestDist = Infinity;
    for (const s of stations) {
      const sLat = parseFloat(s.lat);
      const sLon = parseFloat(s.lng);
      if (isNaN(sLat) || isNaN(sLon)) continue;
      const d = distNm(lat, lon, sLat, sLon);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return { station: best, distNm: bestDist };
  }

  // ── Tide fetch ────────────────────────────────────────────────────────────

  async function fetchTides(sid) {
    const base = `${NOAA_API_BASE}?station=${sid}&datum=MLLW&time_zone=lst_ldt` +
                 `&units=english&application=becoming_mfd&format=json`;
    const dr   = dateRange();

    const [hiloData, hourlyData] = await Promise.all([
      fetchJson(`${base}&product=predictions&interval=hilo&${dr}`),
      fetchJson(`${base}&product=predictions&interval=h&${dr}`)
    ]);

    const now = new Date();

    // Next high and low after "now"
    const hilo = hiloData.predictions || [];
    let nextHigh = null, nextLow = null;
    for (const p of hilo) {
      const t = new Date(p.t.replace(' ', 'T'));
      if (t <= now) continue;
      if (p.type === 'H' && !nextHigh) nextHigh = p;
      if (p.type === 'L' && !nextLow)  nextLow  = p;
      if (nextHigh && nextLow) break;
    }

    // Current height: linear interpolation between the two hourly points
    // bracketing "now"; rising/falling from the slope.
    const hourly = hourlyData.predictions || [];
    let before = null, after = null;
    for (const p of hourly) {
      const t = new Date(p.t.replace(' ', 'T'));
      if (t <= now) before = p;
      else if (!after) { after = p; break; }
    }

    let heightFt = NaN;
    let rising   = true;
    if (before && after) {
      const t0   = new Date(before.t.replace(' ', 'T')).getTime();
      const t1   = new Date(after.t.replace(' ', 'T')).getTime();
      const frac = (now.getTime() - t0) / (t1 - t0);
      const v0   = parseFloat(before.v), v1 = parseFloat(after.v);
      heightFt = v0 + frac * (v1 - v0);
      rising   = v1 > v0;
    } else if (before) {
      heightFt   = parseFloat(before.v);
      const idx  = hourly.indexOf(before);
      if (idx > 0) rising = parseFloat(before.v) > parseFloat(hourly[idx - 1].v);
    }

    return {
      heightM:       isNaN(heightFt)          ? null : heightFt               * FT_TO_M,
      rising,
      nextHighTimeStr: nextHigh               ? fmt12h(nextHigh.t)            : null,
      nextHighM:       nextHigh               ? parseFloat(nextHigh.v) * FT_TO_M : null,
      nextLowTimeStr:  nextLow                ? fmt12h(nextLow.t)             : null,
      nextLowM:        nextLow                ? parseFloat(nextLow.v)  * FT_TO_M : null,
    };
  }

  // ── Publish to SignalK ────────────────────────────────────────────────────

  function publish(tides, name) {
    const phase = tidePhase(tides.heightM, tides.nextHighM, tides.nextLowM, tides.rising);

    const values = [];
    if (name)                     values.push({ path: 'environment.tide.station',        value: name });
    if (tides.heightM !== null)   values.push({ path: 'environment.tide.heightNow',      value: tides.heightM });
    // state: "rising"/"falling" — kept for backward compatibility with existing MFD firmware
    values.push(                               { path: 'environment.tide.state',          value: tides.rising ? 'rising' : 'falling' });
    // phase: four-value nautical description
    values.push(                               { path: 'environment.tide.phase',          value: phase });
    if (tides.nextHighTimeStr)    values.push({ path: 'environment.tide.nextHighTime',   value: tides.nextHighTimeStr });
    if (tides.nextHighM !== null) values.push({ path: 'environment.tide.nextHighHeight', value: tides.nextHighM });
    if (tides.nextLowTimeStr)     values.push({ path: 'environment.tide.nextLowTime',    value: tides.nextLowTimeStr });
    if (tides.nextLowM !== null)  values.push({ path: 'environment.tide.nextLowHeight',  value: tides.nextLowM });

    if (values.length > 0) {
      app.handleMessage(plugin.id, { updates: [{ values }] });
      app.debug(`Tide published: ${phase} (${tides.rising ? 'rising' : 'falling'}) ` +
                `${tides.heightM != null ? (tides.heightM * 3.28084).toFixed(1) + 'ft' : '?'} ` +
                `| next HI ${tides.nextHighTimeStr || '?'} ` +
                `| next LO ${tides.nextLowTimeStr || '?'}`);
    }
  }

  // ── Main poll ─────────────────────────────────────────────────────────────

  async function poll() {
    // getSelfPath() may return the value directly or wrapped in {value: ...}
    // depending on SignalK version and path type — handle both.
    const posRaw = app.getSelfPath('navigation.position');
    if (!posRaw) {
      app.debug('No position fix — skipping tide fetch');
      return;
    }
    const posVal = (posRaw && posRaw.value !== undefined) ? posRaw.value : posRaw;
    const lat = posVal && posVal.latitude;
    const lon = posVal && posVal.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      app.debug(`Position not valid: ${JSON.stringify(posRaw)}`);
      return;
    }

    const restationDist = pluginOpts.restationDistNm || 20;
    const moved = lastLat !== null && distNm(lat, lon, lastLat, lastLon) > restationDist;

    if (!stationId || moved) {
      app.debug(`Finding nearest tide station (${lat.toFixed(4)}, ${lon.toFixed(4)})…`);
      const { station, distNm: d } = await findNearest(lat, lon);
      if (!station) {
        if (app.setPluginError) app.setPluginError('No NOAA tide station found');
        else app.setProviderError('No NOAA tide station found');
        return;
      }
      stationId   = station.id;
      stationName = station.name;
      lastLat     = lat;
      lastLon     = lon;
      if (app.setPluginStatus) app.setPluginStatus(`${station.name} (${d.toFixed(1)} nm away)`);
      else app.setProviderStatus(`${station.name} (${d.toFixed(1)} nm away)`);
      app.debug(`Tide station: ${station.name} id=${station.id} dist=${d.toFixed(1)}nm`);
    }

    const tides = await fetchTides(stationId);
    publish(tides, stationName);
  }

  // ── Plugin lifecycle ──────────────────────────────────────────────────────

  plugin.start = function (options) {
    pluginOpts = options || {};
    const intervalMs = ((options && options.pollIntervalMin) || 15) * 60 * 1000;

    if (app.setPluginStatus) app.setPluginStatus('Starting…');
    else     if (app.setPluginStatus) app.setPluginStatus('Starting — waiting for GPS…');
    else app.setProviderStatus('Starting — waiting for GPS…');
    // Delay initial poll by 30 s so NMEA2000 data has time to flow in after
    // SignalK starts; subsequent polls use the regular interval.
    setTimeout(() => {
      poll().catch(e => {
        const setErr = app.setPluginError || app.setProviderError;
        setErr(e.message);
        app.debug(e.stack || e);
      });
    }, 30000);

    pollTimer = setInterval(() => {
      poll().catch(e => {
        const setErr = app.setPluginError || app.setProviderError;
        setErr(e.message);
        app.debug(e.stack || e);
      });
    }, intervalMs);
  };

  plugin.stop = function () {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };

  return plugin;
};
