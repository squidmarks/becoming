import dotenv from 'dotenv';
import { ConfigManager } from './config-manager.js';
import { DataCache } from './data-cache.js';
import { SignalKClient } from './signalk-client.js';
import { MongoStorage } from './mongo-storage.js';
import { ApiServer } from './api-server.js';
import { EventDetector } from './event-detector.js';
import { EnhancedEventDetector } from './enhanced-event-detector.js';

dotenv.config();

class VesselDataLogger {
  constructor() {
    this.configManager = new ConfigManager('./config.json');
    this.cache = new DataCache(
      parseInt(process.env.CACHE_MAX_ENTRIES) || 10000,
      parseInt(process.env.CACHE_TTL_SECONDS) || 300
    );
    this.signalkClient = new SignalKClient(
      process.env.SIGNALK_HOST || 'localhost',
      parseInt(process.env.SIGNALK_PORT) || 3100,
      process.env.SIGNALK_PROTOCOL || 'ws'
    );
    this.storage = new MongoStorage(process.env.MONGO_URI);
    this.eventDetector = new EventDetector();
    this.enhancedEventDetector = new EnhancedEventDetector([], this.cache);
    this.apiServer = new ApiServer(
      parseInt(process.env.WEB_PORT) || 3200,
      this.cache,
      this.storage,
      this.configManager,
      this.signalkClient,
      this.eventDetector,
      this.enhancedEventDetector
    );

    this.lastWriteTimes = new Map();
    this.lastWriteValues = new Map();
  }

  async start() {
    console.log('=================================');
    console.log('  Vessel Data Logger');
    console.log('=================================\n');

    console.log('Configuration:');
    console.log(`  SignalK:     ${this.signalkClient.url}`);
    console.log(`  MongoDB:     ${process.env.MONGO_URI ? 'Configured' : 'Not configured'}`);
    console.log(`  Web Port:    ${process.env.WEB_PORT || 3200}`);
    console.log(`  Cache:       ${this.cache.maxEntries} entries, ${this.cache.ttlMs / 1000}s TTL\n`);

    try {
      this.configManager.load();
      const config = this.configManager.config;
      console.log(`  Subscriptions: ${this.configManager.getEnabledSubscriptions().length} enabled\n`);
      
      if (config.eventDetection && config.eventDetection.enabled) {
        this.eventDetector.updateRules(config.eventDetection.rules || []);
        console.log(`  Event Detection: ${config.eventDetection.rules?.length || 0} rules configured`);
      }
      
      if (config.enhancedEventDetectors) {
        this.enhancedEventDetector.updateDetectors(config.enhancedEventDetectors);
        console.log(`  Enhanced Event Detection: ${config.enhancedEventDetectors.length} detectors configured\n`);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error.message);
      process.exit(1);
    }

    if (process.env.MONGO_URI) {
      try {
        await this.storage.connect();
      } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        console.log('Continuing without MongoDB storage...\n');
      }
    } else {
      console.log('⚠ MongoDB URI not configured - running without persistent storage\n');
    }

    try {
      await this.signalkClient.connect();
    } catch (error) {
      console.error('Failed to connect to SignalK:', error.message);
      console.log('Will retry connection in background...\n');
    }

    this.setupEventHandlers();
    this.subscribeToSignalK();

    await this.apiServer.start();

    this.configManager.watch();

    // Start periodic enhanced event evaluation (every 5 seconds)
    this.enhancedEventEvaluator = setInterval(() => {
      this.evaluateEnhancedEvents();
    }, 5000);
    
