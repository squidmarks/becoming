/**
 * SignalK State Detectors Plugin
 * Monitors vessel data and publishes derived state paths based on conditions
 */

const { ConditionEvaluator } = require('./lib/condition-evaluator.js');
const { StabilityTracker } = require('./lib/stability-tracker.js');

module.exports = function(app) {
  let plugin = {
    id: 'signalk-state-detectors',
    name: 'State Detectors',
    description: 'Monitor conditions and publish derived vessel state paths'
  };

  let unsubscribes = [];
  let detectors = [];
  let trackers = new Map(); // detectorId -> {start: StabilityTracker, end: StabilityTracker}
  let currentValues = {}; // path -> latest value
  let evaluator = new ConditionEvaluator();

  plugin.start = function(options, restartPlugin) {
    try {
      app.debug('Starting State Detectors plugin');
      
      // Initialize detectors from configuration
      if (options && options.detectors) {
        detectors = options.detectors.filter(d => d.enabled !== false);
        app.debug(`Loaded ${detectors.length} enabled detectors`);
        
        // Initialize stability trackers
        initializeTrackers();
        
        // Subscribe to all paths referenced in conditions
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
      currentValues = {};
      
      app.setPluginStatus('Stopped');
    } catch (err) {
      app.setPluginError(`Error stopping: ${err.message}`);
    }
  };

  /**
   * Initialize stability trackers for all detectors
   */
  function initializeTrackers() {
    detectors.forEach(detector => {
      if (detector.enabled === false) return;
      
      const detectorId = detector.name;
      
      const startConfig = detector.stability?.start || {};
      const endConfig = detector.stability?.end || {};
      
      trackers.set(detectorId, {
        start: new StabilityTracker(`${detectorId}-start`, startConfig),
        end: new StabilityTracker(`${detectorId}-end`, endConfig)
      });
      
      app.debug(`Initialized trackers for detector: ${detectorId}`);
    });
  }

  /**
   * Subscribe to all SignalK paths referenced in detector conditions
   */
  function subscribeToAllPaths() {
    const paths = new Set();
    
    // Collect all paths from all detectors
    detectors.forEach(detector => {
      if (detector.enabled === false) return;
      
      extractPaths(detector.startConditions).forEach(p => paths.add(p));
      extractPaths(detector.endConditions).forEach(p => paths.add(p));
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
   * Extract all paths from a condition tree
   */
  function extractPaths(condition) {
    const paths = [];
    
    if (!condition || !condition.rules) {
      return paths;
    }
    
    condition.rules.forEach(rule => {
      if (rule.path) {
        paths.push(rule.path);
      }
      
      // Handle nested conditions
      if (rule.operator && rule.rules) {
        paths.push(...extractPaths(rule));
      }
    });
    
    return paths;
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
      const tracker = trackers.get(detectorId);
      
      if (!tracker) {
        app.error(`No tracker found for detector: ${detectorId}`);
        return;
      }
      
      // Get current state value (if exists)
      const currentState = currentValues[detector.statePath];
      
      // Evaluate conditions
      const startResult = evaluator.evaluate(detector.startConditions, currentValues);
      const endResult = evaluator.evaluate(detector.endConditions, currentValues);
      
      // Track stability
      const startStability = tracker.start.evaluate(startResult, now);
      const endStability = tracker.end.evaluate(endResult, now);
      
      // State transitions
      if (startStability.justStabilized && currentState !== true) {
        // Transition to active state
        publishState(detector.statePath, true, detector.name);
        app.debug(`State activated: ${detector.statePath} (${detector.name})`);
      }
      
      if (endStability.justStabilized && currentState === true) {
        // Transition to inactive state
        publishState(detector.statePath, false, detector.name);
        app.debug(`State deactivated: ${detector.statePath} (${detector.name})`);
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
        description: 'Configure state detectors to monitor conditions and publish derived paths',
        items: {
          type: 'object',
          required: ['name', 'statePath', 'startConditions', 'endConditions'],
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
            category: {
              type: 'string',
              title: 'Category',
              description: 'Optional category for organization',
              enum: ['general', 'propulsion', 'navigation', 'electrical', 'environment'],
              default: 'general'
            },
            startConditions: {
              type: 'object',
              title: 'Start Conditions',
              description: 'Conditions that must be met to activate this state',
              required: ['operator', 'rules'],
              properties: {
                operator: {
                  type: 'string',
                  title: 'Operator',
                  enum: ['AND', 'OR'],
                  default: 'AND'
                },
                rules: {
                  type: 'array',
                  title: 'Rules',
                  items: {
                    type: 'object',
                    required: ['path', 'operator', 'value'],
                    properties: {
                      path: {
                        type: 'string',
                        title: 'SignalK Path',
                        example: 'navigation.speedOverGround'
                      },
                      operator: {
                        type: 'string',
                        title: 'Comparison Operator',
                        enum: ['>', '>=', '<', '<=', '==', '===', '!=', '!=='],
                        default: '>'
                      },
                      value: {
                        title: 'Value',
                        description: 'Value to compare against (number, string, or boolean)',
                        oneOf: [
                          { type: 'number' },
                          { type: 'string' },
                          { type: 'boolean' }
                        ]
                      }
                    }
                  }
                }
              }
            },
            endConditions: {
              type: 'object',
              title: 'End Conditions',
              description: 'Conditions that must be met to deactivate this state',
              required: ['operator', 'rules'],
              properties: {
                operator: {
                  type: 'string',
                  title: 'Operator',
                  enum: ['AND', 'OR'],
                  default: 'OR'
                },
                rules: {
                  type: 'array',
                  title: 'Rules',
                  items: {
                    type: 'object',
                    required: ['path', 'operator', 'value'],
                    properties: {
                      path: {
                        type: 'string',
                        title: 'SignalK Path',
                        example: 'navigation.speedOverGround'
                      },
                      operator: {
                        type: 'string',
                        title: 'Comparison Operator',
                        enum: ['>', '>=', '<', '<=', '==', '===', '!=', '!=='],
                        default: '<='
                      },
                      value: {
                        title: 'Value',
                        description: 'Value to compare against (number, string, or boolean)',
                        oneOf: [
                          { type: 'number' },
                          { type: 'string' },
                          { type: 'boolean' }
                        ]
                      }
                    }
                  }
                }
              }
            },
            stability: {
              type: 'object',
              title: 'Stability Settings',
              description: 'Debouncing configuration to avoid flapping',
              properties: {
                start: {
                  type: 'object',
                  title: 'Start Stability',
                  properties: {
                    consecutiveSamples: {
                      type: 'number',
                      title: 'Consecutive Samples',
                      description: 'Number of consecutive true samples required',
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
                },
                end: {
                  type: 'object',
                  title: 'End Stability',
                  properties: {
                    consecutiveSamples: {
                      type: 'number',
                      title: 'Consecutive Samples',
                      description: 'Number of consecutive true samples required',
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
            }
          }
        },
        default: [
          {
            name: 'Vessel Underway',
            statePath: 'vessel.underway',
            enabled: true,
            category: 'navigation',
            startConditions: {
              operator: 'AND',
              rules: [
                { path: 'navigation.speedOverGround', operator: '>', value: 0.5 },
                { path: 'propulsion.port.revolutions', operator: '>', value: 300 }
              ]
            },
            endConditions: {
              operator: 'OR',
              rules: [
                { path: 'navigation.speedOverGround', operator: '<=', value: 0.3 },
                { path: 'propulsion.port.revolutions', operator: '<=', value: 100 }
              ]
            },
            stability: {
              start: { consecutiveSamples: 3, withinDuration: 30 },
              end: { consecutiveSamples: 2, withinDuration: 30 }
            }
          }
        ]
      }
    }
  };

  return plugin;
};
