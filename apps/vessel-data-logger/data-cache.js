export class DataCache {
  constructor(maxEntries = 10000, ttlSeconds = 300) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlSeconds * 1000;
    this.cache = new Map();
    this.accessOrder = [];
  }

  set(path, value, timestamp, source) {
    const entry = {
      path,
      value,
      timestamp: timestamp || new Date().toISOString(),
      source,
      cachedAt: Date.now()
    };

    if (this.cache.has(path)) {
      this.updateAccessOrder(path);
    } else {
      if (this.cache.size >= this.maxEntries) {
        this.evictLRU();
      }
      this.accessOrder.push(path);
    }

    this.cache.set(path, entry);
  }

  get(path) {
    const entry = this.cache.get(path);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs) {
      this.cache.delete(path);
      this.removeFromAccessOrder(path);
      return null;
    }

    this.updateAccessOrder(path);
    return entry;
  }

  getAll() {
    const now = Date.now();
    const result = {};
    
    for (const [path, entry] of this.cache.entries()) {
      const age = now - entry.cachedAt;
      if (age <= this.ttlMs) {
        result[path] = {
          value: entry.value,
          timestamp: entry.timestamp,
          source: entry.source
        };
      } else {
        this.cache.delete(path);
        this.removeFromAccessOrder(path);
      }
    }
    
    return result;
  }

  has(path) {
    const entry = this.cache.get(path);
    if (!entry) {
      return false;
    }

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs) {
      this.cache.delete(path);
      this.removeFromAccessOrder(path);
      return false;
    }

    return true;
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  size() {
    return this.cache.size;
  }

  stats() {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      ttlSeconds: this.ttlMs / 1000
    };
  }

  updateAccessOrder(path) {
    const index = this.accessOrder.indexOf(path);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(path);
  }

  removeFromAccessOrder(path) {
    const index = this.accessOrder.indexOf(path);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  evictLRU() {
    if (this.accessOrder.length === 0) {
      return;
    }
    
    const lruPath = this.accessOrder.shift();
    this.cache.delete(lruPath);
  }
}
