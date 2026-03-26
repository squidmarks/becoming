/**
 * Storage Factory
 * 
 * Returns the configured storage implementation.
 * Makes it easy to swap storage backends via config.
 */

import { CsvStorage } from './csv-storage.js';
// Future imports:
// import { MongoStorage } from './mongo-storage.js';
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
    
    // Future implementations:
    // case 'mongo':
    //   return new MongoStorage(config.connectionString, config.database);
    // 
    // case 'influx':
    //   return new InfluxStorage(config.url, config.token, config.org, config.bucket);
    
    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

export { StorageInterface } from './storage-interface.js';
export { CsvStorage } from './csv-storage.js';
