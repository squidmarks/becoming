/**
 * Vessel Event Handler
 * 
 * Webhook service that processes state change events from SignalK State Detectors plugin.
 * Each event can trigger custom business logic, data collection, AI processing, etc.
 */

const express = require('express');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Configuration
const config = {
  port: process.env.PORT || 4000,
  signalkUrl: process.env.SIGNALK_URL || 'http://localhost:3100',
  logDir: process.env.LOG_DIR || path.join(__dirname, 'logs')
};

// Ensure log directory exists
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

// Initialize Express
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vessel-event-handler',
    timestamp: new Date().toISOString(),
    config: {
      signalkUrl: config.signalkUrl,
      handlersLoaded: Object.keys(handlers).length
    }
  });
});

/**
 * Event Handler Registry
 * 
 * Maps event paths to handler functions.
 * Add new handlers here as you implement them.
 */
const handlers = {};

/**
 * Register an event handler
 */
function registerHandler(eventPath, handlerFunction) {
  handlers[eventPath] = handlerFunction;
  logger.info(`Registered handler for: ${eventPath}`);
}

/**
 * Main webhook endpoint
 * POST /events/:path
 * Body: { value: boolean, timestamp: ISO8601 }
 */
app.post('/events/*', async (req, res) => {
  const eventPath = req.params[0]; // Captures everything after /events/
  const { value, timestamp } = req.body;
  
  logger.info(`Received event: ${eventPath} = ${value} at ${timestamp}`);
  
  // Find handler for this event path
  const handler = handlers[eventPath];
  
  if (!handler) {
    logger.debug(`No handler registered for: ${eventPath}`);
    return res.status(200).json({ 
      status: 'ignored',
      message: `No handler for ${eventPath}` 
    });
  }
  
  try {
    // Call the handler
    const result = await handler(value, timestamp, eventPath);
    
    logger.info(`Handler success for ${eventPath}`, result);
    
    res.status(200).json({
      status: 'success',
      eventPath: eventPath,
      value: value,
      result: result
    });
  } catch (err) {
    logger.error(`Handler error for ${eventPath}:`, err);
    
    res.status(500).json({
      status: 'error',
      eventPath: eventPath,
      error: err.message
    });
  }
});

// Load event handlers
const handlersDir = path.join(__dirname, 'handlers');
if (fs.existsSync(handlersDir)) {
  fs.readdirSync(handlersDir).forEach(file => {
    if (file.endsWith('.js')) {
      try {
        const handlerModule = require(path.join(handlersDir, file));
        handlerModule.register(registerHandler, logger, config);
        logger.info(`Loaded handler module: ${file}`);
      } catch (err) {
        logger.error(`Failed to load handler ${file}:`, err);
      }
    }
  });
} else {
  logger.warn(`Handlers directory not found: ${handlersDir}`);
  fs.mkdirSync(handlersDir, { recursive: true });
}

// Start server
app.listen(config.port, () => {
  logger.info(`Vessel Event Handler listening on port ${config.port}`);
  logger.info(`SignalK URL: ${config.signalkUrl}`);
  logger.info(`Registered handlers: ${Object.keys(handlers).join(', ') || '(none)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
