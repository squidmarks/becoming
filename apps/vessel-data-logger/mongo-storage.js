import { MongoClient } from 'mongodb';

export class MongoStorage {
  constructor(uri) {
    this.uri = uri;
    this.client = null;
    this.db = null;
    this.collection = null;
    this.writeBuffer = [];
    this.maxBufferSize = 100;
    this.flushInterval = 5000;
    this.flushTimer = null;
  }

  async connect() {
    if (!this.uri) {
      throw new Error('MongoDB URI not configured');
    }

    try {
      console.log('Connecting to MongoDB...');
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      
      this.db = this.client.db('becoming');
      this.collection = this.db.collection('vessel_data');
      
      await this.ensureIndexes();
      
      console.log('✓ Connected to MongoDB');
      
      this.startFlushTimer();
      
      return true;
    } catch (error) {
      console.error('✗ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  async ensureIndexes() {
    try {
      await this.collection.createIndex({ timestamp: -1 });
      await this.collection.createIndex({ path: 1 });
      await this.collection.createIndex({ path: 1, timestamp: -1 });
      console.log('✓ MongoDB indexes created');
    } catch (error) {
      console.error('Warning: Failed to create indexes:', error.message);
    }
  }

  async disconnect() {
    this.stopFlushTimer();
    
    if (this.writeBuffer.length > 0) {
      await this.flush();
    }
    
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      console.log('✓ Disconnected from MongoDB');
    }
  }

  write(path, value, timestamp, source, context = 'vessels.self') {
    const document = {
      timestamp: new Date(timestamp),
      path,
      value,
      source,
      context
    };

    this.writeBuffer.push(document);

    if (this.writeBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  async flush() {
    if (this.writeBuffer.length === 0 || !this.collection) {
      return;
    }

    const batch = this.writeBuffer.splice(0, this.writeBuffer.length);

    try {
      await this.collection.insertMany(batch, { ordered: false });
    } catch (error) {
      console.error(`Failed to write ${batch.length} documents to MongoDB:`, error.message);
    }
  }

  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async query(path, startTime, endTime, limit = 1000) {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      path,
      timestamp: {
        $gte: new Date(startTime),
        $lte: new Date(endTime)
      }
    };

    try {
      const documents = await this.collection
        .find(query)
        .sort({ timestamp: 1 })
        .limit(limit)
        .toArray();

      return documents.map(doc => ({
        timestamp: doc.timestamp.toISOString(),
        value: doc.value,
        source: doc.source
      }));
    } catch (error) {
      console.error('Query failed:', error.message);
      throw error;
    }
  }

  async queryMultiple(paths, startTime, endTime, limit = 1000) {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      path: { $in: paths },
      timestamp: {
        $gte: new Date(startTime),
        $lte: new Date(endTime)
      }
    };

    try {
      const documents = await this.collection
        .find(query)
        .sort({ timestamp: 1 })
        .limit(limit)
        .toArray();

      const result = {};
      for (const path of paths) {
        result[path] = [];
      }

      for (const doc of documents) {
        if (result[doc.path]) {
          result[doc.path].push({
            timestamp: doc.timestamp.toISOString(),
            value: doc.value,
            source: doc.source
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Query failed:', error.message);
      throw error;
    }
  }

  async aggregate(path, startTime, endTime, bucketSeconds = 300) {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB');
    }

    const bucketMs = bucketSeconds * 1000;

    try {
      const pipeline = [
        {
          $match: {
            path,
            timestamp: {
              $gte: new Date(startTime),
              $lte: new Date(endTime)
            }
          }
        },
        {
          $group: {
            _id: {
              $toDate: {
                $subtract: [
                  { $toLong: '$timestamp' },
                  { $mod: [{ $toLong: '$timestamp' }, bucketMs] }
                ]
              }
            },
            avg: { $avg: '$value' },
            min: { $min: '$value' },
            max: { $max: '$value' },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ];

      const results = await this.collection.aggregate(pipeline).toArray();

      return results.map(doc => ({
        timestamp: doc._id.toISOString(),
        avg: doc.avg,
        min: doc.min,
        max: doc.max,
        count: doc.count
      }));
    } catch (error) {
      console.error('Aggregation failed:', error.message);
      throw error;
    }
  }

  async getStats() {
    if (!this.db) {
      return null;
    }

    try {
      const stats = await this.db.command({ collStats: 'vessel_data' });
      const count = await this.collection.countDocuments();

      return {
        documentsCount: count,
        storageSize: this.formatBytes(stats.storageSize || 0),
        indexSize: this.formatBytes(stats.totalIndexSize || 0)
      };
    } catch (error) {
      console.error('Failed to get stats:', error.message);
      return null;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  get connected() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }
}
