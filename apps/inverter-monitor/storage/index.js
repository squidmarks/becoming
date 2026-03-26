/**
 * Storage Factory
 * 
 * Returns the configured storage implementation.
 * Makes it easy to swap storage backends via config.
 */

import { CsvStorage } from './csv-storage.js';
import { MongoStorage } from './mongo-storage.js';
// Future imports:
// import { InfluxStorage } from './influx-storage.js';

/**
 * Create storage instance based on configuration
 * @param {string} type - Storage type: 'csv', 'mongo', 'influx'
 * @param {Object} config - Storage-specific configuration
 * @returns {StorageInterface}
 */
export function createStorage(type = 'csv', config = {}) {
  switch (type.toLowerCase()) {
    case 'csv':
      return new CsvStorage(
        config.logDir || './logs',
        config.retentionDays || 7
      );
    
    case 'mongo':
    case 'mongodb':
      if (!config.connectionString) {
        throw new Error('MongoDB requires connectionString in config');
      }
      return new MongoStorage(
        config.connectionString, 
        config.database || 'becoming',
        config.collection || 'power'
      );
    
    // Future implementations:
    // case 'influx':
    //   return new InfluxStorage(config.url, config.token, config.org, config.bucket);
    
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

export { StorageInterface } from './storage-interface.js';
export { CsvStorage } from './csv-storage.js';
export { MongoStorage } from './mongo-storage.js';
export { StorageManager } from './storage-manager.js';
