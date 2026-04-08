import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class SignalKClient extends EventEmitter {
  constructor(host, port, protocol = 'ws') {
    super();
    this.host = host;
    this.port = port;
    this.protocol = protocol;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.subscriptions = [];
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;
  }

  get url() {
    return `${this.protocol}://${this.host}:${this.port}/signalk/v1/stream`;
  }

  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      console.log(`Connecting to SignalK at ${this.url}...`);

      try {
        this.ws = new WebSocket(this.url, {
          perMessageDeflate: false
        });

        this.ws.on('open', () => {
          console.log('✓ Connected to SignalK');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.startHeartbeat();
          this.emit('connected');
          
          if (this.subscriptions.length > 0) {
            this.resubscribe();
          }
          
          resolve();
        });

        this.ws.on('message', (data) => {
          this.lastHeartbeat = Date.now();
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse SignalK message:', error.message);
          }
        });

        this.ws.on('close', () => {
          console.log('SignalK connection closed');
          this.isConnecting = false;
          this.stopHeartbeat();
          this.emit('disconnected');
          
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          console.error('SignalK WebSocket error:', error.message);
          this.isConnecting = false;
          
          if (this.ws.readyState !== WebSocket.OPEN) {
            reject(error);
          }
        });

        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(subscriptions) {
    this.subscriptions = subscriptions.map(sub => ({
      path: sub.path,
      period: sub.logInterval * 1000
    }));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription();
    }
  }

  sendSubscription() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      context: 'vessels.self',
      subscribe: this.subscriptions
    };

    try {
      this.ws.send(JSON.stringify(message));
      console.log(`✓ Subscribed to ${this.subscriptions.length} paths`);
    } catch (error) {
      console.error('Failed to send subscription:', error.message);
    }
  }

  resubscribe() {
    console.log('Resubscribing to SignalK paths...');
    this.sendSubscription();
  }

  handleMessage(message) {
    if (message.updates && Array.isArray(message.updates)) {
      for (const update of message.updates) {
        if (update.values && Array.isArray(update.values)) {
          const source = update.source?.label || update.source?.type || 'unknown';
          const timestamp = update.timestamp || new Date().toISOString();
          
          for (const item of update.values) {
            this.emit('delta', {
              path: item.path,
              value: item.value,
              timestamp,
              source,
              context: message.context || 'vessels.self'
            });
          }
        }
      }
    }
  }

  scheduleReconnect() {
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    console.log(`Reconnecting to SignalK in ${delay}ms (attempt ${this.reconnectAttempts + 1})...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(error => {
        console.error('Reconnection failed:', error.message);
      });
    }, delay);
  }

  startHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      if (timeSinceLastHeartbeat > 60000) {
        console.warn('No heartbeat from SignalK for 60s, reconnecting...');
        this.ws.close();
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
