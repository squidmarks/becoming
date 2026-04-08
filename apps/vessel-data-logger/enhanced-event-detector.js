import { ConditionEvaluator } from './condition-evaluator.js';
import { StabilityTracker } from './stability-tracker.js';

/**
 * Enhanced event detector supporting duration events with debouncing
 */
export class EnhancedEventDetector {
  constructor(detectors = [], cache = null) {
    this.detectors = detectors;
    this.cache = cache; // For capturing data at start/end
    
    this.conditionEvaluator = new ConditionEvaluator();
    
    // Active events: detectorId -> event object
    this.activeEvents = new Map();
    
    // Stability trackers: detectorId -> { start: StabilityTracker, end: StabilityTracker }
    this.stabilityTrackers = new Map();
    
    // Initialize trackers
    this.initializeTrackers();
  }

  updateDetectors(detectors) {
    this.detectors = detectors;
    this.initializeTrackers();
  }

  initializeTrackers() {
    this.stabilityTrackers.clear();
    
    for (const detector of this.detectors) {
      if (!detector.enabled) continue;
      
      const startConfig = detector.startConditions?.stability || {};
      const endConfig = detector.endConditions?.stability || {};
      
      this.stabilityTrackers.set(detector.id, {
        start: new StabilityTracker(`${detector.id}_start`, startConfig),
        end: new StabilityTracker(`${detector.id}_end`, endConfig)
      });
    }
  }

  /**
   * Evaluate all detectors against current values
   * @param {Object} currentValues - Map of path -> {value, timestamp, source}
   * @returns {Array} - Array of event objects (started or ended)
   */
  evaluateAll(currentValues, timestamp = new Date()) {
    const events = [];
    
    for (const detector of this.detectors) {
      if (!detector.enabled) continue;
      
      const result = this.evaluateDetector(detector, currentValues, timestamp);
      if (result) {
        events.push(result);
      }
    }
    
    return events;
  }

  /**
   * Evaluate a single detector
   * @param {Object} detector - Detector configuration
   * @param {Object} currentValues - Current data values
   * @param {Date} timestamp - Current timestamp
   * @returns {Object|null} - Event object if event started or ended, null otherwise
   */
  evaluateDetector(detector, currentValues, timestamp) {
    const detectorId = detector.id;
    const isActive = this.activeEvents.has(detectorId);
    const trackers = this.stabilityTrackers.get(detectorId);
    
    if (!trackers) {
      console.warn(`No trackers for detector: ${detectorId}`);
      return null;
    }

    if (!isActive) {
      // Check start conditions
      return this.checkStartConditions(detector, currentValues, timestamp, trackers.start);
    } else {
      // Check end conditions
      return this.checkEndConditions(detector, currentValues, timestamp, trackers.end);
    }
  }

  /**
   * Check if start conditions are met
   */
  checkStartConditions(detector, currentValues, timestamp, startTracker) {
    const startMatches = this.conditionEvaluator.evaluate(
      detector.startConditions,
      currentValues
    );
    
    const stability = startTracker.evaluate(startMatches, timestamp);
    
    if (stability.justStabilized) {
      // Event started!
      const event = this.createStartEvent(detector, currentValues, timestamp);
      this.activeEvents.set(detector.id, event);
      
      // Reset end tracker for next cycle
      const endTracker = this.stabilityTrackers.get(detector.id)?.end;
      if (endTracker) {
        endTracker.reset();
      }
      
      return event;
    }
    
    return null;
  }

  /**
   * Check if end conditions are met
   */
  checkEndConditions(detector, currentValues, timestamp, endTracker) {
    const endMatches = this.conditionEvaluator.evaluate(
      detector.endConditions,
      currentValues
    );
    
    const stability = endTracker.evaluate(endMatches, timestamp);
    
    if (stability.justStabilized) {
      // Event ended!
      const event = this.createEndEvent(detector, currentValues, timestamp);
      this.activeEvents.delete(detector.id);
      
      // Reset start tracker for next cycle
      const startTracker = this.stabilityTrackers.get(detector.id)?.start;
      if (startTracker) {
        startTracker.reset();
      }
      
      return event;
    }
    
    return null;
  }

  /**
   * Create a new event object when event starts
   */
  createStartEvent(detector, currentValues, timestamp) {
    const eventId = `${detector.id}_${timestamp.toISOString().replace(/[:.]/g, '')}`;
    
    const event = {
      eventId,
      detectorId: detector.id,
      name: detector.name,
      description: detector.description,
      type: detector.type || 'duration',
      state: detector.autoConfirm ? 'auto_confirmed' : 'active',
      category: detector.category || 'general',
      tags: detector.tags || [],
      
      startTime: timestamp,
      endTime: null,
      duration: null,
      
      startData: this.captureData(detector.captureData, currentValues),
      endData: null,
      
      userNotes: '',
      userFields: {},
      
      notifications: {
        enabled: detector.notifications?.enabled || false,
        sent: []
      },
      
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    return event;
  }

  /**
   * Update event when it ends
   */
  createEndEvent(detector, currentValues, timestamp) {
    const activeEvent = this.activeEvents.get(detector.id);
    
    if (!activeEvent) {
      console.warn(`No active event found for detector: ${detector.id}`);
      return null;
    }
    
    // Calculate duration
    const duration = Math.floor((timestamp - new Date(activeEvent.startTime)) / 1000); // seconds
    
    // Update event
    const endedEvent = {
      ...activeEvent,
      endTime: timestamp,
      duration,
      endData: this.captureData(detector.captureData, currentValues),
      state: detector.autoConfirm ? 'auto_confirmed' : 'pending',
      updatedAt: timestamp
    };
    
    return endedEvent;
  }

  /**
   * Capture specified data paths from current values
   * @param {Array|String} captureSpec - Paths to capture (array or comma-separated string)
   * @param {Object} currentValues - Current data values
   * @returns {Object} - Captured data
   */
  captureData(captureSpec, currentValues) {
    if (!captureSpec) return {};
    
    const paths = Array.isArray(captureSpec) 
      ? captureSpec 
      : captureSpec.split(',').map(p => p.trim());
    
    const captured = {};
    
    for (const path of paths) {
      if (currentValues[path] !== undefined) {
        captured[path] = currentValues[path];
      } else if (path.includes('*')) {
        // Wildcard - capture all matching paths
        const regex = new RegExp('^' + path.replace(/\*/g, '[^.]+') + '$');
        for (const [p, value] of Object.entries(currentValues)) {
          if (regex.test(p)) {
            captured[p] = value;
          }
        }
      }
    }
    
    return captured;
  }

  /**
   * Get all active events
   * @returns {Array} - Array of active event objects
   */
  getActiveEvents() {
    return Array.from(this.activeEvents.values());
  }

  /**
   * Get active event for specific detector
   * @param {String} detectorId - Detector ID
   * @returns {Object|null} - Active event or null
   */
  getActiveEvent(detectorId) {
    return this.activeEvents.get(detectorId) || null;
  }

  /**
   * Check if detector has an active event
   * @param {String} detectorId - Detector ID
   * @returns {Boolean}
   */
  isDetectorActive(detectorId) {
    return this.activeEvents.has(detectorId);
  }

  /**
   * Get stability tracker states (for debugging)
   */
  getTrackerStates() {
    const states = {};
    for (const [detectorId, trackers] of this.stabilityTrackers.entries()) {
      states[detectorId] = {
        start: trackers.start.getState(),
        end: trackers.end.getState()
      };
    }
    return states;
  }

  /**
   * Reset all state (for testing or recovery)
   */
  reset() {
    this.activeEvents.clear();
    this.initializeTrackers();
  }
}
