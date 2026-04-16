/**
 * Vessel Logbook
 * 
 * Manual trip logging with automated data enrichment from vessel systems.
 */

const express = require('express');
const path = require('path');
const winston = require('winston');
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
  tripsDir: process.env.TRIPS_DIR || path.join(__dirname, '../data/trips')
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
      tripsDir: config.tripsDir
    }
  });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Vessel Logbook listening on port ${config.port}`);
  logger.info(`SignalK URL: ${config.signalkUrl}`);
  logger.info(`Logger data directory: ${config.loggerDataDir}`);
  logger.info(`Trips directory: ${config.tripsDir}`);
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
