/**
 * Trip CRUD routes
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { analyzeTrip } = require('../lib/log-analyzer');

/**
 * GET /api/current-conditions
 * Fetch current vessel conditions from SignalK
 */
router.get('/current-conditions', async (req, res) => {
  const { logger, config } = req.app.locals;
  
  try {
    const url = `${config.signalkUrl}/signalk/v1/api/vessels/self`;
    logger.info(`Fetching current conditions from ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`SignalK returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract relevant data
    const conditions = {
      timestamp: new Date().toISOString(),
      position: data.navigation?.position?.value || null,
      engineHours: {
        port: data.propulsion?.port?.runTime?.value ? 
          parseFloat((data.propulsion.port.runTime.value / 3600).toFixed(2)) : null,
        starboard: data.propulsion?.starboard?.runTime?.value ?
          parseFloat((data.propulsion.starboard.runTime.value / 3600).toFixed(2)) : null
      },
      weather: {
        windSpeed: data.environment?.wind?.speedTrue?.value || null,
        windDirection: data.environment?.wind?.directionTrue?.value || null,
        barometer: data.environment?.outside?.pressure?.value || null,
        temperature: data.environment?.outside?.temperature?.value || null
      },
      seaState: data.environment?.seaState?.description?.value || null
    };
    
    logger.info('Current conditions fetched successfully', conditions);
    res.json(conditions);
  } catch (err) {
    logger.error('Error fetching current conditions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/trips
 * List all trips
 */
router.get('/', async (req, res) => {
  const { logger, config } = req.app.locals;
  
  try {
    // Ensure trips directory exists
    await fs.mkdir(config.tripsDir, { recursive: true });
    
    // Read all trip files
    const files = await fs.readdir(config.tripsDir);
    const tripFiles = files.filter(f => f.endsWith('.json'));
    
    // Load and parse each trip
    const trips = await Promise.all(
      tripFiles.map(async (file) => {
        const content = await fs.readFile(path.join(config.tripsDir, file), 'utf-8');
        return JSON.parse(content);
      })
    );
    
    // Sort by start time (newest first) - handle both old and new formats
    trips.sort((a, b) => {
      const aTime = a.start?.time || a.startTime;
      const bTime = b.start?.time || b.startTime;
      return new Date(bTime) - new Date(aTime);
    });
    
    res.json(trips);
  } catch (err) {
    logger.error('Error listing trips:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/trips/:id
 * Get a specific trip
 */
router.get('/:id', async (req, res) => {
  const { logger, config } = req.app.locals;
  const { id } = req.params;
  
  try {
    const filePath = path.join(config.tripsDir, `${id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const trip = JSON.parse(content);
    
    res.json(trip);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Trip not found' });
    } else {
      logger.error(`Error reading trip ${id}:`, err);
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/trips
 * Create a new trip
 * 
 * Body:
 * {
 *   start: { time, position, locationName, engineHours, fuelLevel, conditions },
 *   end: { time, position, locationName, engineHours, fuelLevel, conditions },
 *   tags: string[],
 *   crew: string[],
 *   notes: string
 * }
 */
router.post('/', async (req, res) => {
  const { logger, config } = req.app.locals;
  const { start, end, tags, crew, notes } = req.body;
  
  try {
    // Validate required fields
    if (!start?.time || !end?.time) {
      return res.status(400).json({ error: 'start.time and end.time are required' });
    }
    
    // Generate trip ID from start time
    const id = `trip-${new Date(start.time).toISOString().replace(/[:.]/g, '-')}`;
    
    // Calculate duration and summaries
    const calculated = calculateTripSummary(start, end);
    
    // Create trip object
    const trip = {
      id,
      start,
      end,
      calculated,
      tags: tags || [],
      crew: crew || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    logger.info(`Creating trip ${id} from ${start.time} to ${end.time}`);
    
    // Save to file
    await fs.mkdir(config.tripsDir, { recursive: true });
    const filePath = path.join(config.tripsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(trip, null, 2));
    
    logger.info(`Trip ${id} saved successfully`);
    
    res.status(201).json(trip);
  } catch (err) {
    logger.error('Error creating trip:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/trips/:id
 * Update a trip
 */
router.put('/:id', async (req, res) => {
  const { logger, config } = req.app.locals;
  const { id } = req.params;
  const updates = req.body;
  
  try {
    const filePath = path.join(config.tripsDir, `${id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const trip = JSON.parse(content);
    
    // Update fields
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        trip[key] = updates[key];
      }
    });
    
    // Recalculate summaries if start/end changed
    if (updates.start || updates.end) {
      trip.calculated = calculateTripSummary(trip.start, trip.end);
    }
    
    trip.updatedAt = new Date().toISOString();
    
    // Save updated trip
    await fs.writeFile(filePath, JSON.stringify(trip, null, 2));
    
    logger.info(`Trip ${id} updated successfully`);
    
    res.json(trip);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Trip not found' });
    } else {
      logger.error(`Error updating trip ${id}:`, err);
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * DELETE /api/trips/:id
 * Delete a trip
 */
router.delete('/:id', async (req, res) => {
  const { logger, config } = req.app.locals;
  const { id } = req.params;
  
  try {
    const filePath = path.join(config.tripsDir, `${id}.json`);
    await fs.unlink(filePath);
    
    logger.info(`Trip ${id} deleted successfully`);
    
    res.status(204).send();
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Trip not found' });
    } else {
      logger.error(`Error deleting trip ${id}:`, err);
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * Calculate trip summary from start/end conditions
 */
function calculateTripSummary(start, end) {
  const summary = {};
  
  // Duration
  const startMs = new Date(start.time).getTime();
  const endMs = new Date(end.time).getTime();
  const durationMs = endMs - startMs;
  const durationHours = durationMs / (1000 * 60 * 60);
  
  summary.duration = {
    milliseconds: durationMs,
    hours: Math.floor(durationHours),
    minutes: Math.floor((durationHours % 1) * 60),
    formatted: `${Math.floor(durationHours)}h ${Math.floor((durationHours % 1) * 60)}m`
  };
  
  // Engine hours added
  if (start.engineHours && end.engineHours) {
    summary.engineHoursAdded = {};
    if (start.engineHours.port != null && end.engineHours.port != null) {
      summary.engineHoursAdded.port = parseFloat((end.engineHours.port - start.engineHours.port).toFixed(2));
    }
    if (start.engineHours.starboard != null && end.engineHours.starboard != null) {
      summary.engineHoursAdded.starboard = parseFloat((end.engineHours.starboard - start.engineHours.starboard).toFixed(2));
    }
  }
  
  // Fuel used
  if (start.fuelLevel && end.fuelLevel) {
    summary.fuelUsed = {};
    if (start.fuelLevel.port != null && end.fuelLevel.port != null) {
      summary.fuelUsed.port = parseFloat((start.fuelLevel.port - end.fuelLevel.port).toFixed(3));
    }
    if (start.fuelLevel.starboard != null && end.fuelLevel.starboard != null) {
      summary.fuelUsed.starboard = parseFloat((start.fuelLevel.starboard - end.fuelLevel.starboard).toFixed(3));
    }
  }
  
  // Distance (Haversine formula)
  if (start.position && end.position && 
      start.position.latitude != null && start.position.longitude != null &&
      end.position.latitude != null && end.position.longitude != null) {
    
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = (end.position.latitude - start.position.latitude) * Math.PI / 180;
    const dLon = (end.position.longitude - start.position.longitude) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(start.position.latitude * Math.PI / 180) * 
              Math.cos(end.position.latitude * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    summary.distance = {
      nauticalMiles: parseFloat((R * c).toFixed(2)),
      kilometers: parseFloat((R * c * 1.852).toFixed(2))
    };
    
    // Average speed
    if (summary.duration.hours > 0) {
      summary.averageSpeed = parseFloat((summary.distance.nauticalMiles / durationHours).toFixed(1));
    }
  }
  
  return summary;
}

module.exports = router;
