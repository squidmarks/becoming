/**
 * Tracks condition stability over time with debouncing
 * Requires N consecutive samples of the same value within a time window
 */
class StabilityTracker {
  constructor(name, config = {}) {
    this.name = name;
    
    // Default: 2 consecutive samples within 30 seconds
    this.consecutiveSamples = config.consecutiveSamples || 2;
    this.withinDuration = config.withinDuration || 30; // seconds
    
    // State
    this.evaluations = []; // [{timestamp, result}]
    this.currentStableValue = null; // The currently stable boolean value (true/false/null)
  }

  /**
   * Evaluate current condition result
   * @param {Boolean} currentResult - True or false condition result
   * @param {Date} timestamp - Current timestamp
   * @returns {Object} - {stable, stableValue, justStabilized, justLost}
   */
  evaluate(currentResult, timestamp = new Date()) {
    // Add current evaluation
    this.evaluations.push({
      timestamp,
      result: Boolean(currentResult)
    });

    // Keep only recent evaluations (within time window + buffer)
    const cutoffTime = timestamp - (this.withinDuration * 2 * 1000);
    this.evaluations = this.evaluations.filter(e => e.timestamp >= cutoffTime);

    // Check if we've achieved stability
    return this.checkStability(Boolean(currentResult));
  }

  /**
   * Check if conditions are stable
   * @param {Boolean} currentResult - Current boolean result
   * @returns {Object} - Stability status
   */
  checkStability(currentResult) {
    // Need at least N consecutive samples
    if (this.evaluations.length < this.consecutiveSamples) {
      return {
        stable: false,
        stableValue: this.currentStableValue,
        justStabilized: false,
        justLost: false
      };
    }

    // Get last N samples
    const recentSamples = this.evaluations.slice(-this.consecutiveSamples);

    // Check if all are the same value
    const firstValue = recentSamples[0].result;
    const allSame = recentSamples.every(e => e.result === firstValue);
    
    if (!allSame) {
      // Not stable - samples are mixed
      return {
        stable: false,
        stableValue: this.currentStableValue,
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
        stableValue: this.currentStableValue,
        justStabilized: false,
        justLost: false
      };
    }

    // We're stable at this value!
    const wasStable = this.currentStableValue !== null;
    const stabilizedToNewValue = !wasStable || this.currentStableValue !== firstValue;
    const lostPreviousStability = wasStable && this.currentStableValue !== firstValue;
    
    this.currentStableValue = firstValue;

    return {
      stable: true,
      stableValue: firstValue,
      justStabilized: stabilizedToNewValue,
      justLost: lostPreviousStability
    };
  }

  /**
   * Reset stability state
   */
  reset() {
    this.evaluations = [];
    this.currentStableValue = null;
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      name: this.name,
      currentStableValue: this.currentStableValue,
      sampleCount: this.evaluations.length,
      requiredSamples: this.consecutiveSamples,
      withinDuration: this.withinDuration
    };
  }
}

module.exports = { StabilityTracker };
