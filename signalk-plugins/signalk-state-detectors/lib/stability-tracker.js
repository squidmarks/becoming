/**
 * Tracks condition stability over time with debouncing
 * Requires N consecutive samples to be true within a time window
 */
class StabilityTracker {
  constructor(name, config = {}) {
    this.name = name;
    
    // Default: 2 consecutive samples within 30 seconds
    this.consecutiveSamples = config.consecutiveSamples || 2;
    this.withinDuration = config.withinDuration || 30; // seconds
    
    // State
    this.evaluations = []; // [{timestamp, result}]
    this.isStable = false;
    this.stableStartTime = null;
  }

  /**
   * Evaluate current condition result
   * @param {Boolean} currentResult - True if condition matches
   * @param {Date} timestamp - Current timestamp
   * @returns {Object} - {stable, justStabilized, justLost}
   */
  evaluate(currentResult, timestamp = new Date()) {
    // Add current evaluation
    this.evaluations.push({
      timestamp,
      result: currentResult
    });

    // If false, reset immediately (strict debouncing)
    if (!currentResult) {
      const wasStable = this.isStable;
      this.reset();
      
      return {
        stable: false,
        justStabilized: false,
        justLost: wasStable
      };
    }

    // Check if we've achieved stability
    return this.checkStability();
  }

  /**
   * Check if conditions are stable
   * @returns {Object} - Stability status
   */
  checkStability() {
    // Need at least N consecutive samples
    if (this.evaluations.length < this.consecutiveSamples) {
      return {
        stable: false,
        justStabilized: false,
        justLost: false
      };
    }

    // Get last N samples
    const recentSamples = this.evaluations.slice(-this.consecutiveSamples);

    // All must be true (already guaranteed by reset logic, but double-check)
    const allTrue = recentSamples.every(e => e.result === true);
    if (!allTrue) {
      return {
        stable: false,
        justStabilized: false,
        justLost: false
      };
    }

    // Check time window
    const oldestSample = recentSamples[0];
    const newestSample = recentSamples[recentSamples.length - 1];
    const timeSpan = (newestSample.timestamp - oldestSample.timestamp) / 1000; // seconds

    if (timeSpan > this.withinDuration) {
      // Samples too spread out, not stable yet
      return {
        stable: false,
        justStabilized: false,
        justLost: false
      };
    }

    // We're stable!
    const wasStable = this.isStable;
    this.isStable = true;
    
    if (!this.stableStartTime) {
      this.stableStartTime = newestSample.timestamp;
    }

    return {
      stable: true,
      justStabilized: !wasStable, // Just became stable
      justLost: false
    };
  }

  /**
   * Reset stability state
   */
  reset() {
    this.evaluations = [];
    this.isStable = false;
    this.stableStartTime = null;
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      name: this.name,
      isStable: this.isStable,
      sampleCount: this.evaluations.length,
      requiredSamples: this.consecutiveSamples,
      withinDuration: this.withinDuration,
      stableStartTime: this.stableStartTime
    };
  }
}

module.exports = { StabilityTracker };
