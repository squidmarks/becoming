/**
 * Simple mutex lock to prevent concurrent Modbus operations
 * Settings reads and regular polling share the same TCP connection
 * and can interfere with each other if not coordinated.
 */
export class ModbusLock {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  async acquire(timeoutMs = 10000) {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait for lock to be released
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.queue.indexOf(resolve);
        if (index > -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('Lock acquisition timeout'));
      }, timeoutMs);

      this.queue.push(() => {
        clearTimeout(timeout);
        this.locked = true;
        resolve();
      });
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }

  isLocked() {
    return this.locked;
  }
}
