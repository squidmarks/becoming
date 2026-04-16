/**
 * Trip CRUD routes
 * MongoDB storage only
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const Trip = require('../models/Trip');

/**
 * GET /api/trips/current-conditions
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
  const { logger } = req.app.locals;
  
  try {
    const trips = await Trip.find().sort({ 'start.time': -1 }).lean();
    
    // Add id field for frontend compatibility
    const tripsWithId = trips.map(trip => ({
      ...trip,
      id: trip._id.toString()
    }));
    
    res.json(tripsWithId);
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
  const { logger } = req.app.locals;
  const { id } = req.params;
  
  try {
    const trip = await Trip.findById(id).lean();
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    trip.id = trip._id.toString();
    res.json(trip);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Trip not found' });
    }
    logger.error(`Error reading trip ${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/trips
 * Create a new trip
 */
router.post('/', async (req, res) => {
  const { logger } = req.app.locals;
  const { start, end, tags, crew, notes } = req.body;
  
  try {
    // Validate required fields
    if (!start?.time || !end?.time) {
      return res.status(400).json({ error: 'start.time and end.time are required' });
    }
    
    // Calculate summaries
    const calculated = calculateTripSummary(start, end);
    
    // Create trip in MongoDB
    const tripDoc = new Trip({
      start,
      end,
      calculated,
      tags: tags || [],
      crew: crew || [],
      notes: notes || ''
    });
    
    await tripDoc.save();
    
    const trip = tripDoc.toObject();
    trip.id = trip._id.toString();
    
    logger.info(`Trip ${trip.id} saved to MongoDB`);
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
  const { logger } = req.app.locals;
  const { id } = req.params;
  const updates = req.body;
  
  try {
    // Recalculate summaries if start/end changed
    if (updates.start || updates.end) {
      const existingTrip = await Trip.findById(id).lean();
      if (!existingTrip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      
      const finalStart = updates.start || existingTrip.start;
      const finalEnd = updates.end || existingTrip.end;
      updates.calculated = calculateTripSummary(finalStart, finalEnd);
    }
    
    const trip = await Trip.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    trip.id = trip._id.toString();
    logger.info(`Trip ${id} updated in MongoDB`);
    res.json(trip);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Trip not found' });
    }
    logger.error(`Error updating trip ${id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/trips/:id
 * Delete a trip
 */
router.delete('/:id', async (req, res) => {
  const { logger } = req.app.locals;
  const { id } = req.params;
  
  try {
    const result = await Trip.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    logger.info(`Trip ${id} deleted from MongoDB`);
    res.status(204).send();
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Trip not found' });
    }
    logger.error(`Error deleting trip ${id}:`, err);
    res.status(500).json({ error: err.message });
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
    if (durationHours > 0) {
      summary.averageSpeed = parseFloat((summary.distance.nauticalMiles / durationHours).toFixed(1));
    }
  }
  
  return summary;
}

module.exports = router;
