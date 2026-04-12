/**
 * Underway Event Handler
 * 
 * Tracks voyage starts and ends, collecting trip data and generating voyage logs.
 * 
 * When vessel.underway changes to true:
 * - Creates a new voyage record
 * - Records starting position, conditions, timestamp
 * 
 * When vessel.underway changes to false:
 * - Closes the voyage record
 * - Calculates trip statistics (distance, duration, fuel usage, etc.)
 * - Gathers weather and sea state data from logs
 * - Generates AI voyage summary report
 * - Identifies start/end marinas or anchorages
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

let logger;
let config;

// Active voyage tracking
let activeVoyage = null;

/**
 * Register this handler
 */
function register(registerHandler, loggerInstance, configInstance) {
  logger = loggerInstance;
  config = configInstance;
  
  registerHandler('vessel/underway', handleUnderwayChange);
}

/**
 * Handle vessel.underway state changes
 */
async function handleUnderwayChange(value, timestamp, eventPath) {
  if (value === true) {
    return await startVoyage(timestamp);
  } else {
    return await endVoyage(timestamp);
  }
}

/**
 * Start a new voyage
 */
async function startVoyage(timestamp) {
  logger.info('Starting new voyage...');
  
  // Fetch current vessel state from SignalK
  const vesselData = await fetchSignalKData('vessels/self');
  
  const voyage = {
    id: generateVoyageId(timestamp),
    startTime: timestamp,
    startPosition: vesselData?.navigation?.position || null,
    startConditions: {
      windSpeed: vesselData?.environment?.wind?.speedTrue,
      windDirection: vesselData?.environment?.wind?.directionTrue,
      waterTemp: vesselData?.environment?.water?.temperature,
      airTemp: vesselData?.environment?.outside?.temperature,
      barometer: vesselData?.environment?.outside?.pressure,
      seaState: vesselData?.environment?.seaState?.description
    },
    startFuelLevel: {
      port: vesselData?.tanks?.fuel?.port?.currentLevel,
      starboard: vesselData?.tanks?.fuel?.starboard?.currentLevel
    }
  };
  
  activeVoyage = voyage;
  
  // Save voyage start to file
  const voyageDir = path.join(config.logDir, 'voyages');
  await fs.mkdir(voyageDir, { recursive: true });
  await fs.writeFile(
    path.join(voyageDir, `${voyage.id}.json`),
    JSON.stringify(voyage, null, 2)
  );
  
  logger.info(`Voyage started: ${voyage.id}`, {
    position: voyage.startPosition,
    time: voyage.startTime
  });
  
  return {
    action: 'voyage_started',
    voyageId: voyage.id,
    startTime: voyage.startTime,
    startPosition: voyage.startPosition
  };
}

/**
 * End the active voyage
 */
async function endVoyage(timestamp) {
  if (!activeVoyage) {
    logger.warn('Voyage end event but no active voyage');
    return { action: 'voyage_end_ignored', reason: 'no_active_voyage' };
  }
  
  logger.info(`Ending voyage: ${activeVoyage.id}`);
  
  // Fetch current vessel state
  const vesselData = await fetchSignalKData('vessels/self');
  
  // Calculate voyage statistics
  activeVoyage.endTime = timestamp;
  activeVoyage.endPosition = vesselData?.navigation?.position || null;
  activeVoyage.duration = calculateDuration(activeVoyage.startTime, timestamp);
  activeVoyage.endFuelLevel = {
    port: vesselData?.tanks?.fuel?.port?.currentLevel,
    starboard: vesselData?.tanks?.fuel?.starboard?.currentLevel
  };
  
  // Calculate distance (this is simplified - in reality you'd integrate trip distance from logs)
  if (activeVoyage.startPosition && activeVoyage.endPosition) {
    activeVoyage.distanceNm = calculateDistance(
      activeVoyage.startPosition,
      activeVoyage.endPosition
    );
  }
  
  // Calculate fuel consumption
  if (activeVoyage.startFuelLevel.port && activeVoyage.endFuelLevel.port) {
    activeVoyage.fuelUsed = {
      port: activeVoyage.startFuelLevel.port - activeVoyage.endFuelLevel.port,
      starboard: activeVoyage.startFuelLevel.starboard - activeVoyage.endFuelLevel.starboard
    };
    activeVoyage.fuelUsed.total = activeVoyage.fuelUsed.port + activeVoyage.fuelUsed.starboard;
  }
  
  // TODO: Add more rich data:
  // - Query logs for weather conditions during voyage
  // - Calculate average speed, max speed
  // - Get sea state analytics
  // - Identify start/end marinas using reverse geocoding
  // - Generate AI voyage summary
  
  // Save completed voyage
  const voyageDir = path.join(config.logDir, 'voyages');
  await fs.writeFile(
    path.join(voyageDir, `${activeVoyage.id}.json`),
    JSON.stringify(activeVoyage, null, 2)
  );
  
  logger.info(`Voyage completed: ${activeVoyage.id}`, {
    duration: activeVoyage.duration,
    distance: activeVoyage.distanceNm,
    fuelUsed: activeVoyage.fuelUsed?.total
  });
  
  const completedVoyage = activeVoyage;
  activeVoyage = null;
  
  return {
    action: 'voyage_completed',
    voyageId: completedVoyage.id,
    duration: completedVoyage.duration,
    distanceNm: completedVoyage.distanceNm,
    fuelUsed: completedVoyage.fuelUsed
  };
}

/**
 * Fetch data from SignalK API
 */
async function fetchSignalKData(path) {
  try {
    const url = `${config.signalkUrl}/signalk/v1/api/${path}`;
    logger.debug(`Fetching SignalK data: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // SignalK returns {path: {value: ...}} structure, extract values
    return extractValues(data);
  } catch (err) {
    logger.error(`Failed to fetch SignalK data from ${path}:`, err);
    return null;
  }
}

/**
 * Extract values from SignalK response structure
 * Converts {navigation: {position: {value: {...}}}} to {navigation: {position: {...}}}
 */
function extractValues(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = {};
  for (const key in obj) {
    if (key === 'value' && Object.keys(obj).length === 1) {
      // This is a leaf node with just {value: ...}
      return obj.value;
    }
    result[key] = extractValues(obj[key]);
  }
  return result;
}

/**
 * Generate unique voyage ID from timestamp
 */
function generateVoyageId(timestamp) {
  const date = new Date(timestamp);
  return `voyage-${date.toISOString().replace(/[:.]/g, '-')}`;
}

/**
 * Calculate duration between two timestamps
 */
function calculateDuration(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const durationMs = endMs - startMs;
  
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    milliseconds: durationMs,
    hours: hours,
    minutes: minutes,
    formatted: `${hours}h ${minutes}m`
  };
}

/**
 * Calculate great circle distance between two positions (Haversine formula)
 */
function calculateDistance(pos1, pos2) {
  const R = 3440.065; // Nautical miles
  const lat1 = pos1.latitude * Math.PI / 180;
  const lat2 = pos2.latitude * Math.PI / 180;
  const dLat = (pos2.latitude - pos1.latitude) * Math.PI / 180;
  const dLon = (pos2.longitude - pos1.longitude) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

module.exports = { register };