    console.log('\n✓ Vessel Data Logger is running\n');
  }

  setupEventHandlers() {
    this.signalkClient.on('delta', (data) => {
      this.handleDelta(data);
    });

    this.signalkClient.on('connected', () => {
      console.log('SignalK connected, resubscribing...');
      this.subscribeToSignalK();
      this.apiServer.broadcastSSE('signalk-connected', {});
    });

    this.signalkClient.on('disconnected', () => {
      console.log('SignalK disconnected');
      this.apiServer.broadcastSSE('signalk-disconnected', {});
    });

    this.configManager.on('configChanged', (config) => {
      console.log('Configuration changed, updating subscriptions...');
      this.subscribeToSignalK();
      
      if (config.eventDetection && config.eventDetection.enabled) {
        this.eventDetector.updateRules(config.eventDetection.rules || []);
        console.log(`Event detection rules updated: ${config.eventDetection.rules?.length || 0} rules`);
      }
      
      if (config.enhancedEventDetectors) {
        this.enhancedEventDetector.updateDetectors(config.enhancedEventDetectors);
        console.log(`Enhanced event detectors updated: ${config.enhancedEventDetectors.length} detectors`);
      }
      
      this.apiServer.broadcastSSE('config-changed', {});
    });

    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
  }

  subscribeToSignalK() {
    const subscriptions = this.configManager.getEnabledSubscriptions();
    if (subscriptions.length > 0) {
      this.signalkClient.subscribe(subscriptions);
    }
  }

  handleDelta(data) {
    const { path, value, timestamp, source } = data;

    this.cache.set(path, value, timestamp, source);

    // Simple event detection (backward compatibility)
    const events = this.eventDetector.detectEvents(path, value, timestamp, source);
    if (events.length > 0 && this.storage.connected) {
      for (const event of events) {
        console.log(`📌 Event detected: ${event.name} - ${event.description}`);
        this.storage.writeEvent(event);
        this.apiServer.broadcastSSE('event', event);
      }
    }

    const subscription = this.configManager.getSubscriptionByPath(path);
    if (subscription && this.storage.connected) {
      const shouldWrite = this.shouldWriteToStorage(path, value, timestamp, subscription);
      if (shouldWrite) {
        this.storage.write(path, value, timestamp, source);
        this.lastWriteTimes.set(path, Date.now());
        this.lastWriteValues.set(path, value);
      }
    }

    this.apiServer.broadcastSSE('delta', { path, value, timestamp, source });
  }

  evaluateEnhancedEvents() {
    // Get all current cache values
    const currentValues = this.cache.getAll();
    
    // Convert to simple path -> value map
    const valueMap = {};
    for (const [path, entry] of Object.entries(currentValues)) {
      valueMap[path] = entry.value;
    }
    
    // Evaluate all detectors
    const events = this.enhancedEventDetector.evaluateAll(valueMap, new Date());
    
    // Handle detected events
    if (events.length > 0 && this.storage.connected) {
      for (const event of events) {
        const action = event.endTime ? 'ended' : 'started';
        console.log(`📌 Enhanced event ${action}: ${event.name}`);
        
        // Write/update rich event
        this.storage.writeRichEvent(event);
        
        // Broadcast to web UI
        this.apiServer.broadcastSSE('rich-event', event);
        
        // TODO: Send notifications if configured
      }
    }
  }

  shouldWriteToStorage(path, value, timestamp, subscription) {
    if (subscription.condition && !this.evaluateCondition(subscription.condition)) {
      return false;
    }

    const now = Date.now();
    const lastWriteTime = this.lastWriteTimes.get(path) || 0;
    const timeSinceLastWrite = now - lastWriteTime;
    const intervalMs = subscription.logInterval * 1000;

    if (subscription.maxInterval) {
      const maxIntervalMs = subscription.maxInterval * 1000;
      if (timeSinceLastWrite >= maxIntervalMs) {
        return true;
      }
    }

    if (timeSinceLastWrite >= intervalMs) {
      if (subscription.deltaThreshold !== null && subscription.deltaThreshold !== undefined) {
        const lastValue = this.lastWriteValues.get(path);
        if (lastValue !== undefined) {
          const delta = this.calculateDelta(path, lastValue, value);
          if (delta !== null && delta >= subscription.deltaThreshold) {
            return true;
          }
        } else {
          return true;
        }
      } else {
        return true;
      }
    }

    if (subscription.deltaThreshold !== null && subscription.deltaThreshold !== undefined) {
      const lastValue = this.lastWriteValues.get(path);
      if (lastValue !== undefined) {
        const delta = this.calculateDelta(path, lastValue, value);
        if (delta !== null && delta >= subscription.deltaThreshold) {
          return true;
        }
      }
    }

    return false;
  }

  calculateDelta(path, oldValue, newValue) {
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      return Math.abs(newValue - oldValue);
    }

    if (path === 'navigation.position' && 
        oldValue?.latitude !== undefined && oldValue?.longitude !== undefined &&
        newValue?.latitude !== undefined && newValue?.longitude !== undefined) {
      return this.calculateDistance(
        oldValue.latitude, oldValue.longitude,
        newValue.latitude, newValue.longitude
      );
    }

    if (typeof oldValue === 'object' && typeof newValue === 'object') {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
        return 0;
      }
      return null;
    }

    if (oldValue === newValue) {
      return 0;
    }

    return null;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  evaluateCondition(condition) {
    const cachedEntry = this.cache.get(condition.path);
    if (!cachedEntry) {
      return false;
    }

    const actualValue = cachedEntry.value;
    const expectedValue = condition.value;
    const operator = condition.operator;

    switch (operator) {
      case '>':
        return actualValue > expectedValue;
      case '>=':
        return actualValue >= expectedValue;
      case '<':
        return actualValue < expectedValue;
      case '<=':
        return actualValue <= expectedValue;
      case '==':
      case '===':
        return actualValue === expectedValue;
      case '!=':
      case '!==':
        return actualValue !== expectedValue;
      default:
        console.warn(`Unknown condition operator: ${operator}`);
        return false;
    }
  }

  async shutdown(signal) {
    console.log(`\n\nReceived ${signal}, shutting down gracefully...`);

    if (this.enhancedEventEvaluator) {
      clearInterval(this.enhancedEventEvaluator);
    }
    
    this.configManager.stopWatching();
    this.signalkClient.disconnect();
    await this.storage.disconnect();
    await this.apiServer.stop();

    console.log('✓ Shutdown complete');
    process.exit(0);
  }
}

const logger = new VesselDataLogger();
logger.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
