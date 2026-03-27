import { promises as fs } from 'fs';
import path from 'path';

/**
 * Event Logger for tracking discrete inverter events
 * Examples: state changes, faults, configuration updates, etc.
 */
export class EventLogger {
  constructor(config = {}) {
    this.logDir = config.logDir || './data/events';
    this.currentFile = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.initialized = true;
      console.log(`✓ Event logger initialized (${this.logDir})`);
    } catch (error) {
      console.error('Failed to initialize event logger:', error.message);
      throw error;
    }
  }

  getCurrentLogFile() {
    // One CSV file per month: events-YYYY-MM.csv
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return path.join(this.logDir, `events-${year}-${month}.csv`);
  }

  async ensureLogFile() {
    const logFile = this.getCurrentLogFile();
    
    // Check if file exists
    try {
      await fs.access(logFile);
    } catch {
      // File doesn't exist, create with header
      const header = 'timestamp,eventType,details\n';
      await fs.writeFile(logFile, header, 'utf8');
      console.log(`✓ Created new event log file: ${path.basename(logFile)}`);
    }
    
    return logFile;
  }

  escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Log an event
   * @param {string} eventType - Type of event (e.g., 'state_change', 'fault', 'config_update')
   * @param {object} details - Event details (will be JSON stringified)
   */
  async logEvent(eventType, details = {}) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const logFile = await this.ensureLogFile();
      const timestamp = new Date().toISOString();
      const detailsJson = JSON.stringify(details);
      
      const row = `${timestamp},${this.escapeCSV(eventType)},${this.escapeCSV(detailsJson)}\n`;
      
      await fs.appendFile(logFile, row, 'utf8');
    } catch (error) {
      console.error('Failed to log event:', error.message);
    }
  }

  /**
   * Get the most recent event of a specific type
   * @param {string} eventType - Type of event to find
   * @param {number} lookbackDays - How many days back to search (default: 7)
   */
  async getLastEvent(eventType, lookbackDays = 7) {
    try {
      // Generate list of files to check (current month + previous months)
      const filesToCheck = [];
      const now = new Date();
      
      for (let i = 0; i < lookbackDays / 30 + 1; i++) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        filesToCheck.push(path.join(this.logDir, `events-${year}-${month}.csv`));
      }

      // Read files in reverse order (newest first)
      for (const file of filesToCheck) {
        try {
          const content = await fs.readFile(file, 'utf8');
          const lines = content.trim().split('\n').reverse(); // Reverse to start from end
          
          for (const line of lines) {
            if (line.startsWith('timestamp,')) continue; // Skip header
            
            const [timestamp, type, detailsStr] = this.parseCSVLine(line);
            
            if (type === eventType) {
              return {
                timestamp: new Date(timestamp),
                eventType: type,
                details: detailsStr ? JSON.parse(detailsStr) : {}
              };
            }
          }
        } catch (error) {
          // File doesn't exist or can't be read, continue to next
          continue;
        }
      }
      
      return null; // No event found
    } catch (error) {
      console.error('Failed to get last event:', error.message);
      return null;
    }
  }

  parseCSVLine(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current); // Add last part
    
    return parts;
  }
}
