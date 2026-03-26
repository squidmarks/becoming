/**
 * CSV Storage Implementation
 * 
 * Stores power data in daily CSV files with automatic rotation.
 * Files: logs/power-YYYY-MM-DD.csv
 */

import { promises as fs } from 'fs';
import path from 'path';
import { StorageInterface } from './storage-interface.js';

export class CsvStorage extends StorageInterface {
  constructor(logDir = './logs', retentionDays = 7) {
    super();
    this.logDir = logDir;
    this.retentionDays = retentionDays;
    this.initialized = false;
  }

  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      console.log(`✓ CSV storage initialized: ${this.logDir}`);
      console.log(`  Retention: ${this.retentionDays} days`);
      this.initialized = true;
      
      // Clean old files on init
      await this.cleanOldData(this.retentionDays);
    } catch (error) {
      console.error('Failed to initialize CSV storage:', error);
      throw error;
    }
  }

  async writeSample(sample) {
    if (!this.initialized) {
      throw new Error('Storage not initialized. Call init() first.');
    }

    try {
      const date = new Date(sample.timestamp).toISOString().split('T')[0];
      const filename = `power-${date}.csv`;
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
        const header = 'timestamp,dc_voltage_avg,dc_current_avg,dc_power_avg,ac_l1_power_avg,ac_l2_power_avg,ac_total_power_avg,soc_avg,inverter_state,sample_count\n';
        await fs.writeFile(filepath, header, 'utf8');
      }
      
      // Format and append data
      const row = this.formatCsvRow(sample);
      await fs.appendFile(filepath, row + '\n', 'utf8');
      
    } catch (error) {
      console.error('Error writing sample to CSV:', error);
      throw error;
    }
  }

  async querySamples(startTime, endTime, aggregation = 'raw') {
    if (!this.initialized) {
      throw new Error('Storage not initialized. Call init() first.');
    }

    try {
      // Get all relevant CSV files in date range
      const files = await this.getFilesInRange(startTime, endTime);
      
      // Read and parse all files
      let allSamples = [];
      for (const file of files) {
        const filepath = path.join(this.logDir, file);
        const samples = await this.readCsvFile(filepath);
        
        // Filter by exact time range
        const filtered = samples.filter(s => {
          const ts = new Date(s.timestamp);
          return ts >= startTime && ts <= endTime;
        });
        
        allSamples = allSamples.concat(filtered);
      }
      
      // Sort by timestamp
      allSamples.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Aggregate if requested
      if (aggregation !== 'raw') {
        return this.aggregateSamples(allSamples, aggregation);
      }
      
      return allSamples;
      
    } catch (error) {
      console.error('Error querying samples:', error);
      throw error;
    }
  }

  async getDateRange() {
    try {
      const files = await fs.readdir(this.logDir);
      const powerFiles = files
        .filter(f => f.startsWith('power-') && f.endsWith('.csv'))
        .sort();
      
      if (powerFiles.length === 0) {
        return { start: null, end: null };
      }
      
      // Extract dates from filenames
      const startDate = powerFiles[0].match(/power-(\d{4}-\d{2}-\d{2})\.csv/)[1];
      const endDate = powerFiles[powerFiles.length - 1].match(/power-(\d{4}-\d{2}-\d{2})\.csv/)[1];
      
      return {
        start: new Date(startDate + 'T00:00:00Z'),
        end: new Date(endDate + 'T23:59:59Z'),
      };
      
    } catch (error) {
      console.error('Error getting date range:', error);
      return { start: null, end: null };
    }
  }

  async cleanOldData(retentionDays) {
    try {
      const files = await fs.readdir(this.logDir);
      const powerLogFiles = files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      let deletedCount = 0;
      
      for (const file of powerLogFiles) {
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
        console.log(`🗑️  Cleaned ${deletedCount} old CSV log(s)`);
      }
      
    } catch (error) {
      console.error('Error cleaning old data:', error);
    }
  }

  async getStats() {
    try {
      const files = await fs.readdir(this.logDir);
      const powerFiles = files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
      
      let totalSize = 0;
      let totalRecords = 0;
      
      for (const file of powerFiles) {
        const filepath = path.join(this.logDir, file);
        const stats = await fs.stat(filepath);
        totalSize += stats.size;
        
        // Count lines (records)
        const content = await fs.readFile(filepath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        totalRecords += Math.max(0, lines.length - 1); // Subtract header
      }
      
      return {
        fileCount: powerFiles.length,
        totalSize,
        totalRecords,
        storageType: 'csv',
      };
      
    } catch (error) {
      console.error('Error getting stats:', error);
      return { fileCount: 0, totalSize: 0, totalRecords: 0 };
    }
  }

  async close() {
    // CSV storage doesn't need cleanup
    this.initialized = false;
  }

  // ========== Helper Methods ==========

  formatCsvRow(sample) {
    return [
      sample.timestamp,
      sample.dcVoltage.toFixed(1),
      sample.dcCurrent.toFixed(2),
      sample.dcPower.toFixed(1),
      sample.acL1Power.toFixed(1),
      sample.acL2Power.toFixed(1),
      sample.acTotalPower.toFixed(1),
      sample.soc.toFixed(1),
      sample.inverterState || 0,
      sample.sampleCount,
    ].join(',');
  }

  async getFilesInRange(startTime, endTime) {
    const files = await fs.readdir(this.logDir);
    const powerFiles = files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
    
    const startDate = startTime.toISOString().split('T')[0];
    const endDate = endTime.toISOString().split('T')[0];
    
    return powerFiles.filter(file => {
      const match = file.match(/power-(\d{4}-\d{2}-\d{2})\.csv/);
      if (!match) return false;
      const fileDate = match[1];
      return fileDate >= startDate && fileDate <= endDate;
    }).sort();
  }

  async readCsvFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const lines = content.trim().split('\n');
      
      if (lines.length <= 1) return []; // No data (just header or empty)
      
      const samples = [];
      for (let i = 1; i < lines.length; i++) { // Skip header
        const parts = lines[i].split(',');
        if (parts.length >= 9) {
          samples.push({
            timestamp: parts[0],
            dcVoltage: parseFloat(parts[1]),
            dcCurrent: parseFloat(parts[2]),
            dcPower: parseFloat(parts[3]),
            acL1Power: parseFloat(parts[4]),
            acL2Power: parseFloat(parts[5]),
            acTotalPower: parseFloat(parts[6]),
            soc: parseFloat(parts[7]),
            inverterState: parts.length >= 10 ? parseInt(parts[8], 10) : 0,
            sampleCount: parseInt(parts[parts.length - 1], 10),
          });
        }
      }
      
      return samples;
      
    } catch (error) {
      console.error(`Error reading CSV file ${filepath}:`, error);
      return [];
    }
  }

  aggregateSamples(samples, aggregation) {
    if (samples.length === 0) return [];
    
    // Determine bucket size based on aggregation
    let bucketMs;
    switch (aggregation) {
      case 'hour':
        bucketMs = 60 * 60 * 1000; // 1 hour
        break;
      case 'day':
        bucketMs = 24 * 60 * 60 * 1000; // 1 day
        break;
      case 'week':
        bucketMs = 7 * 24 * 60 * 60 * 1000; // 1 week
        break;
      case 'month':
        bucketMs = 30 * 24 * 60 * 60 * 1000; // 30 days (approx)
        break;
      default:
        return samples; // No aggregation
    }
    
    // Group samples into buckets
    const buckets = new Map();
    
    for (const sample of samples) {
      const ts = new Date(sample.timestamp).getTime();
      const bucketKey = Math.floor(ts / bucketMs) * bucketMs;
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey).push(sample);
    }
    
    // Aggregate each bucket
    const aggregated = [];
    for (const [bucketKey, bucketSamples] of buckets) {
      const avg = {
        timestamp: new Date(bucketKey).toISOString(),
        dcVoltage: 0,
        dcCurrent: 0,
        dcPower: 0,
        acL1Power: 0,
        acL2Power: 0,
        acTotalPower: 0,
        soc: 0,
        inverterState: 0,
        sampleCount: bucketSamples.length,
      };
      
      let inverterStateSum = 0;
      for (const s of bucketSamples) {
        avg.dcVoltage += s.dcVoltage;
        avg.dcCurrent += s.dcCurrent;
        avg.dcPower += s.dcPower; // Sum preserves sign
        avg.acL1Power += s.acL1Power;
        avg.acL2Power += s.acL2Power;
        avg.acTotalPower += s.acTotalPower;
        avg.soc += s.soc;
        inverterStateSum += s.inverterState || 0;
      }
      
      const count = bucketSamples.length;
      avg.dcVoltage /= count;
      avg.dcCurrent /= count;
      avg.dcPower /= count; // Average preserves sign
      avg.acL1Power /= count;
      avg.acL2Power /= count;
      avg.acTotalPower /= count;
      avg.soc /= count;
      avg.inverterState = Math.round(inverterStateSum / count);
      
      aggregated.push(avg);
    }
    
    return aggregated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}
