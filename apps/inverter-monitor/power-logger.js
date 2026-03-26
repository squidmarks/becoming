/**
 * Power Logger - Aggregates power data and writes to storage
 * 
 * Aggregates power data over configurable intervals and writes to storage backend.
 * Storage backend is pluggable (CSV, MongoDB, InfluxDB, etc.)
 */

export class PowerLogger {
  constructor(storage, intervalMinutes = 5) {
    this.storage = storage;
    this.intervalMs = intervalMinutes * 60 * 1000;
    
    // Aggregation buffers for current interval
    this.currentInterval = {
      startTime: null,
      samples: [],
    };
    
    this.intervalTimer = null;
    this.initialized = false;
  }

  async init() {
    try {
      // Initialize storage backend
      await this.storage.init();
      
      console.log(`✓ Power logger initialized`);
      console.log(`  Interval: ${this.intervalMs / 60000} minutes`);
      
      this.initialized = true;
      this.startInterval();
      
    } catch (error) {
      console.error('Failed to initialize power logger:', error);
      throw error;
    }
  }

  startInterval() {
    this.currentInterval.startTime = Date.now();
    this.currentInterval.samples = [];
    
    // Set timer to write aggregated data at interval
    this.intervalTimer = setInterval(() => {
      this.writeInterval();
    }, this.intervalMs);
  }

  /**
   * Add a data sample to the current interval
   */
  addSample(data) {
    if (!this.initialized) return;
    
    try {
      const { battery, ac } = data;
      
      // Calculate DC power (V * A)
      const dcPower = (battery?.voltage || 0) * (battery?.current || 0);
      
      // Get AC power (sum of both phases)
      const acL1Power = ac?.load?.l1?.activePower || 0;
      const acL2Power = ac?.load?.l2?.activePower || 0;
      const acTotalPower = acL1Power + acL2Power;
      
      this.currentInterval.samples.push({
        timestamp: Date.now(),
        dcVoltage: battery?.voltage || 0,
        dcCurrent: battery?.current || 0,
        dcPower,
        acL1Power,
        acL2Power,
        acTotalPower,
        soc: battery?.soc || 0,
      });
      
    } catch (error) {
      console.error('Error adding power sample:', error);
    }
  }

  /**
   * Write aggregated interval data to storage
   */
  async writeInterval() {
    if (this.currentInterval.samples.length === 0) {
      console.log('⚠ No samples in interval, skipping write');
      this.currentInterval.startTime = Date.now();
      return;
    }

    try {
      const aggregated = this.aggregateSamples(this.currentInterval.samples);
      
      // Write to storage backend
      await this.storage.writeSample({
        timestamp: aggregated.timestamp,
        dcVoltage: aggregated.dcVoltage,
        dcCurrent: aggregated.dcCurrent,
        dcPower: aggregated.dcPower,
        acL1Power: aggregated.acL1Power,
        acL2Power: aggregated.acL2Power,
        acTotalPower: aggregated.acTotalPower,
        soc: aggregated.soc,
        sampleCount: aggregated.count,
      });
      
      console.log(`📊 Power logged: DC ${aggregated.dcPower.toFixed(0)}W, AC ${aggregated.acTotalPower.toFixed(0)}W, SOC ${aggregated.soc.toFixed(1)}%`);
      
    } catch (error) {
      console.error('Error writing power log:', error);
    }
    
    // Reset for next interval
    this.currentInterval.startTime = Date.now();
    this.currentInterval.samples = [];
  }

  /**
   * Aggregate samples using averages
   */
  aggregateSamples(samples) {
    const count = samples.length;
    
    const sum = samples.reduce((acc, s) => {
      acc.dcVoltage += s.dcVoltage;
      acc.dcCurrent += s.dcCurrent;
      acc.dcPower += s.dcPower;
      acc.acL1Power += s.acL1Power;
      acc.acL2Power += s.acL2Power;
      acc.acTotalPower += s.acTotalPower;
      acc.soc += s.soc;
      return acc;
    }, {
      dcVoltage: 0,
      dcCurrent: 0,
      dcPower: 0,
      acL1Power: 0,
      acL2Power: 0,
      acTotalPower: 0,
      soc: 0,
    });
    
    return {
      timestamp: new Date(this.currentInterval.startTime).toISOString(),
      dcVoltage: sum.dcVoltage / count,
      dcCurrent: sum.dcCurrent / count,
      dcPower: sum.dcPower / count,
      acL1Power: sum.acL1Power / count,
      acL2Power: sum.acL2Power / count,
      acTotalPower: sum.acTotalPower / count,
      soc: sum.soc / count,
      count,
    };
  }

  /**
   * Query power data (delegates to storage)
   */
  async query(startTime, endTime, aggregation = 'raw') {
    return await this.storage.querySamples(startTime, endTime, aggregation);
  }

  /**
   * Get available date range
   */
  async getDateRange() {
    return await this.storage.getDateRange();
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    return await this.storage.getStats();
  }

  /**
   * Stop logging and clean up
   */
  async stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    
    // Write any remaining samples
    if (this.currentInterval.samples.length > 0) {
      await this.writeInterval();
    }
    
    // Close storage connection
    await this.storage.close();
    
    console.log('Power logger stopped');
  }
}
