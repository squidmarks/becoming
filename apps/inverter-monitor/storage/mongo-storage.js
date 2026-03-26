/**
 * MongoDB Storage Implementation
 * 
 * Stores power data in MongoDB with time-series optimization.
 * Requires: npm install mongodb
 */

import { MongoClient } from 'mongodb';
import { StorageInterface } from './storage-interface.js';

export class MongoStorage extends StorageInterface {
  constructor(connectionString, database = 'becoming', collection = 'power') {
    super();
    this.connectionString = connectionString;
    this.databaseName = database;
    this.collectionName = collection;
    this.client = null;
    this.db = null;
    this.collection = null;
    this.initialized = false;
  }

  async init() {
    try {
      // Connect with timeout
      this.client = new MongoClient(this.connectionString, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      
      await this.client.connect();
      
      this.db = this.client.db(this.databaseName);
      
      // Check if collection exists as time-series
      const collections = await this.db.listCollections({ name: this.collectionName }).toArray();
      
      if (collections.length === 0) {
        // Create as time-series collection
        await this.db.createCollection(this.collectionName, {
          timeseries: {
            timeField: 'timestamp',
            granularity: 'minutes'
          }
        });
        console.log(`✓ Created time-series collection: ${this.collectionName}`);
      }
      
      this.collection = this.db.collection(this.collectionName);
      
      // Create index on timestamp for fast queries
      await this.collection.createIndex({ timestamp: 1 });
      
      console.log(`✓ MongoDB storage initialized: ${this.databaseName}.${this.collectionName}`);
      this.initialized = true;
      
    } catch (error) {
      console.error('MongoDB initialization failed:', error.message);
      throw error;
    }
  }

  async writeSample(sample) {
    if (!this.initialized) {
      throw new Error('Storage not initialized. Call init() first.');
    }

    try {
      await this.collection.insertOne({
        timestamp: new Date(sample.timestamp),
        dcVoltage: sample.dcVoltage,
        dcCurrent: sample.dcCurrent,
        dcPower: sample.dcPower,
        acL1Power: sample.acL1Power,
        acL2Power: sample.acL2Power,
        acTotalPower: sample.acTotalPower,
        soc: sample.soc,
        inverterState: sample.inverterState,
        sampleCount: sample.sampleCount,
      });
      
    } catch (error) {
      console.error('Error writing sample to MongoDB:', error);
      throw error;
    }
  }

  async querySamples(startTime, endTime, aggregation = 'raw') {
    if (!this.initialized) {
      throw new Error('Storage not initialized. Call init() first.');
    }

    try {
      // Query samples in time range
      const samples = await this.collection
        .find({
          timestamp: {
            $gte: startTime,
            $lte: endTime
          }
        })
        .sort({ timestamp: 1 })
        .toArray();
      
      // Convert MongoDB documents to expected format
      const formatted = samples.map(doc => ({
        timestamp: doc.timestamp.toISOString(),
        dcVoltage: doc.dcVoltage,
        dcCurrent: doc.dcCurrent,
        dcPower: doc.dcPower,
        acL1Power: doc.acL1Power,
        acL2Power: doc.acL2Power,
        acTotalPower: doc.acTotalPower,
        soc: doc.soc,
        inverterState: doc.inverterState,
        sampleCount: doc.sampleCount,
      }));
      
      // Aggregate if requested
      if (aggregation !== 'raw') {
        return this.aggregateWithPipeline(startTime, endTime, aggregation);
      }
      
      return formatted;
      
    } catch (error) {
      console.error('Error querying MongoDB:', error);
      throw error;
    }
  }

  async aggregateWithPipeline(startTime, endTime, aggregation) {
    // Use MongoDB aggregation pipeline for efficient server-side aggregation
    let bucketSize;
    switch (aggregation) {
      case 'hour':
        bucketSize = 60 * 60 * 1000;
        break;
      case 'day':
        bucketSize = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        bucketSize = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        bucketSize = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Unknown aggregation: ${aggregation}`);
    }

    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, bucketSize] }
              ]
            }
          },
          dcVoltage: { $avg: '$dcVoltage' },
          dcCurrent: { $avg: '$dcCurrent' },
          dcPower: { $avg: '$dcPower' },
          acL1Power: { $avg: '$acL1Power' },
          acL2Power: { $avg: '$acL2Power' },
          acTotalPower: { $avg: '$acTotalPower' },
          soc: { $avg: '$soc' },
          inverterState: { $avg: '$inverterState' },
          sampleCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const results = await this.collection.aggregate(pipeline).toArray();
    
    return results.map(doc => ({
      timestamp: doc._id.toISOString(),
      dcVoltage: doc.dcVoltage,
      dcCurrent: doc.dcCurrent,
      dcPower: doc.dcPower,
      acL1Power: doc.acL1Power,
      acL2Power: doc.acL2Power,
      acTotalPower: doc.acTotalPower,
      soc: doc.soc,
      inverterState: Math.round(doc.inverterState),
      sampleCount: doc.sampleCount,
    }));
  }

  async getDateRange() {
    try {
      const earliest = await this.collection
        .find()
        .sort({ timestamp: 1 })
        .limit(1)
        .toArray();
      
      const latest = await this.collection
        .find()
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();
      
      return {
        start: earliest.length > 0 ? earliest[0].timestamp : null,
        end: latest.length > 0 ? latest[0].timestamp : null,
      };
      
    } catch (error) {
      console.error('Error getting date range:', error);
      return { start: null, end: null };
    }
  }

  async cleanOldData(retentionDays) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const result = await this.collection.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      if (result.deletedCount > 0) {
        console.log(`🗑️  Cleaned ${result.deletedCount} old MongoDB document(s)`);
      }
      
    } catch (error) {
      console.error('Error cleaning old data:', error);
    }
  }

  async getStats() {
    try {
      const count = await this.collection.countDocuments();
      const stats = await this.db.command({ collStats: this.collectionName });
      
      return {
        totalRecords: count,
        totalSize: stats.size,
        storageSize: stats.storageSize,
        storageType: 'mongodb',
      };
      
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalRecords: 0, totalSize: 0, storageType: 'mongodb' };
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.initialized = false;
      console.log('MongoDB connection closed');
    }
  }
}
