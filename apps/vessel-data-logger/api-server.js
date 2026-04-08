import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';

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
    this.app.get('/api/config/logged-paths', (req, res) => this.handleGetLoggedPaths(req, res));
    this.app.post('/api/config', (req, res) => this.handlePostConfig(req, res));
    this.app.get('/api/paths', (req, res) => this.handleGetPaths(req, res));
    this.app.get('/api/paths/prefixes', (req, res) => this.handleGetPathPrefixes(req, res));
    this.app.get('/api/status', (req, res) => this.handleStatus(req, res));
    this.app.get('/api/events/stream', (req, res) => this.handleSSE(req, res));
    this.app.get('/api/events/query', (req, res) => this.handleEventsQuery(req, res));
    this.app.get('/api/events/recent', (req, res) => this.handleRecentEvents(req, res));
    this.app.get('/api/events/states', (req, res) => this.handleEventStates(req, res));
    this.app.get('/api/openapi.json', (req, res) => this.handleOpenAPI(req, res));
    
    // Swagger UI for API documentation
    this.app.use('/api/docs', swaggerUi.serve, (req, res, next) => {
      const spec = this.getOpenAPISpec();
      swaggerUi.setup(spec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Vessel Data Logger API'
      })(req, res, next);
    });
  }

  handleSnapshot(req, res) {
    try {
      const { prefix, paths } = req.query;
      let data = this.cache.getAll();
      
      // Filter by prefix if provided
      if (prefix) {
        const filtered = {};
        for (const [path, value] of Object.entries(data)) {
          if (path.startsWith(prefix)) {
            filtered[path] = value;
          }
        }
        data = filtered;
      }
      
      // Filter by specific paths if provided (comma-separated)
      if (paths) {
        const pathArray = paths.split(',').map(p => p.trim());
        const filtered = {};
        for (const path of pathArray) {
          if (data[path]) {
            filtered[path] = data[path];
          }
        }
        data = filtered;
      }
      
      res.json({
        timestamp: new Date().toISOString(),
        count: Object.keys(data).length,
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

  handleGetLoggedPaths(req, res) {
    try {
      const config = this.configManager.config;
      const paths = config.subscriptions
        .filter(sub => sub.enabled)
        .map(sub => sub.path);
      
      res.json({
        count: paths.length,
        paths
      });
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

  async handleGetPathPrefixes(req, res) {
    try {
      const signalkHost = process.env.SIGNALK_HOST || 'localhost';
      const signalkPort = process.env.SIGNALK_PORT || 3000;
      const apiUrl = `http://${signalkHost}:${signalkPort}/signalk/v1/api/vessels/self`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`SignalK API returned ${response.status}`);
      }

      const data = await response.json();
      const paths = this.extractPaths(data);
      
      // Extract unique prefixes (up to 2 or 3 levels deep)
      const prefixSet = new Set();
      
      for (const pathObj of paths) {
        const path = pathObj.path;
        const parts = path.split('.');
        
        // Add prefixes: first segment, first two segments, first three segments
        if (parts.length >= 1) prefixSet.add(parts[0]);
        if (parts.length >= 2) prefixSet.add(parts.slice(0, 2).join('.'));
        if (parts.length >= 3) prefixSet.add(parts.slice(0, 3).join('.'));
      }
      
      const prefixes = Array.from(prefixSet).sort();
      
      res.json({
        count: prefixes.length,
        prefixes
      });
    } catch (error) {
      console.error('Failed to fetch path prefixes:', error);
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

  getOpenAPISpec() {
    return {
        openapi: '3.0.0',
        info: {
          title: 'Vessel Data Logger API',
          version: '1.0.0',
          description: 'SignalK data logging with cloud storage, historical queries, and real-time snapshots',
          contact: {
            name: 'M/Y Becoming',
          }
        },
        servers: [
          {
            url: '/data-logger',
            description: 'Vessel Data Logger (proxied via nginx)'
          },
          {
            url: 'http://localhost:3200',
            description: 'Direct access (development)'
          }
        ],
        tags: [
          { name: 'Snapshot', description: 'Real-time cached data queries' },
          { name: 'History', description: 'Historical time-series queries' },
          { name: 'Configuration', description: 'Logging configuration management' },
          { name: 'Discovery', description: 'Path and service discovery' },
          { name: 'Events', description: 'Event detection and queries' },
          { name: 'System', description: 'System status and health' }
        ],
        paths: {
          '/api/snapshot': {
            get: {
              tags: ['Snapshot'],
              summary: 'Get current snapshot',
              description: 'Returns latest cached values for all logged SignalK paths. Supports filtering by prefix or specific paths.',
              operationId: 'getSnapshot',
              parameters: [
                {
                  name: 'prefix',
                  in: 'query',
                  description: 'Filter paths by prefix (e.g., "propulsion.port")',
                  required: false,
                  schema: { type: 'string' },
                  example: 'propulsion.port'
                },
                {
                  name: 'paths',
                  in: 'query',
                  description: 'Comma-separated list of specific paths',
                  required: false,
                  schema: { type: 'string' },
                  example: 'navigation.position,navigation.speedOverGround'
                }
              ],
              responses: {
                '200': {
                  description: 'Snapshot data',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          timestamp: { type: 'string', format: 'date-time' },
                          count: { type: 'integer' },
                          data: {
                            type: 'object',
                            additionalProperties: {
                              type: 'object',
                              properties: {
                                value: { oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'object' }] },
                                timestamp: { type: 'string', format: 'date-time' },
                                source: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '/api/snapshot/{path}': {
            get: {
              tags: ['Snapshot'],
              summary: 'Get snapshot for specific path',
              description: 'Returns latest cached value for a specific SignalK path',
              operationId: 'getSnapshotPath',
              parameters: [
                {
                  name: 'path',
                  in: 'path',
                  required: true,
                  description: 'SignalK path (e.g., navigation.position)',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { description: 'Path value' },
                '404': { description: 'Path not found or data is stale' }
              }
            }
          },
          '/api/config/logged-paths': {
            get: {
              tags: ['Discovery'],
              summary: 'Get logged paths',
              description: 'Returns array of all currently enabled/logged SignalK paths',
              operationId: 'getLoggedPaths',
              responses: {
                '200': {
                  description: 'Array of logged paths',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          count: { type: 'integer' },
                          paths: {
                            type: 'array',
                            items: { type: 'string' }
                          }
                        }
                      },
                      example: {
                        count: 8,
                        paths: ['navigation.position', 'propulsion.port.revolutions', 'electrical.batteries.0.capacity.stateOfCharge']
                      }
                    }
                  }
                }
              }
            }
          },
          '/api/paths/prefixes': {
            get: {
              tags: ['Discovery'],
              summary: 'Get path prefixes',
              description: 'Returns unique path prefixes (domains) available in SignalK. Useful for discovering data categories.',
              operationId: 'getPathPrefixes',
              responses: {
                '200': {
                  description: 'Array of path prefixes',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          count: { type: 'integer' },
                          prefixes: {
                            type: 'array',
                            items: { type: 'string' }
                          }
                        }
                      },
                      example: {
                        count: 45,
                        prefixes: ['navigation', 'navigation.position', 'propulsion', 'propulsion.port', 'electrical', 'electrical.batteries.0']
                      }
                    }
                  }
                }
              }
            }
          },
          '/api/history': {
            get: {
              tags: ['History'],
              summary: 'Query historical data',
              description: 'Returns time-series data for one or more paths. Supports nested object properties (e.g., navigation.position.longitude).',
              operationId: 'getHistory',
              parameters: [
                {
                  name: 'path',
                  in: 'query',
                  required: true,
                  description: 'SignalK path or comma-separated paths',
                  schema: { type: 'string' },
                  example: 'navigation.position.longitude,navigation.position.latitude'
                },
                {
                  name: 'start',
                  in: 'query',
                  required: true,
                  description: 'Start time (ISO 8601)',
                  schema: { type: 'string', format: 'date-time' }
                },
                {
                  name: 'end',
                  in: 'query',
                  required: true,
                  description: 'End time (ISO 8601)',
                  schema: { type: 'string', format: 'date-time' }
                },
                {
                  name: 'limit',
                  in: 'query',
                  required: false,
                  description: 'Maximum number of data points (default: 1000, max: 10000)',
                  schema: { type: 'integer', default: 1000, maximum: 10000 }
                }
              ],
              responses: {
                '200': { description: 'Historical data' },
                '400': { description: 'Missing required parameters' }
              }
            }
          },
          '/api/status': {
            get: {
              tags: ['System'],
              summary: 'Get system status',
              description: 'Returns health status of all components (SignalK connection, MongoDB, cache)',
              operationId: 'getStatus',
              responses: {
                '200': {
                  description: 'System status',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          uptime: { type: 'integer', description: 'Uptime in seconds' },
                          signalk: {
                            type: 'object',
                            properties: {
                              connected: { type: 'boolean' },
                              url: { type: 'string' },
                              subscriptions: { type: 'integer' }
                            }
                          },
                          mongodb: {
                            type: 'object',
                            properties: {
                              connected: { type: 'boolean' }
                            }
                          },
                          cache: {
                            type: 'object',
                            properties: {
                              entries: { type: 'integer' },
                              maxEntries: { type: 'integer' },
                              ttlSeconds: { type: 'integer' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
    };
  }

  handleOpenAPI(req, res) {
    try {
      const spec = this.getOpenAPISpec();
      res.json(spec);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
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
