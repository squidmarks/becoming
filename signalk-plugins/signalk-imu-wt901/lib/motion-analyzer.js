/**
 * Motion Analyzer for Sea State Determination
 * Analyzes high-frequency IMU data to determine sea state and comfort metrics
 */

class MotionAnalyzer {
  constructor(config = {}) {
    this.windowSize = config.windowSize || 60000; // 60 seconds in ms
    this.updateInterval = config.updateInterval || 10000; // Update every 10 seconds
    
    // Rolling buffers for motion data
    this.rollBuffer = [];
    this.pitchBuffer = [];
    this.accelBuffer = [];
    
    this.lastUpdate = Date.now();
    this.currentMetrics = this.getEmptyMetrics();
  }

  /**
   * Add new attitude data point
   */
  addAttitude(roll, pitch, timestamp) {
    const now = timestamp || Date.now();
    
    this.rollBuffer.push({ value: roll, timestamp: now });
    this.pitchBuffer.push({ value: pitch, timestamp: now });
    
    // Clean old data
    this.cleanup(now);
    
    // Update metrics if interval elapsed
    if (now - this.lastUpdate >= this.updateInterval) {
      this.calculateMetrics();
      this.lastUpdate = now;
    }
  }

  /**
   * Add new acceleration data point
   */
  addAcceleration(x, y, z, timestamp) {
    const now = timestamp || Date.now();
    
    // Calculate magnitude
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    this.accelBuffer.push({ x, y, z, magnitude, timestamp: now });
    
    this.cleanup(now);
  }

  /**
   * Remove data points outside the window
   */
  cleanup(now) {
    const cutoff = now - this.windowSize;
    
    this.rollBuffer = this.rollBuffer.filter(d => d.timestamp > cutoff);
    this.pitchBuffer = this.pitchBuffer.filter(d => d.timestamp > cutoff);
    this.accelBuffer = this.accelBuffer.filter(d => d.timestamp > cutoff);
  }

  /**
   * Calculate sea state metrics
   */
  calculateMetrics() {
    if (this.rollBuffer.length < 10) {
      this.currentMetrics = this.getEmptyMetrics();
      return;
    }

    // Calculate RMS (Root Mean Square) for roll and pitch
    const rollRMS = this.calculateRMS(this.rollBuffer.map(d => d.value));
    const pitchRMS = this.calculateRMS(this.pitchBuffer.map(d => d.value));
    
    // Calculate maximum excursions
    const rollMax = Math.max(...this.rollBuffer.map(d => Math.abs(d.value)));
    const pitchMax = Math.max(...this.pitchBuffer.map(d => Math.abs(d.value)));
    
    // Calculate acceleration statistics
    let accelRMS = 0;
    let accelMax = 0;
    if (this.accelBuffer.length > 0) {
      accelRMS = this.calculateRMS(this.accelBuffer.map(d => d.magnitude));
      accelMax = Math.max(...this.accelBuffer.map(d => d.magnitude));
    }
    
    // Calculate motion period (dominant frequency)
    const period = this.estimatePeriod(this.rollBuffer);
    
    // Convert to degrees for easier interpretation
    const rollRMSDeg = rollRMS * 180 / Math.PI;
    const pitchRMSDeg = pitchRMS * 180 / Math.PI;
    const rollMaxDeg = rollMax * 180 / Math.PI;
    const pitchMaxDeg = pitchMax * 180 / Math.PI;
    
    // Calculate intensity indices (0-10 scale)
    const rollIntensity = this.calculateIntensity(rollRMSDeg, rollMaxDeg);
    const pitchIntensity = this.calculateIntensity(pitchRMSDeg, pitchMaxDeg);
    
    // Overall motion index (weighted combination)
    const motionIndex = (rollIntensity * 0.6 + pitchIntensity * 0.4).toFixed(1);
    
    // Comfort index (inverse of motion, 10 = very comfortable)
    const comfort = (10 - parseFloat(motionIndex)).toFixed(1);
    
    // Sea state description
    const description = this.getSeaStateDescription(parseFloat(motionIndex), period);
    
    this.currentMetrics = {
      rollIntensity: parseFloat(rollIntensity.toFixed(1)),
      pitchIntensity: parseFloat(pitchIntensity.toFixed(1)),
      motionIndex: parseFloat(motionIndex),
      comfort: parseFloat(comfort),
      description,
      rollRMS: rollRMSDeg,
      pitchRMS: pitchRMSDeg,
      rollMax: rollMaxDeg,
      pitchMax: pitchMaxDeg,
      period,
      accelRMS,
      accelMax,
      sampleCount: this.rollBuffer.length
    };
  }

