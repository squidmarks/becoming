/**
 * Inverter Event Handler
 * 
 * Tracks inverter usage sessions and calculates power consumption.
 * 
 * When electrical.inverterActive changes to true:
 * - Creates a new inverter session record
 * - Records starting battery state, timestamp
 * 
 * When electrical.inverterActive changes to false:
 * - Closes the inverter session
 * - Calculates total amp-hours consumed
 * - Calculates average load, peak load
 * - Records session duration
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

let logger;
let config;

// Active inverter session
let activeSession = null;

/**
 * Register this handler
 */
function register(registerHandler, loggerInstance, configInstance) {
  logger = loggerInstance;
  config = configInstance;
  
  registerHandler('electrical/inverterActive', handleInverterChange);
}

/**
 * Handle electrical.inverterActive state changes
 */
async function handleInverterChange(value, timestamp, eventPath) {
  if (value === true) {
    return await startInverterSession(timestamp);
  } else {
    return await endInverterSession(timestamp);
  }
}

/**
 * Start a new inverter session
 */
async function startInverterSession(timestamp) {
  logger.info('Starting new inverter session...');
  
  // Fetch current electrical state from SignalK
  const vesselData = await fetchSignalKData('vessels/self');
  
  const session = {
    id: generateSessionId(timestamp),
    startTime: timestamp,
    startBatteryState: {
      voltage: vesselData?.electrical?.batteries?.house?.voltage,
      current: vesselData?.electrical?.batteries?.house?.current,
      stateOfCharge: vesselData?.electrical?.batteries?.house?.capacity?.stateOfCharge
    },
    startInverterState: {
      acLoad: vesselData?.electrical?.inverters?.main?.ac?.power,
      dcCurrent: vesselData?.electrical?.inverters?.main?.dc?.current
    }
  };
  
  activeSession = session;
  
  // Save session start to file
  const sessionsDir = path.join(config.logDir, 'inverter-sessions');
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${session.id}.json`),
    JSON.stringify(session, null, 2)
  );
  
  logger.info(`Inverter session started: ${session.id}`, {
    batteryVoltage: session.startBatteryState.voltage,
    stateOfCharge: session.startBatteryState.stateOfCharge,
    time: session.startTime
  });
  
  return {
    action: 'inverter_session_started',
    sessionId: session.id,
    startTime: session.startTime,
    batteryState: session.startBatteryState
  };
}

/**
 * End the active inverter session
 */
async function endInverterSession(timestamp) {
  if (!activeSession) {
    logger.warn('Inverter session end event but no active session');
    return { action: 'session_end_ignored', reason: 'no_active_session' };
  }
  
  logger.info(`Ending inverter session: ${activeSession.id}`);
  
  // Fetch current electrical state
  const vesselData = await fetchSignalKData('vessels/self');
  
  // Calculate session statistics
  activeSession.endTime = timestamp;
  activeSession.duration = calculateDuration(activeSession.startTime, timestamp);
  activeSession.endBatteryState = {
    voltage: vesselData?.electrical?.batteries?.house?.voltage,
    current: vesselData?.electrical?.batteries?.house?.current,
    stateOfCharge: vesselData?.electrical?.batteries?.house?.capacity?.stateOfCharge
  };
  
  // Calculate battery consumption
  if (activeSession.startBatteryState.stateOfCharge && activeSession.endBatteryState.stateOfCharge) {
    activeSession.batteryUsed = {
      socDrop: activeSession.startBatteryState.stateOfCharge - activeSession.endBatteryState.stateOfCharge,
      voltageAvg: (activeSession.startBatteryState.voltage + activeSession.endBatteryState.voltage) / 2
    };
    
    // TODO: Calculate actual amp-hours consumed by integrating current over time from logs
    // For now, estimate based on SOC drop and battery capacity
    // (Would need to know battery bank capacity - could be in config)
  }
  
  // TODO: Add more rich data:
  // - Query vessel-data-logger for inverter load data during session
  // - Calculate average AC load, peak load
  // - Calculate efficiency (DC power in vs AC power out)
  // - Get temperature data to correlate with usage patterns
  
  // Save completed session
  const sessionsDir = path.join(config.logDir, 'inverter-sessions');
  await fs.writeFile(
    path.join(sessionsDir, `${activeSession.id}.json`),
    JSON.stringify(activeSession, null, 2)
  );
  
  logger.info(`Inverter session completed: ${activeSession.id}`, {
    duration: activeSession.duration,
    batteryUsed: activeSession.batteryUsed
  });
  
  const completedSession = activeSession;
  activeSession = null;
  
  return {
    action: 'inverter_session_completed',
    sessionId: completedSession.id,
    duration: completedSession.duration,
    batteryUsed: completedSession.batteryUsed
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
    return extractValues(data);
  } catch (err) {
    logger.error(`Failed to fetch SignalK data from ${path}:`, err);
    return null;
  }
}

/**
 * Extract values from SignalK response structure
 */
function extractValues(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = {};
  for (const key in obj) {
    if (key === 'value' && Object.keys(obj).length === 1) {
      return obj.value;
    }
    result[key] = extractValues(obj[key]);
  }
  return result;
}

/**
 * Generate unique session ID from timestamp
 */
function generateSessionId(timestamp) {
  const date = new Date(timestamp);
  return `inverter-${date.toISOString().replace(/[:.]/g, '-')}`;
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

module.exports = { register };
