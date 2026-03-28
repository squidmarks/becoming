import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WebServer {
  constructor(port = 3000, config = {}, modbusClient = null, modbusLock = null, powerLogger = null) {
    this.port = port;
    this.config = config;
    this.modbusClient = modbusClient;
    this.modbusLock = modbusLock;
    this.powerLogger = powerLogger;
    this.app = express();
    this.clients = new Set();
    this.latestData = null;
    
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    this.app.get('/api/data', (req, res) => {
      res.json(this.latestData || {});
    });

    this.app.get('/api/config', (req, res) => {
      res.json({
        batteryCapacityAh: this.config.BATTERY_CAPACITY_AH || 200,
        minBatterySoc: this.config.MIN_BATTERY_SOC || 20
      });
    });

    // Batch read settings for a category (much faster than individual reads)
    this.app.get('/api/settings/batch/:category', async (req, res) => {
      try {
        const category = req.params.category.toUpperCase();
        const { CONFIG_REGISTERS } = await import('./registers.js');
        const settings = CONFIG_REGISTERS[category];
        
        if (!settings) {
          return res.status(404).json({ error: 'Category not found' });
        }
        
        if (!this.modbusClient || !this.modbusClient.connected) {
          return res.status(503).json({ error: 'Modbus client not connected' });
        }
        
        // Acquire lock once for entire batch
        if (this.modbusLock) {
          await this.modbusLock.acquire(10000);
        }
        
        try {
          const results = {};
          
          // Filter out special types (like clock) that need dedicated endpoints
          const normalSettings = settings.filter(s => !s.special && s.type !== 'clock');
          
          if (normalSettings.length === 0) {
            return res.json({ category, settings: results });
          }
          
          // Check if addresses are contiguous (no gaps) for safe bulk read
          const addresses = normalSettings.map(s => s.address).sort((a, b) => a - b);
          const minAddr = addresses[0];
          const maxAddr = addresses[addresses.length - 1];
          const span = maxAddr - minAddr + 1;
          
          // Only bulk read if span is small AND all addresses are contiguous
          let isContiguous = true;
          if (span <= 30) {
            for (let i = 0; i < addresses.length - 1; i++) {
              if (addresses[i + 1] - addresses[i] !== 1) {
                isContiguous = false;
                break;
              }
            }
          }
          
          if (span <= 30 && isContiguous) {
            const values = await this.modbusClient.readRegisters(minAddr, span);
            
            // Map values back to settings
            for (const setting of normalSettings) {
              const offset = setting.address - minAddr;
              results[setting.key] = {
                value: values[offset],
                scaled: (values[offset] * setting.scale).toFixed(setting.scale < 1 ? 1 : 0),
                unit: setting.unit
              };
            }
          } else {
            // Address range is too large or non-contiguous, read individually with short delays
            for (const setting of normalSettings) {
              try {
                const values = await this.modbusClient.readRegisters(setting.address, 1);
                results[setting.key] = {
                  value: values[0],
                  scaled: (values[0] * setting.scale).toFixed(setting.scale < 1 ? 1 : 0),
                  unit: setting.unit
                };
              } catch (error) {
                // Register doesn't exist on this inverter model, mark as unavailable
                if (error.message.includes('Modbus exception 2') || error.message.includes('Illegal')) {
                  results[setting.key] = { unavailable: true };
                } else {
                  throw error;
                }
              }
              await new Promise(resolve => setTimeout(resolve, 150));
            }
          }
          
          res.json({ category, settings: results });
        } finally {
          if (this.modbusLock) {
            this.modbusLock.release();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Read inverter configuration register
    this.app.get('/api/settings/:address', async (req, res) => {
      try {
        const address = parseInt(req.params.address, 16);
        if (!this.modbusClient || !this.modbusClient.connected) {
          return res.status(503).json({ error: 'Modbus client not connected' });
        }
        
        // Acquire lock to prevent interference with polling
        if (this.modbusLock) {
          await this.modbusLock.acquire(5000);
        }
        
        try {
          const values = await this.modbusClient.readRegisters(address, 1);
          res.json({ address, value: values[0] });
        } finally {
          if (this.modbusLock) {
            this.modbusLock.release();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Write inverter configuration register
    this.app.post('/api/settings/:address', async (req, res) => {
      try {
        const address = parseInt(req.params.address, 16);
        const { value } = req.body;
        
        if (value === undefined || value === null) {
          return res.status(400).json({ error: 'Value is required' });
        }
        
        if (!this.modbusClient || !this.modbusClient.connected) {
          return res.status(503).json({ error: 'Modbus client not connected' });
        }
        
        // Acquire lock with longer timeout for write operations
        if (this.modbusLock) {
          await this.modbusLock.acquire(15000);
        }
        
        try {
          const result = await this.modbusClient.writeSingleRegister(address, value);
          // Give inverter time to process the write before releasing lock
          await new Promise(resolve => setTimeout(resolve, 200));
          res.json({ success: true, ...result });
        } finally {
          if (this.modbusLock) {
            this.modbusLock.release();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Read inverter clock (RTC)
    this.app.get('/api/clock', async (req, res) => {
      try {
        if (!this.modbusClient || !this.modbusClient.connected) {
          return res.status(503).json({ error: 'Modbus client not connected' });
        }
        
        if (this.modbusLock) {
          await this.modbusLock.acquire(5000);
        }
        
        try {
          // Read 3 registers starting at 0x020C
          const values = await this.modbusClient.readRegisters(0x020C, 3);
          
          console.log('RTC raw registers:', values.map(v => '0x' + v.toString(16).padStart(4, '0')).join(', '));
          
          // Decode: 0x020C = year/month, 0x020D = day/hour, 0x020E = minute/second
          const yearByte = values[0] >> 8;    // High byte
          const month = values[0] & 0xFF;     // Low byte
          const day = values[1] >> 8;
          const hour = values[1] & 0xFF;
          const minute = values[2] >> 8;
          const second = values[2] & 0xFF;
          
          // Year appears to be stored as 2-digit year (26 for 2026, not offset from 2000)
          const year = yearByte < 50 ? 2000 + yearByte : 1900 + yearByte;
          
          const dateTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
          
          res.json({ dateTime, year, month, day, hour, minute, second, rawRegisters: values });
        } finally {
          if (this.modbusLock) {
            this.modbusLock.release();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Sync inverter clock with server time
    this.app.post('/api/clock/sync', async (req, res) => {
      try {
        if (!this.modbusClient || !this.modbusClient.connected) {
          return res.status(503).json({ error: 'Modbus client not connected' });
        }
        
        if (this.modbusLock) {
          await this.modbusLock.acquire(15000);
        }
        
        try {
          const now = new Date();
          const year = now.getFullYear() - 2000;  // Store as offset from 2000
          const month = now.getMonth() + 1;        // 1-12
          const day = now.getDate();               // 1-31
          const hour = now.getHours();             // 0-23
          const minute = now.getMinutes();         // 0-59
          const second = now.getSeconds();         // 0-59
          
          // Encode into 3 registers
          const reg1 = (year << 8) | month;
          const reg2 = (day << 8) | hour;
          const reg3 = (minute << 8) | second;
          
          // Write 3 registers starting at 0x020C
          await this.modbusClient.writeMultipleRegisters(0x020C, [reg1, reg2, reg3]);
          
          // Give inverter time to process
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const dateTime = `${now.getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
          
          res.json({ success: true, dateTime });
        } finally {
          if (this.modbusLock) {
            this.modbusLock.release();
          }
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Power history endpoint
    this.app.get('/api/power-history', async (req, res) => {
      try {
        if (!this.powerLogger) {
          return res.status(503).json({ error: 'Power logger not available' });
        }

        // Parse query parameters - frontend specifies all parameters
        const startTime = req.query.start ? new Date(req.query.start) : null;
        const endTime = req.query.end ? new Date(req.query.end) : new Date();
        const aggregation = req.query.aggregation || 'raw';
        
        if (!startTime) {
          return res.status(400).json({ 
            error: 'Missing required parameter: start (ISO date string)' 
          });
        }

        // Validate aggregation
        const validAggregations = ['raw', 'hour', 'day'];
        if (!validAggregations.includes(aggregation)) {
          return res.status(400).json({ 
            error: `Invalid aggregation. Use: ${validAggregations.join(', ')}` 
          });
        }

        // Query data from storage
        const samples = await this.powerLogger.query(startTime, endTime, aggregation);
        
        res.json({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          aggregation,
          sampleCount: samples.length,
          samples
        });

      } catch (error) {
        console.error('Error fetching power history:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/events', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.write('data: {"status": "connected"}\n\n');

      this.clients.add(res);

      req.on('close', () => {
        this.clients.delete(res);
      });
    });
  }

  broadcastData(data) {
    this.latestData = data;
    const dataString = `data: ${JSON.stringify(data)}\n\n`;
    
    for (const client of this.clients) {
      try {
        client.write(dataString);
      } catch (error) {
        this.clients.delete(client);
      }
    }
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`✓ Web dashboard available at http://localhost:${this.port}`);
        console.log(`  Access from other devices: http://<pi-ip-address>:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.clients.clear();
      console.log('✓ Web server stopped');
    }
  }
}
