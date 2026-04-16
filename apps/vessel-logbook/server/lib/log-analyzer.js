/**
 * Log Analyzer
 * 
 * Analyzes vessel-data-logger JSONL files for a given time range
 * and extracts trip metrics.
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const { createReadStream } = require('fs');

/**
 * Analyze a trip from vessel logs
 */
async function analyzeTrip(startTime, endTime, config, logger) {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  
  logger.info(`Analyzing trip from ${startTime} to ${endTime}`);
  
  // Find relevant log files (YYYY-MM-DD-HH.jsonl format)
  const logFiles = await findLogFilesForTimeRange(startMs, endMs, config.loggerDataDir);
  
  if (logFiles.length === 0) {
    logger.warn('No log files found for time range');
    return {
      status: 'no_data',
      message: 'No log data available for this time period'
    };
  }
  
  logger.info(`Found ${logFiles.length} log files to analyze`);
  
  // Parse logs and extract metrics
  const metrics = {
    positions: [],
    speeds: [],
    depths: [],
    engineHours: { port: [], starboard: [] },
    engineRPM: { port: [], starboard: [] },
    fuel: { port: [], starboard: [] }
  };
  
  for (const logFile of logFiles) {
    await parseLogFile(logFile, startMs, endMs, metrics, logger);
  }
  
  // Calculate statistics
  const analysis = calculateStatistics(metrics, startMs, endMs);
  
  return analysis;
}

/**
 * Find log files that overlap with the time range
 */
async function findLogFilesForTimeRange(startMs, endMs, logDir) {
  try {
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(f => f.endsWith('.jsonl'));
    
    // Parse dates from filenames (YYYY-MM-DD-HH.jsonl)
    const relevantFiles = [];
    
    for (const file of logFiles) {
      const match = file.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})\.jsonl$/);
      if (match) {
        const [_, year, month, day, hour] = match;
        const fileStartMs = new Date(`${year}-${month}-${day}T${hour}:00:00Z`).getTime();
        const fileEndMs = fileStartMs + (60 * 60 * 1000); // +1 hour
        
        // Check if file overlaps with time range
        if (fileEndMs >= startMs && fileStartMs <= endMs) {
          relevantFiles.push(path.join(logDir, file));
        }
      }
    }
    
    return relevantFiles.sort();
  } catch (err) {
    throw new Error(`Failed to read log directory: ${err.message}`);
  }
}

/**
 * Parse a JSONL log file and extract relevant data points
 */
async function parseLogFile(filePath, startMs, endMs, metrics, logger) {
  return new Promise((resolve, reject) => {
    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let matchedLines = 0;
    
    rl.on('line', (line) => {
      lineCount++;
      
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp).getTime();
        
        // Skip if outside time range
        if (timestamp < startMs || timestamp > endMs) {
          return;
        }
        
        matchedLines++;
        
        // Extract position
        if (entry.navigation?.position?.value) {
          metrics.positions.push({
            timestamp,
            lat: entry.navigation.position.value.latitude,
            lon: entry.navigation.position.value.longitude
          });
        }
        
        // Extract speed
        if (entry.navigation?.speedOverGround?.value != null) {
          metrics.speeds.push({
            timestamp,
            value: entry.navigation.speedOverGround.value
          });
        }
        
        // Extract depth
        if (entry.environment?.depth?.belowTransducer?.value != null) {
          metrics.depths.push({
            timestamp,
            value: entry.environment.depth.belowTransducer.value
          });
        }
        
        // Extract engine hours
        if (entry.propulsion?.port?.runTime?.value != null) {
          metrics.engineHours.port.push({
            timestamp,
            value: entry.propulsion.port.runTime.value
          });
        }
        if (entry.propulsion?.starboard?.runTime?.value != null) {
          metrics.engineHours.starboard.push({
            timestamp,
            value: entry.propulsion.starboard.runTime.value
          });
        }
        
        // Extract engine RPM
        if (entry.propulsion?.port?.revolutions?.value != null) {
          metrics.engineRPM.port.push({
            timestamp,
            value: entry.propulsion.port.revolutions.value * 60 // Hz to RPM
          });
        }
        if (entry.propulsion?.starboard?.revolutions?.value != null) {
          metrics.engineRPM.starboard.push({
            timestamp,
            value: entry.propulsion.starboard.revolutions.value * 60
          });
        }
        
        // Extract fuel levels
        if (entry.tanks?.fuel?.port?.currentLevel?.value != null) {
          metrics.fuel.port.push({
            timestamp,
            value: entry.tanks.fuel.port.currentLevel.value
          });
        }
        if (entry.tanks?.fuel?.starboard?.currentLevel?.value != null) {
          metrics.fuel.starboard.push({
            timestamp,
            value: entry.tanks.fuel.starboard.currentLevel.value
          });
        }
      } catch (err) {
        // Skip malformed lines
      }
    });
    
    rl.on('close', () => {
      logger.debug(`Parsed ${path.basename(filePath)}: ${matchedLines}/${lineCount} lines matched`);
      resolve();
    });
    
    rl.on('error', reject);
  });
}