  /**
   * Calculate Root Mean Square
   */
  calculateRMS(values) {
    if (values.length === 0) return 0;
    const sumSquares = values.reduce((sum, v) => sum + v * v, 0);
    return Math.sqrt(sumSquares / values.length);
  }

  /**
   * Calculate intensity on 0-10 scale based on RMS and max values
   * 
   * Scale based on realistic marine conditions:
   * < 2° RMS = Calm (0-1)
   * 2-5° RMS = Light chop (1-2.5)
   * 5-9° RMS = Moderate (2.5-4.5)
   * 9-13° RMS = Rough (4.5-6.5)
   * 13-17° RMS = Very rough (6.5-8.5)
   * > 17° RMS = Heavy seas (8.5-10)
   */
  calculateIntensity(rms, max) {
    // Use realistic marine scale where 17° RMS = intensity 10
    let intensity = (rms / 17) * 10;
    
    // Add contribution from max excursion (occasional large rolls)
    // 30° max adds up to +2 points
    const maxFactor = Math.min(max / 30, 1) * 2;
    intensity += maxFactor;
    
    // Clamp to 0-10
    return Math.max(0, Math.min(10, intensity));
  }

  /**
   * Estimate dominant motion period using zero-crossing method
   */
  estimatePeriod(buffer) {
    if (buffer.length < 20) return null;
    
    const values = buffer.map(d => d.value);
    const timestamps = buffer.map(d => d.timestamp);
    
    // Find zero crossings (approximate)
    const crossings = [];
    for (let i = 1; i < values.length; i++) {
      if ((values[i-1] >= 0 && values[i] < 0) || (values[i-1] <= 0 && values[i] > 0)) {
        crossings.push(timestamps[i]);
      }
    }
    
    if (crossings.length < 4) return null;
    
    // Calculate average time between crossings (half-period)
    const intervals = [];
    for (let i = 1; i < crossings.length; i++) {
      intervals.push(crossings[i] - crossings[i-1]);
    }
    
    const avgHalfPeriod = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const period = (avgHalfPeriod * 2) / 1000; // Convert to seconds
    
    // Sanity check: typical wave periods are 2-15 seconds
    if (period < 1 || period > 20) return null;
    
    return parseFloat(period.toFixed(1));
  }

  /**
   * Get sea state description based on motion index and period
   */
  getSeaStateDescription(motionIndex, period) {
    if (motionIndex < 1) {
      return 'calm';
    } else if (motionIndex < 2.5) {
      return 'light chop';
    } else if (motionIndex < 4.5) {
      return 'moderate';
    } else if (motionIndex < 6.5) {
      return 'rough';
    } else if (motionIndex < 8.5) {
      return 'very rough';
    } else {
      return 'heavy seas';
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.currentMetrics;
  }

  /**
   * Get empty metrics structure
   */
  getEmptyMetrics() {
    return {
      rollIntensity: 0,
      pitchIntensity: 0,
      motionIndex: 0,
      comfort: 10,
      description: 'calm',
      rollRMS: 0,
      pitchRMS: 0,
      rollMax: 0,
      pitchMax: 0,
      period: null,
      accelRMS: 0,
      accelMax: 0,
      sampleCount: 0
    };
  }

  /**
   * Reset analyzer state
   */
  reset() {
    this.rollBuffer = [];
    this.pitchBuffer = [];
    this.accelBuffer = [];
    this.currentMetrics = this.getEmptyMetrics();
    this.lastUpdate = Date.now();
  }
}

module.exports = { MotionAnalyzer };
