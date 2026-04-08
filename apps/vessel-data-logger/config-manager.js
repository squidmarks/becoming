import fs from 'fs';
import { EventEmitter } from 'events';

export class ConfigManager extends EventEmitter {
  constructor(configPath = './config.json') {
    super();
    this.configPath = configPath;
    this.config = null;
    this.watcher = null;
  }

  load() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      console.log(`✓ Loaded configuration from ${this.configPath}`);
      return this.config;
    } catch (error) {
      console.error(`✗ Failed to load config from ${this.configPath}:`, error.message);
      throw error;
    }
  }

  save(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      this.config = config;
      console.log(`✓ Saved configuration to ${this.configPath}`);
      this.emit('configChanged', config);
      return true;
    } catch (error) {
      console.error(`✗ Failed to save config:`, error.message);
      throw error;
    }
  }

  watch() {
    this.watcher = fs.watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        console.log('Configuration file changed, reloading...');
        try {
          const newConfig = this.load();
          this.emit('configChanged', newConfig);
        } catch (error) {
          console.error('Failed to reload config:', error.message);
        }
      }
    });
    console.log(`✓ Watching ${this.configPath} for changes`);
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getEnabledSubscriptions() {
    if (!this.config || !this.config.subscriptions) {
      return [];
    }
    return this.config.subscriptions.filter(sub => sub.enabled);
  }

  getSubscriptionByPath(path) {
    if (!this.config || !this.config.subscriptions) {
      return null;
    }
    return this.config.subscriptions.find(sub => sub.path === path);
  }

  updateSubscription(path, updates) {
    if (!this.config || !this.config.subscriptions) {
      throw new Error('Config not loaded');
    }
    
    const index = this.config.subscriptions.findIndex(sub => sub.path === path);
    if (index === -1) {
      throw new Error(`Subscription not found: ${path}`);
    }
    
    this.config.subscriptions[index] = {
      ...this.config.subscriptions[index],
      ...updates
    };
    
    this.save(this.config);
  }

  addSubscription(subscription) {
    if (!this.config || !this.config.subscriptions) {
      throw new Error('Config not loaded');
    }
    
    const exists = this.config.subscriptions.some(sub => sub.path === subscription.path);
    if (exists) {
      throw new Error(`Subscription already exists: ${subscription.path}`);
    }
    
    this.config.subscriptions.push(subscription);
    this.save(this.config);
  }

  removeSubscription(path) {
    if (!this.config || !this.config.subscriptions) {
      throw new Error('Config not loaded');
    }
    
    const index = this.config.subscriptions.findIndex(sub => sub.path === path);
    if (index === -1) {
      throw new Error(`Subscription not found: ${path}`);
    }
    
    this.config.subscriptions.splice(index, 1);
    this.save(this.config);
  }
}
