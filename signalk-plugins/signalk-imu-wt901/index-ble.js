/**
 * SignalK IMU Plugin for WitMotion WT901BLECL via Bluetooth LE
 * 
 * This version uses Bluetooth LE instead of serial/USB
 */

const noble = require('@abandonware/noble');
const { WT901BLEParser } = require('./lib/wt901-ble-parser.js');
const { MotionAnalyzer } = require('./lib/motion-analyzer.js');

module.exports = function(app) {
  let plugin = {
    id: 'signalk-imu-wt901',
    name: 'IMU (WT901) - BLE',
    description: 'WitMotion WT901BLECL IMU sensor via Bluetooth LE with sea state analysis'
  };

  let peripheral = null;
  let parser = null;
  let analyzer = null;
  
  // Current sensor data
  let currentAttitude = { roll: 0, pitch: 0, yaw: 0 };
  let currentAcceleration = { x: 0, y: 0, z: 0 };
  let currentGyro = { x: 0, y: 0, z: 0 };
  
  // Publishing intervals
  let attitudePublishInterval = null;
  let seaStatePublishInterval = null;
  
  // Stats
  let stats = {
    packetsReceived: 0,
    lastPacketTime: null
  };

  // Configuration
  let config = {};

  plugin.start = function(options, restartPlugin) {
    try {
      app.debug('Starting IMU plugin (BLE mode)');
      
      config = {
        deviceAddress: options.deviceAddress || 'DC:14:25:EE:AA:A4',
        deviceName: options.deviceName || 'WT901BLE68',
        attitudePublishRate: options.attitudePublishRate || 2, // Hz
        seaStateUpdateInterval: options.seaStateUpdateInterval || 10, // seconds
        seaStateWindowSize: options.seaStateWindowSize || 60 // seconds
      };
      
      // Initialize parser and analyzer
      parser = new WT901BLEParser();
      analyzer = new MotionAnalyzer({
        windowSize: config.seaStateWindowSize * 1000,
        updateInterval: config.seaStateUpdateInterval * 1000
      });
      
      // Start BLE scanning
      startBLEConnection();
      
    } catch (err) {
      app.error('Failed to start IMU plugin:', err);
      app.setPluginError(err.message);
    }
  };

  plugin.stop = function() {
    app.debug('Stopping IMU plugin');
    
    stopPublishing();
    
    if (peripheral) {
      peripheral.disconnect();
      peripheral = null;
    }
    
    if (noble.state === 'poweredOn') {
      noble.stopScanning();
    }
    
    app.setPluginStatus('Stopped');
  };

  function startBLEConnection() {
    app.debug(`Searching for ${config.deviceName} (${config.deviceAddress})...`);
    app.setPluginStatus('Scanning for device...');

    // Wait for Bluetooth to be ready
    if (noble.state === 'poweredOn') {
      startScanning();
    } else {
      noble.once('stateChange', (state) => {
        if (state === 'poweredOn') {
          startScanning();
        } else {
          app.setPluginError(`Bluetooth not available: ${state}`);
        }
      });
    }
  }

  function startScanning() {
    noble.on('discover', (foundPeripheral) => {
      const address = foundPeripheral.address.toUpperCase().replace(/:/g, '');
      const targetAddress = config.deviceAddress.toUpperCase().replace(/:/g, '');
      
      if (foundPeripheral.advertisement.localName === config.deviceName || 
          address === targetAddress) {
        
        app.debug(`Found device: ${foundPeripheral.advertisement.localName} (${foundPeripheral.address})`);
        noble.stopScanning();
        
        connectToDevice(foundPeripheral);
      }
    });

    noble.startScanning([], false);
  }

  function connectToDevice(foundPeripheral) {
    peripheral = foundPeripheral;
    
    app.debug(`Connecting to ${peripheral.address}...`);
    app.setPluginStatus('Connecting...');

    peripheral.connect((err) => {
      if (err) {
        app.setPluginError(`Connection failed: ${err.message}`);
        return;
      }

      app.debug('Connected! Discovering services...');
      
      peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
        if (err) {
          app.setPluginError(`Service discovery failed: ${err.message}`);
          return;
        }

        // Find the data characteristic (notify)
        const dataChar = characteristics.find(c => 
          c.uuid === 'ffe4' && c.properties.includes('notify')
        );

        if (!dataChar) {
          app.setPluginError('Data characteristic not found');
          return;
        }

        app.debug('Subscribing to notifications...');
        
        dataChar.on('data', (data) => {
          handleBLEData(data);
        });

        dataChar.subscribe((err) => {
          if (err) {
            app.setPluginError(`Notification subscription failed: ${err.message}`);
            return;
          }

          app.debug('✓ Receiving data from sensor');
          app.setPluginStatus('Connected');
          
          // Start publishing
          startPublishing(config.attitudePublishRate, config.seaStateUpdateInterval);
        });
      });
    });

    peripheral.on('disconnect', () => {
      app.debug('Device disconnected');
      app.setPluginStatus('Disconnected');
      stopPublishing();
      
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        if (plugin.started) {
          startBLEConnection();
        }
      }, 5000);
    });
  }

  function handleBLEData(data) {
    stats.packetsReceived++;
    stats.lastPacketTime = Date.now();

    const parsed = parser.parse(data);
    if (!parsed) {
      return;
    }

    // Update current values
    currentAttitude = parsed.angle;
    currentAcceleration = parsed.acceleration;
    currentGyro = parsed.gyro;

    // Feed to motion analyzer
    analyzer.addAttitude(parsed.angle.roll, parsed.angle.pitch);
    analyzer.addAcceleration(
      parsed.acceleration.x,
      parsed.acceleration.y,
      parsed.acceleration.z
    );
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
        connected: peripheral && peripheral.state === 'connected',
        stats: stats,
        currentAttitude: currentAttitude,
        seaState: analyzer.getMetrics()
      });
    });
  };

  plugin.schema = {
    type: 'object',
    properties: {
      deviceAddress: {
        type: 'string',
        title: 'Device MAC Address',
        description: 'Bluetooth MAC address of WT901BLECL sensor',
        default: 'DC:14:25:EE:AA:A4'
      },
      deviceName: {
        type: 'string',
        title: 'Device Name',
        description: 'Bluetooth device name (e.g., WT901BLE68)',
        default: 'WT901BLE68'
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
