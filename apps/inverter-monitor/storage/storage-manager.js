/**
 * Storage Manager - Smart storage selection and migration
 * 
 * On startup:
 * 1. If MONGO_URI provided + reachable → Use MongoDB, migrate CSV data
 * 2. If MONGO_URI not provided or unreachable → Use CSV (local fallback)
 * 
 * This provides resilient storage for intermittent connectivity scenarios.
 */

import { createStorage } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';

export class StorageManager {
  /**
   * Initialize storage with smart selection
   * @param {Object} config - Configuration
   * @param {string} config.mongoUri - Optional MongoDB connection string
   * @param {string} config.csvLogDir - Local CSV directory
   * @param {number} config.retentionDays - CSV retention period
   * @returns {Promise<StorageInterface>}
   */
  static async initialize(config = {}) {
    const {
      mongoUri = process.env.MONGO_URI,
      csvLogDir = './logs',
      retentionDays = 7
    } = config;

    console.log('Initializing power data storage...');

    // Try MongoDB if URI provided
    if (mongoUri) {
      console.log('MongoDB URI detected, attempting connection...');
      
      try {
        const mongoStorage = createStorage('mongo', { 
          connectionString: mongoUri,
          database: 'becoming',
          collection: 'power'
        });
        
        await mongoStorage.init();
        console.log('✓ MongoDB connected successfully');
        
        // Migrate CSV data if exists
        await this.migrateCsvToMongo(csvLogDir, mongoStorage);
        
        return mongoStorage;
        
      } catch (error) {
        console.warn('⚠ MongoDB connection failed:', error.message);
        console.log('  Falling back to local CSV storage...');
      }
    }

    // Fallback to CSV
    console.log('Using local CSV storage');
    const csvStorage = createStorage('csv', { logDir: csvLogDir, retentionDays });
    await csvStorage.init();
    
    return csvStorage;
  }

  /**
   * Migrate CSV files to MongoDB and delete local files
   */
  static async migrateCsvToMongo(csvLogDir, mongoStorage) {
    try {
      const files = await fs.readdir(csvLogDir);
      const csvFiles = files.filter(f => f.startsWith('power-') && f.endsWith('.csv'));
      
      if (csvFiles.length === 0) {
        console.log('  No CSV files to migrate');
        return;
      }

      console.log(`  Found ${csvFiles.length} CSV file(s) to migrate`);
      let totalSamples = 0;

      for (const file of csvFiles) {
        const filepath = path.join(csvLogDir, file);
        const samples = await this.readCsvFile(filepath);
        
        if (samples.length > 0) {
          console.log(`  Migrating ${file}: ${samples.length} samples...`);
          
          // Write each sample to MongoDB
          for (const sample of samples) {
            await mongoStorage.writeSample(sample);
          }
          
          totalSamples += samples.length;
          
          // Delete CSV file after successful migration
          await fs.unlink(filepath);
          console.log(`  ✓ Migrated and deleted ${file}`);
        }
      }

      console.log(`✓ Migration complete: ${totalSamples} samples transferred to MongoDB`);
      console.log(`  Local CSV files deleted`);
      
    } catch (error) {
      console.error('Error during CSV migration:', error);
      console.log('  CSV files preserved, migration will retry on next restart');
    }
  }

  /**
   * Read a CSV file and parse samples
   */
  static async readCsvFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const lines = content.trim().split('\n');
      
      if (lines.length <= 1) return [];
      
      const samples = [];
      for (let i = 1; i < lines.length; i++) {
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
      console.error(`Error reading CSV ${filepath}:`, error);
      return [];
    }
  }
}
