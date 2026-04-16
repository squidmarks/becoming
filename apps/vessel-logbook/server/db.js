/**
 * MongoDB Connection
 */

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB(uri, logger) {
  if (isConnected) {
    logger.debug('Using existing MongoDB connection');
    return;
  }

  if (!uri) {
    logger.warn('No MONGO_URI configured - MongoDB storage disabled');
    return false;
  }

  try {
    logger.info('Connecting to MongoDB...');
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    
    isConnected = true;
    logger.info('✓ Connected to MongoDB');
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });
    
    return true;
  } catch (err) {
    logger.error('✗ Failed to connect to MongoDB:', err.message);
    return false;
  }
}

async function disconnectDB(logger) {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
}

function isMongoConnected() {
  return isConnected;
}

module.exports = {
  connectDB,
  disconnectDB,
  isMongoConnected
};
