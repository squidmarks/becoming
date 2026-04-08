/**
 * Notification Manager
 * 
 * Orchestrates sending notifications across multiple transports
 * (Telegram, Email, SMS, etc.)
 */
export class NotificationManager {
  constructor() {
    this.transports = new Map();
    this.enabled = true;
  }

  /**
   * Register a notification transport
   * @param {NotificationTransport} transport - Transport instance
   */
  addTransport(transport) {
    this.transports.set(transport.name, transport);
    console.log(`✓ Registered notification transport: ${transport.name}`);
  }

  /**
   * Remove a transport
   * @param {string} name - Transport name
   */
  removeTransport(name) {
    this.transports.delete(name);
  }

  /**
   * Get a transport by name
   * @param {string} name - Transport name
   * @returns {NotificationTransport|undefined}
   */
  getTransport(name) {
    return this.transports.get(name);
  }

  /**
   * Send notification to all enabled transports
   * @param {Object} notification - Notification data
   * @param {string[]} specificTransports - Optional array of transport names to use (defaults to all)
   * @returns {Promise<Object[]>} Array of results from each transport
   */
  async send(notification, specificTransports = null) {
    if (!this.enabled) {
      return [{
        success: false,
        transport: 'manager',
        error: 'Notification manager is disabled'
      }];
    }

    const transportsToUse = specificTransports
      ? specificTransports.map(name => this.transports.get(name)).filter(t => t)
      : Array.from(this.transports.values());

    const results = [];
    
    for (const transport of transportsToUse) {
      if (!transport.isEnabled()) {
        results.push({
          success: false,
          transport: transport.name,
          error: 'Transport is disabled'
        });
        continue;
      }

      try {
        const result = await transport.send(notification);
        results.push(result);
        
        if (result.success) {
          console.log(`✓ Notification sent via ${transport.name}`);
        } else {
          console.warn(`⚠️  Notification failed via ${transport.name}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Notification error (${transport.name}):`, error.message);
        results.push({
          success: false,
          transport: transport.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Send notification for an event
   * Helper that formats event data into notification structure
   * @param {Object} event - Rich event object
   * @returns {Promise<Object[]>}
   */
  async sendEventNotification(event) {
    const isStart = !event.endTime;
    const title = isStart 
      ? `${event.name.replace(/_/g, ' ')} Started`
      : `${event.name.replace(/_/g, ' ')} Ended`;

    const message = event.description || '';
    
    const data = {};
    
    if (isStart) {
      // Starting event - include start data
      if (event.startData && Object.keys(event.startData).length > 0) {
        Object.assign(data, event.startData);
      }
    } else {
      // Ending event - include duration and end data
      if (event.duration) {
        data.duration = this.formatDuration(event.duration);
      }
      if (event.endData && Object.keys(event.endData).length > 0) {
        Object.assign(data, event.endData);
      }
    }

    // Add event metadata
    data.eventId = event.eventId;
    if (event.category) {
      data.category = event.category;
    }

    const priority = this.determinePriority(event);

    return this.send({ title, message, priority, data });
  }

  /**
   * Test all transports
   * @returns {Promise<Object[]>}
   */
  async testAll() {
    const results = [];
    
    for (const transport of this.transports.values()) {
      const result = await transport.test();
      results.push(result);
    }
    
    return results;
  }

  /**
   * Determine notification priority from event
   */
  determinePriority(event) {
    // Urgent events
    if (event.category === 'safety' || event.category === 'alarm') {
      return 'urgent';
    }
    
    // High priority
    if (event.category === 'navigation' || event.category === 'engine') {
      return 'high';
    }
    
    // Normal priority
    return 'normal';
  }

  /**
   * Format duration in seconds to human-readable string
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Enable/disable all notifications
   */
  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  /**
   * Get status of all transports
   */
  getStatus() {
    const status = {
      enabled: this.enabled,
      transports: []
    };

    for (const transport of this.transports.values()) {
      status.transports.push({
        name: transport.name,
        enabled: transport.isEnabled()
      });
    }

    return status;
  }
}
