/**
 * SignalK IMU Plugin for WitMotion WT901BLECL
 * Reads attitude data and analyzes sea state
 */

const { SerialPort } = require('serialport');
const { WT901Parser } = require('./lib/wt901-parser.js');
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
  let currentHeading = 0;
  let currentAcceleration = { x: 0, y: 0, z: 0 };
  let currentGyro = { x: 0, y: 0, z: 0 };
  
  // Publishing intervals
  let attitudePublishInterval = null;
  let seaStatePublishInterval = null;
  
  // Statistics
  let stats = {
    framesReceived: 0,
    framesInvalid: 0,
    lastFrameTime: null
  };

  plugin.start = function(options, restartPlugin) {
    try {
      app.debug('Starting IMU plugin');
      
      const config = {
        serialPort: options.serialPort || '/dev/ttyUSB0',
        baudRate: options.baudRate || 115200,
        attitudePublishRate: options.attitudePublishRate || 2, // Hz
        seaStateUpdateInterval: options.seaStateUpdateInterval || 10, // seconds
        seaStateWindowSize: options.seaStateWindowSize || 60 // seconds
      };
      
      // Initialize parser and analyzer
      parser = new WT901Parser();
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
        
        // Configure sensor to output the data we need
        setTimeout(() => {
          configureSensor();
        }, 1000);
        
        // Start publishing intervals
        startPublishing(config.attitudePublishRate, config.seaStateUpdateInterval);
      });
      
      serialPort.on('data', (data) => {
        handleSerialData(data);
      });
      
      serialPort.on('error', (err) => {
        app.error('Serial port error:', err);
        app.setPluginError(`Serial error: ${err.message}`);
      });
      
      serialPort.on('close', () => {
        app.debug('Serial port closed');
        stopPublishing();
      });
      
    } catch (err) {
      app.setPluginError(`Failed to start: ${err.message}`);
      app.error('Error starting plugin:', err);
    }
  };

  plugin.stop = function() {
    try {
      app.debug('Stopping IMU plugin');
      
      stopPublishing();
      
      if (serialPort && serialPort.isOpen) {
        serialPort.close();
      }
      
      app.setPluginStatus('Stopped');
    } catch (err) {
      app.setPluginError(`Error stopping: ${err.message}`);
    }
  };

  /**
   * Configure sensor to output required data types
   */
  function configureSensor() {
    app.debug('Configuring WT901 sensor...');
    
    // Unlock configuration registers
    const unlockCmd = Buffer.from([0xFF, 0xAA, 0x69, 0x88, 0xB5]);
    serialPort.write(unlockCmd);
    
    setTimeout(() => {
      // Configure output content (RSW register 0x02)
      // Bit 1 = Acceleration (0x51)
      // Bit 2 = Angular velocity (0x52)
      // Bit 3 = Angle (0x53)
      // Bit 4 = Magnetometer (0x54)
      // Value: 0x1E = 0b00011110 = accel + gyro + angle + mag
      const configOutputCmd = Buffer.from([0xFF, 0xAA, 0x02, 0x1E, 0x00]);
      serialPort.write(configOutputCmd);
      
      app.debug('Sensor configuration sent');
      
      // Save configuration to sensor
      setTimeout(() => {
        const saveCmd = Buffer.from([0xFF, 0xAA, 0x00, 0x00, 0x00]);
        serialPort.write(saveCmd);
        app.debug('Configuration saved to sensor');
      }, 200);
    }, 200);
  }

  /**
   * Handle incoming serial data
   */
  function handleSerialData(data) {
    const frames = parser.parse(data);
    
    frames.forEach(frame => {
      stats.framesReceived++;
      stats.lastFrameTime = Date.now();
      
      switch (frame.type) {
        case 'angle':
          currentAttitude = {
            roll: frame.roll,
            pitch: frame.pitch,
            yaw: frame.yaw
          };
          
          // Feed to motion analyzer
          analyzer.addAttitude(frame.roll, frame.pitch);
          break;
          
        case 'acceleration':
          currentAcceleration = {
            x: frame.x,
            y: frame.y,
            z: frame.z
          };
          
          // Feed to motion analyzer
          analyzer.addAcceleration(frame.x, frame.y, frame.z);
          break;
          
        case 'gyro':
          currentGyro = {
            x: frame.x,
            y: frame.y,
            z: frame.z
          };
          break;
          
        case 'magnetometer':
          // Calculate heading from magnetometer
          // Simple 2D heading (assumes level platform)
          currentHeading = Math.atan2(frame.y, frame.x);
          if (currentHeading < 0) {
            currentHeading += 2 * Math.PI;
          }
          break;
      }
    });
  }

  /**
   * Start publishing intervals
   */
  function startPublishing(attitudeRate, seaStateInterval) {
    // Publish attitude at configured rate (1-2Hz)
    const attitudeIntervalMs = 1000 / attitudeRate;
    attitudePublishInterval = setInterval(() => {
      publishAttitude();
    }, attitudeIntervalMs);
    
    // Publish sea state metrics every N seconds
    seaStatePublishInterval = setInterval(() => {
      publishSeaState();
    }, seaStateInterval * 1000);
  }

  /**
   * Stop publishing intervals
   */
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

  /**
   * Publish attitude data to SignalK
   */
  function publishAttitude() {
    const values = [
      {
        path: 'navigation.attitude',
        value: {
          roll: currentAttitude.roll,
          pitch: currentAttitude.pitch,
          yaw: currentAttitude.yaw
        }
      },
      {
        path: 'navigation.headingMagnetic',
        value: currentHeading
      }
    ];
    
    publishDelta(values);
  }

  /**
   * Publish sea state metrics to SignalK
   */
  function publishSeaState() {
    const metrics = analyzer.getMetrics();
    
    const values = [
      {
        path: 'environment.seaState.rollIntensity',
        value: metrics.rollIntensity
      },
      {
        path: 'environment.seaState.pitchIntensity',
        value: metrics.pitchIntensity
      },
      {
        path: 'environment.seaState.motionIndex',
        value: metrics.motionIndex
      },
      {
        path: 'environment.seaState.comfort',
        value: metrics.comfort
      },
      {
        path: 'environment.seaState.description',
        value: metrics.description
      }
    ];
    
    // Add optional metrics
    if (metrics.period) {
      values.push({
        path: 'environment.seaState.period',
        value: metrics.period
      });
    }
    
    publishDelta(values);
    
    app.debug(`Sea state: ${metrics.description} (motion: ${metrics.motionIndex}, comfort: ${metrics.comfort})`);
  }

  /**
   * Publish delta to SignalK
   */
  function publishDelta(values) {
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: 'signalk-imu-wt901',
            type: 'plugin'
          },
          timestamp: new Date().toISOString(),
          values: values
        }
      ]
    };
    
    app.handleMessage('signalk-imu-wt901', delta);
  }

  /**
   * Plugin status endpoint
   */
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

  /**
   * JSON Schema for plugin configuration
   */
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
