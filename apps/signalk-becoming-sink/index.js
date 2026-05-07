/*
 * signalk-becoming-sink
 *
 * General-purpose bridge plugin for the M/Y Becoming boat apps.
 *
 * Starts a small unauthenticated HTTP server (default port 3101) on the
 * internal network.  Any trusted app POSTs a path + value and the plugin
 * injects it into the SignalK data model via app.handleMessage(), making
 * the data available at the standard REST API and broadcast to all
 * WebSocket subscribers.
 *
 * POST http://becoming-hub:3101/update
 *   Single: { "path": "helm_mfd.anchor", "value": { ... } }
 *   Batch:  { "updates": [ { "path": "...", "value": ... }, ... ] }
 *   Response: { "ok": true, "count": N }
 *
 * GET http://becoming-hub:3101/value?path=helm_mfd.anchor
 *   Response: { "path": "...", "value": ... }   or  404
 *
 * After a POST the data is also accessible via the standard SignalK REST API:
 *   GET http://becoming-hub:3100/signalk/v1/api/vessels/self/helm_mfd/anchor
 */

'use strict';

const http = require('http');
const url  = require('url');

const DEFAULT_PORT = 3101;

module.exports = function (app) {
  const plugin = {
    id: 'becoming-sink',
    name: 'Becoming Apps SignalK Sink',
    description:
      'Unauthenticated internal HTTP bridge — accepts data from Becoming boat apps and publishes to the SignalK data model'
  };

  plugin.schema = {
    title: 'Becoming Apps SignalK Sink',
    type: 'object',
    properties: {
      port: {
        type: 'number',
        title: 'Listener port (internal network only, no auth)',
        default: DEFAULT_PORT
      }
    }
  };

  let server = null;

  plugin.start = function (options) {
    const port = (options && options.port) ? options.port : DEFAULT_PORT;

    server = http.createServer((req, res) => {
      const parsed  = url.parse(req.url, true);
      const method  = req.method;
      const path    = parsed.pathname;

      res.setHeader('Content-Type', 'application/json');

      // ── POST /update ──────────────────────────────────────────────────────
      if (method === 'POST' && path === '/update') {
        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
          let body;
          try { body = JSON.parse(raw); }
          catch (_) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'invalid JSON' }));
          }

          let values = [];
          if (Array.isArray(body.updates)) {
            for (const u of body.updates) {
              if (u.path !== undefined && u.value !== undefined)
                values.push({ path: u.path, value: u.value });
            }
          } else if (body.path !== undefined && body.value !== undefined) {
            values.push({ path: body.path, value: body.value });
          }

          if (values.length === 0) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'no valid updates found' }));
          }

          app.handleMessage(plugin.id, { updates: [{ values }] });
          app.debug('sink update: %j', values);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, count: values.length }));
        });
        return;
      }

      // ── GET /value?path=<path> ────────────────────────────────────────────
      if (method === 'GET' && path === '/value') {
        const skPath = parsed.query.path;
        if (!skPath) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'missing ?path= param' }));
        }
        const val = app.getSelfPath(skPath);
        if (val === undefined || val === null) {
          res.writeHead(404);
          return res.end(JSON.stringify({ error: 'not found', path: skPath }));
        }
        res.writeHead(200);
        return res.end(JSON.stringify({ path: skPath, value: val }));
      }

      // ── 404 ───────────────────────────────────────────────────────────────
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    });

    server.listen(port, () => {
      app.debug(`becoming-sink listening on port ${port}`);
      app.setProviderStatus(`Listening on :${port}`);
    });

    server.on('error', err => {
      app.setProviderError(`Port ${port} error: ${err.message}`);
    });
  };

  plugin.stop = function () {
    if (server) {
      server.close();
      server = null;
    }
  };

  return plugin;
};
