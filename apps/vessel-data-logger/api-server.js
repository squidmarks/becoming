import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ApiServer {
  constructor(port, cache, storage, configManager, signalkClient, eventDetector) {
    this.port = port;
    this.cache = cache;
    this.storage = storage;
    this.configManager = configManager;
    this.signalkClient = signalkClient;
    this.eventDetector = eventDetector;
    this.app = express();
    this.server = null;
    this.sseClients = [];
    this.startTime = Date.now();

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    this.app.get('/api/snapshot', (req, res) => this.handleSnapshot(req, res));
    this.app.get('/api/snapshot/:path(*)', (req, res) => this.handleSnapshotPath(req, res));
    this.app.get('/api/history', (req, res) => this.handleHistory(req, res));
    this.app.get('/api/history/aggregate', (req, res) => this.handleAggregate(req, res));
    this.app.get('/api/config', (req, res) => this.handleGetConfig(req, res));
    this.app.post('/api/config', (req, res) => this.handlePostConfig(req, res));
    this.app.get('/api/paths', (req, res) => this.handleGetPaths(req, res));
    this.app.get('/api/status', (req, res) => this.handleStatus(req, res));
    this.app.get('/api/events/stream', (req, res) => this.handleSSE(req, res));
    this.app.get('/api/events/query', (req, res) => this.handleEventsQuery(req, res));
    this.app.get('/api/events/recent', (req, res) => this.handleRecentEvents(req, res));
    this.app.get('/api/events/states', (req, res) => this.handleEventStates(req, res));
  }

  handleSnapshot(req, res) {
    try {
      const data = this.cache.getAll();
      res.json({
        timestamp: new Date().toISOString(),
        data
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handleSnapshotPath(req, res) {
    try {
      const pathParam = req.params.path;
      const entry = this.cache.get(pathParam);
      
      if (!entry) {
        return res.status(404).json({ error: 'Path not found or data is stale' });
      }

      res.json({
        path: pathParam,
        value: entry.value,
        timestamp: entry.timestamp,
        source: entry.source
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleHistory(req, res) {
    try {
      const { path: pathParam, start, end, limit, downsample } = req.query;

      if (!pathParam || !start || !end) {
        return res.status(400).json({ error: 'Missing required parameters: path, start, end' });
      }

      const paths = pathParam.split(',').map(p => p.trim());
      const limitNum = Math.min(parseInt(limit) || 1000, 10000);

      let data;
      if (paths.length === 1) {
        data = await this.storage.query(paths[0], start, end, limitNum);
        
        if (downsample) {
          const bucketSeconds = parseInt(downsample);
          if (!isNaN(bucketSeconds) && bucketSeconds > 0) {
            const aggregated = await this.storage.aggregate(paths[0], start, end, bucketSeconds);
            return res.json({
              path: paths[0],
              start,
              end,
              downsampled: true,
              bucketSeconds,
              count: aggregated.length,
              data: aggregated
            });
          }
        }

        res.json({
          path: paths[0],
          start,
          end,
          count: data.length,
          data
        });
      } else {
        data = await this.storage.queryMultiple(paths, start, end, limitNum);
        res.json({
          paths,
          start,
          end,
          data
        });
      }
    } catch (error) {
      console.error('History query error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async handleAggregate(req, res) {
    try {
      const { path, start, end, bucket, functions } = req.query;

      if (!path || !start || !end || !bucket) {
        return res.status(400).json({ error: 'Missing required parameters: path, start, end, bucket' });
      }

      const bucketSeconds = this.parseBucket(bucket);
      if (!bucketSeconds) {
        return res.status(400).json({ error: 'Invalid bucket format. Use format like "5m", "1h", "1d"' });
      }

      const data = await this.storage.aggregate(path, start, end, bucketSeconds);

      res.json({
        path,
        start,
        end,
        bucket,
        bucketSeconds,
        count: data.length,
        data
      });
    } catch (error) {
      console.error('Aggregate query error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  parseBucket(bucket) {
    const match = bucket.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }

  handleGetConfig(req, res) {
    try {
      res.json(this.configManager.config);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handlePostConfig(req, res) {
    try {
      const newConfig = req.body;
      
      if (!newConfig.subscriptions || !Array.isArray(newConfig.subscriptions)) {
        return res.status(400).json({ error: 'Invalid config format' });
      }

      this.configManager.save(newConfig);
      res.json({ success: true, message: 'Configuration updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetPaths(req, res) {
    try {
      const { filter, limit } = req.query;
      const limitNum = Math.min(parseInt(limit) || 100, 1000);

      const signalkHost = process.env.SIGNALK_HOST || 'localhost';
      const signalkPort = process.env.SIGNALK_PORT || 3000;
      const apiUrl = `http://${signalkHost}:${signalkPort}/signalk/v1/api/vessels/self`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`SignalK API returned ${response.status}`);
      }

      const data = await response.json();
      const paths = this.extractPaths(data);

      let filteredPaths = paths;
      if (filter) {
        filteredPaths = paths.filter(p => p.path.startsWith(filter));
      }

      const limitedPaths = filteredPaths.slice(0, limitNum);

      res.json({
        count: limitedPaths.length,
        total: filteredPaths.length,
        paths: limitedPaths
      });
    } catch (error) {
      console.error('Failed to fetch paths from SignalK:', error);
      res.status(500).json({ error: error.message });
    }
  }

  extractPaths(obj, prefix = '', results = []) {
    for (const key in obj) {
      if (key === 'value' && 'timestamp' in obj) {
        const path = prefix.slice(0, -1);
        const value = obj.value;
        
        // Add the main path
        results.push({
          path,
          currentValue: value,
          lastUpdate: obj.timestamp,
          source: obj.$source || obj.source || 'unknown',
          meta: obj.meta || {}
        });
        
        // If value is an object with scalar properties, also add nested paths
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const nestedKey in value) {
            const nestedValue = value[nestedKey];
            // Only add nested paths for scalar values (numbers, strings, booleans)
            if (typeof nestedValue !== 'object' || nestedValue === null) {
              results.push({
                path: `${path}.${nestedKey}`,
                currentValue: nestedValue,
                lastUpdate: obj.timestamp,
                source: obj.$source || obj.source || 'unknown',
                meta: obj.meta || {},
                isNested: true,
                parentPath: path
              });
            }
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.extractPaths(obj[key], `${prefix}${key}.`, results);
      }
    }
    return results;
  }

  async handleStatus(req, res) {
    try {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const mongoStats = await this.storage.getStats();

      res.json({
        uptime,
        signalk: {
          connected: this.signalkClient.connected,
          url: this.signalkClient.url,
          subscriptions: this.signalkClient.subscriptions.length
        },
        mongodb: {
          connected: this.storage.connected,
          ...(mongoStats || {})
        },
        cache: this.cache.stats()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleEventsQuery(req, res) {
    try {
      const { start, end, name, limit } = req.query;

      if (!start || !end) {
        return res.status(400).json({ error: 'Missing required parameters: start, end' });
      }

      const limitNum = Math.min(parseInt(limit) || 1000, 10000);
      const events = await this.storage.queryEvents(start, end, name || null, limitNum);

      res.json({
        start,
        end,
        name: name || 'all',
        count: events.length,
        events
      });
    } catch (error) {
      console.error('Events query error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async handleRecentEvents(req, res) {
    try {
      const { limit } = req.query;
      const limitNum = Math.min(parseInt(limit) || 50, 500);
      
      const events = await this.storage.getRecentEvents(limitNum);
      
      res.json({
        count: events.length,
        events
      });
    } catch (error) {
      console.error('Recent events query error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  handleEventStates(req, res) {
    try {
      const states = this.eventDetector.getAllEventStates();
      res.json({ states });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  handleSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now();
    const client = { id: clientId, res };
    this.sseClients.push(client);

    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    req.on('close', () => {
      this.sseClients = this.sseClients.filter(c => c.id !== clientId);
    });
  }

  broadcastSSE(event, data) {
    const message = `data: ${JSON.stringify({ type: event, data })}\n\n`;
    this.sseClients.forEach(client => {
      try {
        client.res.write(message);
      } catch (error) {
        console.error('Failed to send SSE to client:', error.message);
      }
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`✓ API server listening on port ${this.port}`);
        console.log(`  Web UI: http://localhost:${this.port}/`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('✓ API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
