/**
 * RS11 Configuration Utility - Main Server
 * Web-based configuration tool for NoLand RS11 Engine Data Converter
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { RS11Serial } from './rs11-serial.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3002;
const CONFIG_FILE = path.join(__dirname, 'saved-configs.json');

// Initialize RS11 serial handler
const rs11 = new RS11Serial();

// Command lock to prevent interference between config and live queries
let commandLock = false;

// Helper to execute config commands with lock
async function withLock(fn) {
  console.log('[LOCK] Acquiring command lock...');
  commandLock = true;
  try {
    // Stop device to halt binary stream
    console.log('[LOCK] Stopping device...');
    await rs11.stopDevice();
    // Wait longer for stream to fully stop
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('[LOCK] Device stopped, executing command...');
    
    const result = await fn();
    
    // Restart device to resume streaming and save to NVRAM
    console.log('[LOCK] Restarting device to save and resume streaming...');
    await rs11.restartDevice();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for restart
    
    return result;
  } finally {
    console.log('[LOCK] Releasing command lock');
    commandLock = false;
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connections for real-time updates
const wsClients = new Set();

wss.on('connection', (ws) => {
  console.log('✓ WebSocket client connected');
  wsClients.add(ws);

  ws.on('close', async () => {
    console.log('✓ WebSocket client disconnected');
    wsClients.delete(ws);
    
    // Auto-disconnect from RS11 if last client and port is locked
    if (wsClients.size === 0 && rs11.isConnected()) {
      console.log('Last client disconnected, releasing serial port...');
      try {
        await rs11.disconnect();
        console.log('✓ Serial port released');
      } catch (error) {
        console.error('Error releasing port:', error);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// Broadcast to all connected WebSocket clients
function broadcast(data) {
  const message = JSON.stringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// API Routes

// Get available serial ports
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await rs11.listPorts();
    res.json({ ports });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect to device
app.post('/api/connect', async (req, res) => {
  try {
    const { port, baudRate } = req.body;
    await rs11.connect(port, baudRate || 4800);
    
    broadcast({ type: 'connection', status: 'connected', port });
    
    res.json({ success: true, message: `Connected to ${port}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect from device
app.post('/api/disconnect', async (req, res) => {
  try {
    await rs11.disconnect();
    broadcast({ type: 'connection', status: 'disconnected' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get connection status
app.get('/api/status', (req, res) => {
  res.json({ connected: rs11.isConnected() });
});

// Query configuration
app.get('/api/config', async (req, res) => {
  try {
    const config = await rs11.queryConfig();
    // Log raw response for debugging
    console.log('Raw config response:', config.raw);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Query live values
app.get('/api/live', async (req, res) => {
  try {
    // Skip live queries if configuration commands are in progress
    if (commandLock) {
      return res.json({ analogs: [], skipped: true });
    }
    
    const data = await rs11.queryLive();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch set all engine configuration (single stop/restart cycle)
app.post('/api/config/engine-batch', async (req, res) => {
  try {
    const { instance, multiBatt, portPPR, stbdPPR, portPPL, stbdPPL, portHours, stbdHours } = req.body;
    
    const results = await withLock(async () => {
      const results = [];
      
      if (instance !== undefined) {
        const result = await rs11.setEngineInstance(instance);
        if (result.error) throw new Error(`Instance: ${result.error}`);
        results.push({ command: 'instance', result });
      }
      
      if (multiBatt !== undefined && multiBatt !== 0) {
        const result = await rs11.setMultiBattStartInstance(multiBatt);
        if (result.error) throw new Error(`Multi-Batt: ${result.error}`);
        results.push({ command: 'multiBatt', result });
      }
      
      // CRITICAL: Set PPR/PPL/hours values BEFORE enabling messages
      if (portPPR !== undefined) {
        const result = await rs11.setPortPPR(portPPR);
        if (result.error) throw new Error(`Port PPR: ${result.error}`);
        results.push({ command: 'portPPR', result });
      }
      
      if (stbdPPR !== undefined) {
        const result = await rs11.setStbdPPR(stbdPPR);
        if (result.error) throw new Error(`Stbd PPR: ${result.error}`);
        results.push({ command: 'stbdPPR', result });
      }
      
      if (portPPL !== undefined) {
        const result = await rs11.setPortPPL(portPPL);
        if (result.error) throw new Error(`Port PPL: ${result.error}`);
        results.push({ command: 'portPPL', result });
      }
      
      if (stbdPPL !== undefined) {
        const result = await rs11.setStbdPPL(stbdPPL);
        if (result.error) throw new Error(`Stbd PPL: ${result.error}`);
        results.push({ command: 'stbdPPL', result });
      }
      
      if (portHours !== undefined && !isNaN(portHours)) {
        const result = await rs11.setEngineHours('P', portHours);
        if (result.error) throw new Error(`Port Hours: ${result.error}`);
        results.push({ command: 'portHours', result });
      }
      
      if (stbdHours !== undefined && !isNaN(stbdHours)) {
        const result = await rs11.setEngineHours('S', stbdHours);
        if (result.error) throw new Error(`Stbd Hours: ${result.error}`);
        results.push({ command: 'stbdHours', result });
      }
      
      // CRITICAL: Enable CANbus messages AFTER setting values
      const portEnabled = (portPPR && portPPR > 0) || (portPPL && portPPL < 99999) || (portHours !== undefined);
      if (portEnabled) {
        await rs11.enableMessage(1, 'P', true); // Message1: Rapid (RPM)
        await rs11.enableMessage(2, 'P', true); // Message2: Dynamic (Hours)
        await rs11.enableMessage(4, 'P', true); // Message4: Trans Param
        results.push({ command: 'enablePortMessages' });
      }
      
      const stbdEnabled = (stbdPPR && stbdPPR > 0) || (stbdPPL && stbdPPL < 99999) || (stbdHours !== undefined);
      if (stbdEnabled) {
        await rs11.enableMessage(1, 'S', true); // Message1: Rapid (RPM)
        await rs11.enableMessage(2, 'S', true); // Message2: Dynamic (Hours)
        await rs11.enableMessage(4, 'S', true); // Message4: Trans Param
        results.push({ command: 'enableStbdMessages' });
      }
      
      return results;
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Set engine instance
app.post('/api/config/instance', async (req, res) => {
  try {
    const { instance } = req.body;
    const result = await withLock(() => rs11.setEngineInstance(instance));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set start address
app.post('/api/config/address', async (req, res) => {
  try {
    const { address } = req.body;
    const result = await withLock(() => rs11.setStartAddress(address));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set multi-battery instance
app.post('/api/config/multi-batt', async (req, res) => {
  try {
    const { value } = req.body;
    if (![0, 4, 6].includes(value)) {
      return res.status(400).json({ error: 'Value must be 0, 4, or 6' });
    }
    const result = await withLock(() => rs11.setMultiBattStartInstance(value));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set engine hours
app.post('/api/config/engine-hours', async (req, res) => {
  try {
    const { engine, hours } = req.body;
    console.log(`[ENGINE HOURS] Request: engine=${engine}, hours=${hours} (type: ${typeof hours})`);
    if (!['P', 'S'].includes(engine)) {
      return res.status(400).json({ error: 'Engine must be P or S' });
    }
    if (hours < 0 || hours > 99998) {
      return res.status(400).json({ error: 'Hours must be 0-99998' });
    }
    const result = await withLock(() => rs11.setEngineHours(engine, hours));
    console.log(`[ENGINE HOURS] Result:`, result);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, result });
  } catch (error) {
    console.log(`[ENGINE HOURS] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Set RPM configuration
app.post('/api/config/rpm', async (req, res) => {
  try {
    const { port, stbd, portPPL, stbdPPL } = req.body;
    
    const results = await withLock(async () => {
      const results = [];
      if (port !== undefined) {
        const result = await rs11.setPortPPR(port);
        if (result.error) {
          throw new Error(`Port PPR: ${result.error}`);
        }
        results.push(result);
      }
      if (stbd !== undefined) {
        const result = await rs11.setStbdPPR(stbd);
        if (result.error) {
          throw new Error(`Stbd PPR: ${result.error}`);
        }
        results.push(result);
      }
      if (portPPL !== undefined) {
        const result = await rs11.setPortPPL(portPPL);
        if (result.error) {
          throw new Error(`Port PPL: ${result.error}`);
        }
        results.push(result);
      }
      if (stbdPPL !== undefined) {
        const result = await rs11.setStbdPPL(stbdPPL);
        if (result.error) {
          throw new Error(`Stbd PPL: ${result.error}`);
        }
        results.push(result);
      }
      return results;
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Set analog input configuration
app.post('/api/config/analog/:port', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    const { engine, field, senderCurrent, smoothing, xValue, yValue, alarm } = req.body;
    
    const results = await withLock(async () => {
      const results = [];
      
      if (field !== undefined) {
        const result = await rs11.setAnalogField(port, engine, field);
        if (result.error) {
          throw new Error(`A${port} field: ${result.error}`);
        }
        results.push(result);
      }
      if (senderCurrent !== undefined && port <= 4) {
        const result = await rs11.setSenderCurrent(port, senderCurrent);
        if (result.error) {
          throw new Error(`A${port} sender current: ${result.error}`);
        }
        results.push(result);
      }
      // TEMPORARILY DISABLED - @T command not supported in firmware v3.50
      // if (smoothing !== undefined && port <= 4) {
      //   const result = await rs11.setSmoothing(port, smoothing);
      //   if (result.error) {
      //     throw new Error(`A${port} smoothing: ${result.error}`);
      //   }
      //   results.push(result);
      // }
      if (xValue !== undefined) {
        const sign = xValue >= 0 ? '+' : '-';
        const result = await rs11.setAnalogXValue(port, sign, Math.abs(xValue));
        if (result.error) {
          throw new Error(`A${port} X value: ${result.error}`);
        }
        results.push(result);
      }
      if (yValue !== undefined) {
        const sign = yValue >= 0 ? '+' : '-';
        const result = await rs11.setAnalogYValue(port, sign, Math.abs(yValue));
        if (result.error) {
          throw new Error(`A${port} Y value: ${result.error}`);
        }
        results.push(result);
      }
      if (alarm !== undefined) {
        const result = await rs11.setAlarmValue(port, alarm);
        if (result.error) {
          throw new Error(`A${port} alarm: ${result.error}`);
        }
        results.push(result);
      }
      
      return results;
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Calibrate analog input (two-point linear)
app.post('/api/config/analog/:port/calibrate', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    const { lowVolts, lowValue, highVolts, highValue } = req.body;
    
    // Check for undefined/null, but allow 0 as valid value
    if (lowVolts === undefined || lowVolts === null || 
        lowValue === undefined || lowValue === null ||
        highVolts === undefined || highVolts === null || 
        highValue === undefined || highValue === null) {
      return res.status(400).json({ error: 'All calibration points required' });
    }
    
    // Calculate linear calibration: engineeringValue = (voltage * slope) + offset
    const voltageRange = highVolts - lowVolts;
    const valueRange = highValue - lowValue;
    const slope = valueRange / voltageRange;
    const offset = lowValue - (slope * lowVolts);
    
    console.log(`A${port} Calibration:`);
    console.log(`  Points: (${lowVolts}V → ${lowValue}) to (${highVolts}V → ${highValue})`);
    console.log(`  Slope: ${slope.toFixed(3)}, Offset: ${offset.toFixed(3)}`);
    
    // RS11 X/Y format: Output = (Input * X) / Y
    // We need to convert our slope/offset to X/Y format
    // For now, use a simplified approach: X = slope * 100, Y = 100
    // This gives us decent resolution for most sensors
    
    let xValue = Math.round(Math.abs(slope) * 100);
    let yValue = 100;
    
    // Constrain to RS11 limits
    xValue = Math.min(9999, Math.max(1, xValue));
    yValue = Math.min(125, Math.max(1, yValue));
    
    const xSign = slope >= 0 ? '+' : '-';
    
    console.log(`  RS11 Format: X=${xSign}${xValue}, Y=+${yValue}`);
    
    // Send calibration commands with lock
    const results = await withLock(async () => {
      const results = [];
      const xResult = await rs11.setAnalogXValue(port, xSign, xValue);
      if (xResult.error) {
        throw new Error(`A${port} X value: ${xResult.error}`);
      }
      results.push(xResult);
      
      const yResult = await rs11.setAnalogYValue(port, '+', yValue);
      if (yResult.error) {
        throw new Error(`A${port} Y value: ${yResult.error}`);
      }
      results.push(yResult);
      
      return results;
    });
    
    res.json({
      success: true,
      xValue,
      yValue,
      xSign,
      slope,
      offset,
      results
    });
  } catch (error) {
    console.error('Calibration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop device
app.post('/api/device/stop', async (req, res) => {
  try {
    const result = await withLock(() => rs11.stopDevice());
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart device
app.post('/api/device/restart', async (req, res) => {
  try {
    const result = await withLock(() => rs11.restartDevice());
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Factory reset
app.post('/api/device/reset', async (req, res) => {
  try {
    const result = await rs11.factoryReset();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save configuration to file
app.post('/api/config/save', async (req, res) => {
  try {
    const { name, config } = req.body;
    
    let configs = {};
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      configs = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, that's okay
    }
    
    configs[name] = {
      ...config,
      savedAt: new Date().toISOString()
    };
    
    await fs.writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2));
    
    res.json({ success: true, message: `Configuration "${name}" saved` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Load saved configurations
app.get('/api/config/saved', async (req, res) => {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const configs = JSON.parse(data);
    res.json(configs);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({});
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   RS11 Configuration Utility                     ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║   Server: http://localhost:${PORT}                  ║`);
  console.log('║   Status: Ready for RS11 connection              ║');
  console.log('╚══════════════════════════════════════════════════╝');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n✓ Shutting down gracefully...');
  await rs11.disconnect();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n✓ Shutting down gracefully...');
  await rs11.disconnect();
  server.close();
  process.exit(0);
});
