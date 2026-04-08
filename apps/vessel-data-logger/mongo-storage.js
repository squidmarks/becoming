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
      this.eventsCollection = this.db.collection('vessel_events');
      
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
      
      await this.eventsCollection.createIndex({ timestamp: -1 });
      await this.eventsCollection.createIndex({ name: 1 });
      await this.eventsCollection.createIndex({ name: 1, timestamp: -1 });
      await this.eventsCollection.createIndex({ path: 1, timestamp: -1 });
      
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

  /**
   * Extract nested property from object using dot notation
   * e.g., extractNestedValue({a: {b: 5}}, 'a.b') => 5
   */
  extractNestedValue(obj, nestedPath) {
    if (!nestedPath) return obj;
    
    const parts = nestedPath.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Parse a path that might contain nested property access
   * e.g., 'navigation.position.longitude' => { basePath: 'navigation.position', nestedPath: 'longitude' }
   */
  parseNestedPath(fullPath) {
    // Try to find a valid base path by checking progressively shorter prefixes
    // This is necessary because we don't know a priori which part is the stored path
    // For now, we'll use a simpler approach: check if the path contains more than 2 dots
    // and assume the last segment(s) might be nested properties
    
    const parts = fullPath.split('.');
    
    // Try different split points, starting from the end
    for (let i = parts.length - 1; i > 0; i--) {
      const basePath = parts.slice(0, i).join('.');
      const nestedPath = parts.slice(i).join('.');
      
      // Return the first split - we'll check if data exists at query time
      return { basePath, nestedPath, originalPath: fullPath };
    }
    
    // No nested path, return as-is
    return { basePath: fullPath, nestedPath: null, originalPath: fullPath };
  }

  async query(path, startTime, endTime, limit = 1000) {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB');
    }

    const { basePath, nestedPath } = this.parseNestedPath(path);

    const query = {
      path: basePath,
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

      // If no documents found with basePath, try the original path
      if (documents.length === 0 && nestedPath) {
        query.path = path;
        const directDocs = await this.collection
          .find(query)
          .sort({ timestamp: 1 })
          .limit(limit)
          .toArray();
        
        return directDocs.map(doc => ({
          timestamp: doc.timestamp.toISOString(),
          value: doc.value,
          source: doc.source
        }));
      }

      return documents.map(doc => {
        let value = doc.value;
        
        // Extract nested property if specified
        if (nestedPath && typeof value === 'object' && value !== null) {
          value = this.extractNestedValue(value, nestedPath);
        }
        
        return {
          timestamp: doc.timestamp.toISOString(),
          value,
          source: doc.source
        };
      }).filter(doc => doc.value !== undefined); // Filter out undefined values
    } catch (error) {
      console.error('Query failed:', error.message);
      throw error;
    }
  }

  async queryMultiple(paths, startTime, endTime, limit = 1000) {
    if (!this.collection) {
      throw new Error('Not connected to MongoDB');
    }

    // Parse all paths to separate base paths and nested paths
    const pathMap = new Map();
    const basePaths = new Set();
    
    for (const fullPath of paths) {
      const { basePath, nestedPath } = this.parseNestedPath(fullPath);
      pathMap.set(fullPath, { basePath, nestedPath });
      basePaths.add(basePath);
    }

    const query = {
      path: { $in: Array.from(basePaths) },
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
        // Check which requested paths match this document
        for (const [fullPath, { basePath, nestedPath }] of pathMap) {
          if (doc.path === basePath) {
            let value = doc.value;
            
            // Extract nested property if specified
            if (nestedPath && typeof value === 'object' && value !== null) {
              value = this.extractNestedValue(value, nestedPath);
            }
            
            // Only add if value is defined
            if (value !== undefined) {
              result[fullPath].push({
                timestamp: doc.timestamp.toISOString(),
                value,
                source: doc.source
              });
            }
          }
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

  async writeEvent(event) {
    if (!this.eventsCollection) {
      return;
    }

    const document = {
      name: event.name,
      type: event.type,
      path: event.path,
      description: event.description,
      timestamp: new Date(event.timestamp),
      source: event.source,
      fromValue: event.fromValue,
      toValue: event.toValue,
      threshold: event.threshold,
      direction: event.direction
    };

    try {
      await this.eventsCollection.insertOne(document);
    } catch (error) {
      console.error('Failed to write event:', error.message);
    }
  }

  async queryEvents(startTime, endTime, eventName = null, limit = 1000) {
    if (!this.eventsCollection) {
      throw new Error('Not connected to MongoDB');
    }

    const query = {
      timestamp: {
        $gte: new Date(startTime),
        $lte: new Date(endTime)
      }
    };

    if (eventName) {
      query.name = eventName;
    }

    try {
      const documents = await this.eventsCollection
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return documents.map(doc => ({
        name: doc.name,
        type: doc.type,
        path: doc.path,
        description: doc.description,
        timestamp: doc.timestamp.toISOString(),
        source: doc.source,
        fromValue: doc.fromValue,
        toValue: doc.toValue,
        threshold: doc.threshold,
        direction: doc.direction
      }));
    } catch (error) {
      console.error('Event query failed:', error.message);
      throw error;
    }
  }

  async getRecentEvents(limit = 50) {
    if (!this.eventsCollection) {
      throw new Error('Not connected to MongoDB');
    }

    try {
      const documents = await this.eventsCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return documents.map(doc => ({
        name: doc.name,
        type: doc.type,
        path: doc.path,
        description: doc.description,
        timestamp: doc.timestamp.toISOString(),
        source: doc.source,
        fromValue: doc.fromValue,
        toValue: doc.toValue,
        threshold: doc.threshold,
        direction: doc.direction
      }));
    } catch (error) {
      console.error('Failed to get recent events:', error.message);
      throw error;
    }
  }

  get connected() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }
}
