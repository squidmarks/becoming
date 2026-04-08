import { NotificationTransport } from './notification-transport.js';

/**
 * Telegram Bot notification transport
 * 
 * Configuration:
 *   - botToken: Telegram bot token from BotFather
 *   - chatId: Telegram chat ID where messages will be sent
 *   - parseMode: 'Markdown' or 'HTML' (default: 'Markdown')
 *   - disablePreview: Disable link previews (default: true)
 */
export class TelegramTransport extends NotificationTransport {
  constructor(config = {}) {
    super('telegram', config);
    
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;
    this.parseMode = config.parseMode || 'Markdown';
    this.disablePreview = config.disablePreview !== false;
    
    if (!this.botToken || !this.chatId) {
      console.warn('⚠️  Telegram transport: Missing botToken or chatId - notifications will fail');
      this.enabled = false;
    }
  }

  async send(notification) {
    if (!this.enabled) {
      return {
        success: false,
        transport: this.name,
        error: 'Transport is disabled or not configured'
      };
    }

    try {
      const formatted = this.formatNotification(notification);
      const message = this.buildMessage(formatted);
      
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: this.parseMode,
          disable_web_page_preview: this.disablePreview
        })
      });

      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.description || 'Telegram API error');
      }

      return {
        success: true,
        transport: this.name,
        messageId: result.result.message_id
      };
    } catch (error) {
      console.error(`❌ Telegram notification failed:`, error.message);
      return {
        success: false,
        transport: this.name,
        error: error.message
      };
    }
  }

  async test() {
    try {
      const result = await this.send({
        title: '🔔 Test Notification',
        message: 'Telegram notification transport is working correctly!',
        priority: 'normal'
      });
      
      return {
        success: result.success,
        transport: this.name,
        message: result.success 
          ? 'Test message sent successfully' 
          : `Test failed: ${result.error}`
      };
    } catch (error) {
      return {
        success: false,
        transport: this.name,
        error: error.message
      };
    }
  }

  buildMessage(notification) {
    const parts = [];
    
    // Title with emoji based on priority
    const emoji = this.getPriorityEmoji(notification.priority);
    parts.push(`${emoji} *${this.escapeMarkdown(notification.title)}*`);
    parts.push('');
    
    // Main message
    if (notification.message) {
      parts.push(this.escapeMarkdown(notification.message));
      parts.push('');
    }
    
    // Additional data (formatted as key-value pairs)
    if (notification.data && Object.keys(notification.data).length > 0) {
      parts.push('*Details:*');
      for (const [key, value] of Object.entries(notification.data)) {
        const formattedKey = key.replace(/([A-Z])/g, ' $1').trim();
        const capitalizedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
        parts.push(`• ${capitalizedKey}: \`${this.formatValue(value)}\``);
      }
      parts.push('');
    }
    
    // Timestamp
    const timestamp = new Date(notification.timestamp).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: 'short'
    });
    parts.push(`_${timestamp}_`);
    
    return parts.join('\n');
  }

  getPriorityEmoji(priority) {
    const emojis = {
      low: 'ℹ️',
      normal: '🔔',
      high: '⚠️',
      urgent: '🚨'
    };
    return emojis[priority] || emojis.normal;
  }

  formatValue(value) {
    if (typeof value === 'object' && value !== null) {
      if (value.latitude !== undefined && value.longitude !== undefined) {
        return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
      }
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return String(value);
  }

  escapeMarkdown(text) {
    // Escape special Markdown characters
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }
}
