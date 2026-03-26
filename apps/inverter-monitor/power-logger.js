/**
 * Power Logger - CSV-based power consumption tracking
 * 
 * Aggregates power data over 5-minute intervals and writes to CSV.
 * Automatically rotates logs to keep last 7 days.
 */

const fs = require('fs').promises;
const path = require('path');

class PowerLogger {
  constructor(logDir = './logs', intervalMinutes = 5, retentionDays = 7) {
    this.logDir = logDir;
    this.intervalMs = intervalMinutes * 60 * 1000;
    this.retentionDays = retentionDays;
    
    // Aggregation buffers for current interval
    this.currentInterval = {
      startTime: null,
      samples: [],
    };
    
    this.intervalTimer = null;
    this.initialized = false;
  }

  async init() {
    // Create logs directory if it doesn't exist
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      console.log(`✓ Power logger initialized: ${this.logDir}`);
      console.log(`  Interval: ${this.intervalMs / 60000} minutes`);
      console.log(`  Retention: ${this.retentionDays} days`);
      
      this.initialized = true;
      this.startInterval();
      
      // Clean old logs on startup
      await this.cleanOldLogs();
      
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
   * Write aggregated interval data to CSV
   */
  async writeInterval() {
    if (this.currentInterval.samples.length === 0) {
      console.log('⚠ No samples in interval, skipping write');
      this.currentInterval.startTime = Date.now();
      return;
    }

    try {
      const aggregated = this.aggregateSamples(this.currentInterval.samples);
      const csvRow = this.formatCsvRow(aggregated);
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `power-${today}.csv`;
      const filepath = path.join(this.logDir, filename);
      
      // Check if file exists to determine if we need header
      let needsHeader = false;
      try {
        await fs.access(filepath);
      } catch {
        needsHeader = true;
      }
      
      // Write header if new file
      if (needsHeader) {
        const header = 'timestamp,dc_voltage_avg,dc_current_avg,dc_power_avg,ac_l1_power_avg,ac_l2_power_avg,ac_total_power_avg,soc_avg,sample_count\n';
        await fs.writeFile(filepath, header, 'utf8');
      }
      
      // Append data
      await fs.appendFile(filepath, csvRow + '\n', 'utf8');
      
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
   * Format aggregated data as CSV row
   */
  formatCsvRow(data) {
    return [
      data.timestamp,
      data.dcVoltage.toFixed(1),
      data.dcCurrent.toFixed(2),
      data.dcPower.toFixed(1),
      data.acL1Power.toFixed(1),
      data.acL2Power.toFixed(1),
      data.acTotalPower.toFixed(1),
      data.soc.toFixed(1),
      data.count,
    ].join(',');
  }

  /**
   * Clean log files older than retention period
   */
  async cleanOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const powerLogFiles = files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      let deletedCount = 0;
      
      for (const file of powerLogFiles) {
        // Extract date from filename: power-YYYY-MM-DD.csv
        const match = file.match(/power-(\d{4}-\d{2}-\d{2})\.csv/);
        if (match) {
          const fileDate = match[1];
          if (fileDate < cutoffStr) {
            await fs.unlink(path.join(this.logDir, file));
            deletedCount++;
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🗑️  Cleaned ${deletedCount} old power log(s)`);
      }
      
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }

  /**
   * Get summary stats for a date range
   */
  async getSummary(startDate, endDate = null) {
    // Future: implement summary stats from CSV files
    // For now, just return file list
    try {
      const files = await fs.readdir(this.logDir);
      return files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
    } catch (error) {
      console.error('Error getting summary:', error);
      return [];
    }
  }

  /**
   * Stop logging and clean up
   */
  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    
    // Write any remaining samples
    if (this.currentInterval.samples.length > 0) {
      this.writeInterval();
    }
    
    console.log('Power logger stopped');
  }
}

module.exports = PowerLogger;
