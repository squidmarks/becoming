/**
 * Vessel Logbook
 * 
 * Manual trip logging with automated data enrichment from vessel systems.
 */

const express = require('express');
const path = require('path');
const winston = require('winston');
const { connectDB, disconnectDB } = require('./db');
const tripsRouter = require('./routes/trips');

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
    })
  ]
});

// Configuration
const config = {
  port: process.env.PORT || 3200,
  signalkUrl: process.env.SIGNALK_URL || 'http://localhost:3100',
  loggerDataDir: process.env.LOGGER_DATA_DIR || path.join(__dirname, '../../vessel-data-logger/logs'),
  mongoUri: process.env.MONGO_URI || null
};

// Initialize Express
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Make config and logger available to routes
app.locals.config = config;
app.locals.logger = logger;

// API routes
app.use('/api/trips', tripsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vessel-logbook',
    timestamp: new Date().toISOString(),
    config: {
      signalkUrl: config.signalkUrl,
      loggerDataDir: config.loggerDataDir,
      storage: 'MongoDB'
    }
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    // Check MongoDB URI is configured
    if (!config.mongoUri) {
      logger.error('MONGO_URI environment variable is required');
      logger.error('Set MONGO_URI in .env file or environment');
      process.exit(1);
    }
    
    // Connect to MongoDB
    const mongoConnected = await connectDB(config.mongoUri, logger);
    
    if (!mongoConnected) {
      logger.error('Failed to connect to MongoDB - cannot start server');
      process.exit(1);
    }
    
    logger.info('✓ MongoDB connected');
    
    // Start Express server
    app.listen(config.port, () => {
      logger.info(`Vessel Logbook listening on port ${config.port}`);
      logger.info(`SignalK URL: ${config.signalkUrl}`);
      logger.info(`Storage: MongoDB`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectDB(logger);
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await disconnectDB(logger);
  process.exit(0);
});
