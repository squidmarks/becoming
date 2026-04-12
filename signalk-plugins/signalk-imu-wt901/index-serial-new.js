/**
 * SignalK IMU Plugin for WitMotion WT901BLECL via Serial/USB
 * 
 * Uses the correct 20-byte packet parser
 */

const { SerialPort } = require('serialport');
const { WT901BLEParser } = require('./lib/wt901-ble-parser.js');
const { MotionAnalyzer } = require('./lib/motion-analyzer.js');

module.exports = function(app) {
  let plugin = {
    id: 'signalk-imu-wt901',
    name: 'IMU (WT901)',
    description: 'WitMotion WT901BLECL IMU sensor with sea state analysis'
  };

  let serialPort = null;
  let parser = null;
  let analyzer = null;
  
  // Current sensor data
  let currentAttitude = { roll: 0, pitch: 0, yaw: 0 };
  let currentAcceleration = { x: 0, y: 0, z: 0 };
  
  // Publishing intervals
  let attitudePublishInterval = null;
  let seaStatePublishInterval = null;
  
  // Buffer for incoming data
  let buffer = Buffer.alloc(0);
  
  // Statistics
  let stats = {
    packetsReceived: 0,
    packetsInvalid: 0,
    lastPacketTime: null
  };

  plugin.start = function(options, restartPlugin) {
    try {
      app.debug('Starting IMU plugin (Serial mode)');
      
      const config = {
        serialPort: options.serialPort || '/dev/ttyUSB0',
        baudRate: options.baudRate || 115200,
        attitudePublishRate: options.attitudePublishRate || 2, // Hz
        seaStateUpdateInterval: options.seaStateUpdateInterval || 10, // seconds
        seaStateWindowSize: options.seaStateWindowSize || 60 // seconds
      };
      
      // Initialize parser and analyzer
      parser = new WT901BLEParser();  // Same parser works for serial!
      analyzer = new MotionAnalyzer({
        windowSize: config.seaStateWindowSize * 1000,
        updateInterval: config.seaStateUpdateInterval * 1000
      });
      
      // Open serial port
      serialPort = new SerialPort({
        path: config.serialPort,
        baudRate: config.baudRate
      });
      
      serialPort.on('open', () => {
        app.debug(`Serial port ${config.serialPort} opened at ${config.baudRate} baud`);
        app.setPluginStatus(`Connected to ${config.serialPort}`);
        
        // Start publishing intervals
        startPublishing(config.attitudePublishRate, config.seaStateUpdateInterval);
      });
      
      serialPort.on('data', (data) => {
        handleSerialData(data);
      });
      
      serialPort.on('error', (err) => {
        app.error('Serial port error:', err);
        app.setPluginError(err.message);
      });
      
      serialPort.on('close', () => {
        app.debug('Serial port closed');
        app.setPluginStatus('Disconnected');
        stopPublishing();
      });
      
    } catch (err) {
      app.error('Failed to start IMU plugin:', err);
      app.setPluginError(err.message);
    }
  };

  plugin.stop = function() {
    app.debug('Stopping IMU plugin');
    
    stopPublishing();
    
    if (serialPort && serialPort.isOpen) {
      serialPort.close();
    }
    
    app.setPluginStatus('Stopped');
  };

  /**
   * Handle incoming serial data - buffer and extract 20-byte packets
   */
  function handleSerialData(data) {
    // Append to buffer
    buffer = Buffer.concat([buffer, data]);
    
    // Extract 20-byte packets
    while (buffer.length >= 20) {
      // Look for packet header (0x55)
      const headerIndex = buffer.indexOf(0x55);
      
      if (headerIndex === -1) {
        // No header found, clear buffer
        buffer = Buffer.alloc(0);
        break;
      }
      
      if (headerIndex > 0) {
        // Skip to header
        buffer = buffer.slice(headerIndex);
      }
      
      if (buffer.length < 20) {
        // Wait for complete packet
        break;
      }
      
      // Extract 20-byte packet
      const packet = buffer.slice(0, 20);
      buffer = buffer.slice(20);
      
      // Parse packet
      const parsed = parser.parse(packet);
      
      if (parsed) {
        stats.packetsReceived++;
        stats.lastPacketTime = Date.now();
        
        // Update current values
        currentAttitude = parsed.angle;
        currentAcceleration = parsed.acceleration;
        
        // Feed to motion analyzer
        analyzer.addAttitude(parsed.angle.roll, parsed.angle.pitch);
        analyzer.addAcceleration(
          parsed.acceleration.x,
          parsed.acceleration.y,
          parsed.acceleration.z
        );
      } else {
        stats.packetsInvalid++;
      }
    }
  }

  function startPublishing(attitudeRate, seaStateInterval) {
    // Publish attitude data at specified rate
    attitudePublishInterval = setInterval(() => {
      publishAttitude();
    }, 1000 / attitudeRate);

    // Publish sea state data at specified interval
    seaStatePublishInterval = setInterval(() => {
      publishSeaState();
    }, seaStateInterval * 1000);
  }

  function stopPublishing() {
    if (attitudePublishInterval) {
      clearInterval(attitudePublishInterval);
      attitudePublishInterval = null;
    }
    if (seaStatePublishInterval) {
      clearInterval(seaStatePublishInterval);
      seaStatePublishInterval = null;
    }
  }

  function publishAttitude() {
    const delta = {
      updates: [{
        source: { label: plugin.id, type: 'IMU' },
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.attitude',
            value: {
              roll: currentAttitude.roll,
              pitch: currentAttitude.pitch,
              yaw: currentAttitude.yaw
            }
          }
        ]
      }]
    };

    app.handleMessage(plugin.id, delta);
  }

  function publishSeaState() {
    const metrics = analyzer.getMetrics();
    
    if (!metrics) return;

    const delta = {
      updates: [{
        source: { label: plugin.id, type: 'IMU' },
        timestamp: new Date().toISOString(),
        values: [
          { path: 'environment.seaState.rollIntensity', value: parseFloat(metrics.rollIntensity) },
          { path: 'environment.seaState.pitchIntensity', value: parseFloat(metrics.pitchIntensity) },
          { path: 'environment.seaState.motionIndex', value: parseFloat(metrics.motionIndex) },
          { path: 'environment.seaState.comfort', value: parseFloat(metrics.comfort) },
          { path: 'environment.seaState.description', value: metrics.description }
        ]
      }]
    };

    if (metrics.period) {
      delta.updates[0].values.push({
        path: 'environment.seaState.period',
        value: parseFloat(metrics.period)
      });
    }

    app.handleMessage(plugin.id, delta);
  }

  plugin.registerWithRouter = function(router) {
    router.get('/status', (req, res) => {
      res.json({
        connected: serialPort && serialPort.isOpen,
        stats: stats,
        currentAttitude: currentAttitude,
        seaState: analyzer.getMetrics()
      });
    });
  };

  plugin.schema = {
    type: 'object',
    properties: {
      serialPort: {
        type: 'string',
        title: 'Serial Port',
        description: 'Serial port device path',
        default: '/dev/ttyUSB0'
      },
      baudRate: {
        type: 'number',
        title: 'Baud Rate',
        description: 'Serial baud rate (WT901 default: 115200)',
        default: 115200,
        enum: [9600, 115200, 230400, 460800]
      },
      attitudePublishRate: {
        type: 'number',
        title: 'Attitude Publish Rate (Hz)',
        description: 'How often to publish attitude data (1-10 Hz recommended)',
        default: 2,
        minimum: 0.1,
        maximum: 10
      },
      seaStateUpdateInterval: {
        type: 'number',
        title: 'Sea State Update Interval (seconds)',
        description: 'How often to recalculate and publish sea state metrics',
        default: 10,
        minimum: 5,
        maximum: 60
      },
      seaStateWindowSize: {
        type: 'number',
        title: 'Sea State Window Size (seconds)',
        description: 'Rolling window size for motion analysis',
        default: 60,
        minimum: 30,
        maximum: 300
      }
    }
  };

  return plugin;
};