/**
 * Calculate trip statistics from collected metrics
 */
function calculateStatistics(metrics, startMs, endMs) {
  const durationMs = endMs - startMs;
  const durationHours = durationMs / (1000 * 60 * 60);
  
  const stats = {
    duration: {
      milliseconds: durationMs,
      hours: Math.floor(durationHours),
      minutes: Math.floor((durationHours % 1) * 60),
      formatted: `${Math.floor(durationHours)}h ${Math.floor((durationHours % 1) * 60)}m`
    },
    dataPoints: {
      positions: metrics.positions.length,
      speeds: metrics.speeds.length,
      depths: metrics.depths.length
    }
  };
  
  // Calculate distance from positions
  if (metrics.positions.length >= 2) {
    const start = metrics.positions[0];
    const end = metrics.positions[metrics.positions.length - 1];
    
    stats.startPosition = { lat: start.lat, lon: start.lon };
    stats.endPosition = { lat: end.lat, lon: end.lon };
    
    // Calculate total distance (sum of segments)
    let totalDistanceNm = 0;
    for (let i = 1; i < metrics.positions.length; i++) {
      const dist = haversineDistance(
        metrics.positions[i-1].lat, metrics.positions[i-1].lon,
        metrics.positions[i].lat, metrics.positions[i].lon
      );
      totalDistanceNm += dist;
    }
    
    stats.distance = {
      nauticalMiles: parseFloat(totalDistanceNm.toFixed(2)),
      kilometers: parseFloat((totalDistanceNm * 1.852).toFixed(2))
    };
  }
  
  // Calculate speed statistics
  if (metrics.speeds.length > 0) {
    const speedsKnots = metrics.speeds.map(s => s.value * 1.94384); // m/s to knots
    stats.speed = {
      average: parseFloat((speedsKnots.reduce((a, b) => a + b, 0) / speedsKnots.length).toFixed(1)),
      max: parseFloat(Math.max(...speedsKnots).toFixed(1)),
      unit: 'knots'
    };
  }
  
  // Calculate depth statistics
  if (metrics.depths.length > 0) {
    const depthsFeet = metrics.depths.map(d => d.value * 3.28084); // m to feet
    stats.depth = {
      average: parseFloat((depthsFeet.reduce((a, b) => a + b, 0) / depthsFeet.length).toFixed(1)),
      max: parseFloat(Math.max(...depthsFeet).toFixed(1)),
      min: parseFloat(Math.min(...depthsFeet).toFixed(1)),
      unit: 'feet'
    };
  }
  
  // Calculate engine hours
  if (metrics.engineHours.port.length > 0) {
    const startHours = metrics.engineHours.port[0].value / 3600; // seconds to hours
    const endHours = metrics.engineHours.port[metrics.engineHours.port.length - 1].value / 3600;
    stats.engineHours = {
      port: parseFloat((endHours - startHours).toFixed(2)),
      starboard: 0,
      unit: 'hours'
    };
    
    if (metrics.engineHours.starboard.length > 0) {
      const startHoursStbd = metrics.engineHours.starboard[0].value / 3600;
      const endHoursStbd = metrics.engineHours.starboard[metrics.engineHours.starboard.length - 1].value / 3600;
      stats.engineHours.starboard = parseFloat((endHoursStbd - startHoursStbd).toFixed(2));
    }
  }
  
  // Calculate average RPM
  if (metrics.engineRPM.port.length > 0) {
    stats.engineRPM = {
      port: {
        average: Math.round(metrics.engineRPM.port.reduce((a, b) => a + b.value, 0) / metrics.engineRPM.port.length),
        max: Math.round(Math.max(...metrics.engineRPM.port.map(r => r.value)))
      },
      starboard: { average: 0, max: 0 }
    };
    
    if (metrics.engineRPM.starboard.length > 0) {
      stats.engineRPM.starboard = {
        average: Math.round(metrics.engineRPM.starboard.reduce((a, b) => a + b.value, 0) / metrics.engineRPM.starboard.length),
        max: Math.round(Math.max(...metrics.engineRPM.starboard.map(r => r.value)))
      };
    }
  }
  
  return stats;
}

/**
 * Calculate distance between two lat/lon points (Haversine formula)
 * Returns distance in nautical miles
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

module.exports = {
  analyzeTrip
};
