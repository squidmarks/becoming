/**
 * SignalK State Detectors Plugin
 * Monitors vessel data and publishes derived state paths using JEXL expressions
 */

const jexl = require('jexl');
const { StabilityTracker } = require('./lib/stability-tracker.js');

module.exports = function(app) {
  let plugin = {
    id: 'signalk-state-detectors',
    name: 'State Detectors',
    description: 'Monitor conditions and publish derived vessel state paths using JEXL expressions'
  };

  let unsubscribes = [];
  let detectors = [];
  let trackers = new Map(); // detectorId -> StabilityTracker
  let expressions = new Map(); // detectorId -> compiled JEXL expression
  let currentValues = {}; // path -> latest value

  plugin.start = function(options, restartPlugin) {
    try {
      app.debug('Starting State Detectors plugin');
      
      // Initialize detectors from configuration
      if (options && options.detectors) {
        detectors = options.detectors.filter(d => d.enabled !== false);
        app.debug(`Loaded ${detectors.length} enabled detectors`);
        
        // Compile expressions and initialize trackers
        initializeDetectors();
        
        // Subscribe to all paths referenced in expressions
        subscribeToAllPaths();
      } else {
        app.debug('No detectors configured');
      }
      
      app.setPluginStatus('Started successfully');
    } catch (err) {
      app.setPluginError(`Failed to start: ${err.message}`);
      app.error('Error starting plugin:', err);
    }
  };

  plugin.stop = function() {
    try {
      app.debug('Stopping State Detectors plugin');
      
      // Unsubscribe from all paths
      unsubscribes.forEach(fn => fn());
      unsubscribes = [];
      
      // Clear state
      detectors = [];
      trackers.clear();
      expressions.clear();
      currentValues = {};
      
      app.setPluginStatus('Stopped');
    } catch (err) {
      app.setPluginError(`Error stopping: ${err.message}`);
    }
  };

  /**
   * Compile JEXL expressions and initialize stability trackers
   */
  function initializeDetectors() {
    detectors.forEach(detector => {
      if (detector.enabled === false) return;
      
      const detectorId = detector.name;
      
      try {
        // Compile JEXL expression
        const expr = jexl.compile(detector.expression);
        expressions.set(detectorId, expr);
        
        // Initialize stability tracker
        const stabilityConfig = detector.stability || {};
        trackers.set(detectorId, new StabilityTracker(detectorId, stabilityConfig));
        
        app.debug(`Initialized detector: ${detectorId} with expression: ${detector.expression}`);
      } catch (err) {
        app.error(`Failed to compile expression for detector ${detectorId}: ${err.message}`);
      }
    });
  }

  /**
   * Subscribe to all SignalK paths referenced in detector expressions
   */
  function subscribeToAllPaths() {
    const paths = new Set();
    
    // Extract all paths from all detector expressions
    detectors.forEach(detector => {
      if (detector.enabled === false) return;
      
      // Extract variable names from JEXL expression
      // Variables in expressions correspond to SignalK paths (with dots converted to underscores)
      const pathsInExpression = extractPathsFromExpression(detector.expression);
      pathsInExpression.forEach(p => paths.add(p));
    });
    
    app.debug(`Subscribing to ${paths.size} unique paths`);
    
    // Subscribe to each path
    paths.forEach(path => {
      const unsubscribe = app.subscriptionmanager.subscribe(
        {
          context: 'vessels.self',
          subscribe: [{
            path: path,
            period: 1000 // 1 second
          }]
        },
        unsubscribes,
        subscriptionError => {
          app.error(`Subscription error for ${path}:`, subscriptionError);
        },
        delta => {
          handleDelta(delta);
        }
      );
      
      unsubscribes.push(unsubscribe);
    });
  }

  /**
   * Extract SignalK paths from a JEXL expression
   * Looks for dot-notation paths (e.g., navigation.speedOverGround)
   */
  function extractPathsFromExpression(expression) {
    const paths = [];
    
    // Match patterns like: word.word.word (SignalK paths)
    const pathRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)\b/g;
    let match;
    
    while ((match = pathRegex.exec(expression)) !== null) {
      paths.push(match[1]);
    }
    
    return [...new Set(paths)]; // Remove duplicates
  }

  /**
   * Handle incoming SignalK delta
   */
  function handleDelta(delta) {
    if (!delta.updates) return;
    
    // Update current values
    delta.updates.forEach(update => {
      if (!update.values) return;
      
      update.values.forEach(pathValue => {
        currentValues[pathValue.path] = pathValue.value;
      });
    });
    
    // Evaluate all detectors
    evaluateAllDetectors();
  }

  /**
   * Evaluate all detectors against current values
   */
  function evaluateAllDetectors() {
    const now = new Date();
    
    detectors.forEach(detector => {
      if (detector.enabled === false) return;
      
      const detectorId = detector.name;
      const expr = expressions.get(detectorId);
      const tracker = trackers.get(detectorId);
      
      if (!expr || !tracker) {
        return;
      }
      
      try {
        // Evaluate JEXL expression with current values as context
        const result = expr.evalSync(currentValues);
        
        // Convert result to boolean
        const boolResult = Boolean(result);
        
        // Get current state value (if exists)
        const currentState = currentValues[detector.statePath];
        
        // Track stability
        const stability = tracker.evaluate(boolResult, now);
        
        // State transitions (only when stability changes to a new value)
        if (stability.justStabilized && stability.stableValue !== currentState) {
          // State has stabilized to a new value - publish it
          publishState(detector.statePath, stability.stableValue, detector.name);
          const action = stability.stableValue ? 'activated' : 'deactivated';
          app.debug(`State ${action}: ${detector.statePath} (${detector.name})`);
        }
      } catch (err) {
        app.error(`Error evaluating detector ${detectorId}: ${err.message}`);
      }
    });
  }

  /**
   * Publish state change to SignalK
   */
  function publishState(path, value, source) {
    const delta = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: 'signalk-state-detectors',
            type: 'plugin'
          },
          timestamp: new Date().toISOString(),
          values: [
            {
              path: path,
              value: value
            }
          ]
        }
      ]
    };
    
    app.handleMessage('signalk-state-detectors', delta);
  }

  /**
   * JSON Schema for plugin configuration
   */
  plugin.schema = {
    type: 'object',
    required: ['detectors'],
    properties: {
      detectors: {
        type: 'array',
        title: 'State Detectors',
        description: 'Configure state detectors using JEXL expressions to monitor conditions and publish derived paths',
        items: {
          type: 'object',
          required: ['name', 'statePath', 'expression'],
          properties: {
            name: {
              type: 'string',
              title: 'Detector Name',
              description: 'Human-readable name for this detector'
            },
            enabled: {
              type: 'boolean',
              title: 'Enabled',
              description: 'Enable or disable this detector',
              default: true
            },
            statePath: {
              type: 'string',
              title: 'State Path',
              description: 'SignalK path to publish state (e.g., vessel.underway)',
              example: 'vessel.underway'
            },
            expression: {
              type: 'string',
              title: 'JEXL Expression',
              description: 'Boolean expression using SignalK paths. Example: "navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5". Use SI units (m/s, Hz, K). See JEXL docs: https://github.com/TomFrost/Jexl',
              example: 'navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5'
            },
            category: {
              type: 'string',
              title: 'Category',
              description: 'Optional category for organization',
              enum: ['general', 'propulsion', 'navigation', 'electrical', 'environment'],
              default: 'general'
            },
            stability: {
              type: 'object',
              title: 'Stability Settings',
              description: 'Debouncing configuration to avoid flapping',
              properties: {
                consecutiveSamples: {
                  type: 'number',
                  title: 'Consecutive Samples',
                  description: 'Number of consecutive true samples required before state changes',
                  default: 2,
                  minimum: 1
                },
                withinDuration: {
                  type: 'number',
                  title: 'Within Duration (seconds)',
                  description: 'Time window for consecutive samples',
                  default: 30,
                  minimum: 1
                }
              }
            }
          }
        },
        default: [
          {
            name: 'Vessel Underway',
            statePath: 'vessel.underway',
            enabled: true,
            category: 'navigation',
            expression: 'navigation.speedOverGround > 0.257 && propulsion.port.revolutions > 5 && propulsion.starboard.revolutions > 5',
            stability: {
              consecutiveSamples: 3,
              withinDuration: 30
            }
          }
        ]
      }
    }
  };

  return plugin;
};
