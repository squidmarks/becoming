/**
 * Storage Interface - Abstract base class for power data storage
 * 
 * Implementations: CSV, MongoDB, InfluxDB, etc.
 * This interface ensures storage can be swapped without changing business logic.
 */

export class StorageInterface {
  /**
   * Initialize storage (create directories, connect to DB, etc.)
   */
  async init() {
    throw new Error('init() must be implemented');
  }

  /**
   * Write a power sample
   * @param {Object} sample - Power sample data
   * @param {string} sample.timestamp - ISO timestamp
   * @param {number} sample.dcVoltage - DC voltage (V)
   * @param {number} sample.dcCurrent - DC current (A)
   * @param {number} sample.dcPower - DC power (W) - negative=charging, positive=discharging
   * @param {number} sample.acL1Power - AC L1 power (W)
   * @param {number} sample.acL2Power - AC L2 power (W)
   * @param {number} sample.acTotalPower - Total AC power (W)
   * @param {number} sample.soc - State of charge (%)
   * @param {number} sample.inverterState - Inverter state code (0-5)
   * @param {number} sample.sampleCount - Number of raw samples aggregated
   */
  async writeSample(sample) {
    throw new Error('writeSample() must be implemented');
  }

  /**
   * Query power samples for a time range
   * @param {Date} startTime - Start of range
   * @param {Date} endTime - End of range
   * @param {string} aggregation - Aggregation level: 'raw', 'hour', 'day', 'week', 'month'
   * @returns {Promise<Array>} Array of samples
   */
  async querySamples(startTime, endTime, aggregation = 'raw') {
    throw new Error('querySamples() must be implemented');
  }

  /**
   * Get available date range (earliest and latest data)
   * @returns {Promise<{start: Date, end: Date}>}
   */
  async getDateRange() {
    throw new Error('getDateRange() must be implemented');
  }

  /**
   * Clean up old data based on retention policy
   * @param {number} retentionDays - Number of days to retain
   */
  async cleanOldData(retentionDays) {
    throw new Error('cleanOldData() must be implemented');
  }

  /**
   * Get storage statistics (size, record count, etc.)
   * @returns {Promise<Object>}
   */
  async getStats() {
    throw new Error('getStats() must be implemented');
  }

  /**
   * Close connections and cleanup
   */
  async close() {
    throw new Error('close() must be implemented');
  }
}
