/**
 * Base class for notification transports
 * 
 * Each transport (Telegram, Email, SMS, etc.) extends this class
 * and implements the send() method
 */
export class NotificationTransport {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.enabled = config.enabled !== false;
  }

  /**
   * Send a notification
   * @param {Object} notification - Notification data
   * @param {string} notification.title - Notification title
   * @param {string} notification.message - Main message body
   * @param {string} notification.priority - Priority level (low, normal, high, urgent)
   * @param {Object} notification.data - Additional context data
   * @returns {Promise<Object>} Result with success status and optional error
   */
  async send(notification) {
    throw new Error('send() must be implemented by transport subclass');
  }

  /**
   * Test the transport connection/configuration
   * @returns {Promise<Object>} Result with success status and optional error
   */
  async test() {
    return {
      success: true,
      transport: this.name,
      message: 'Test not implemented for this transport'
    };
  }

  /**
   * Format notification for this transport
   * Can be overridden by subclasses for transport-specific formatting
   */
  formatNotification(notification) {
    return {
      title: notification.title || 'Vessel Notification',
      message: notification.message || '',
      priority: notification.priority || 'normal',
      timestamp: new Date().toISOString(),
      data: notification.data || {}
    };
  }

  isEnabled() {
    return this.enabled;
  }

  disable() {
    this.enabled = false;
  }

  enable() {
    this.enabled = true;
  }
}
