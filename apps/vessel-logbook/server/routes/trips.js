/**
 * Trip CRUD routes
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { analyzeTrip } = require('../lib/log-analyzer');

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
    
    // Sort by start time (newest first)
    trips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
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
 *   startTime: ISO8601,
 *   endTime: ISO8601,
 *   from: string,
 *   to: string,
 *   crew: string[],
 *   notes: string
 * }
 */
router.post('/', async (req, res) => {
  const { logger, config } = req.app.locals;
  const { startTime, endTime, from, to, crew, notes } = req.body;
  
  try {
    // Validate required fields
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }
    
    // Generate trip ID from start time
    const id = `trip-${new Date(startTime).toISOString().replace(/[:.]/g, '-')}`;
    
    // Create basic trip object
    const trip = {
      id,
      startTime,
      endTime,
      from: from || null,
      to: to || null,
      crew: crew || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    logger.info(`Creating trip ${id} from ${startTime} to ${endTime}`);
    
    // Analyze trip data from logs
    try {
      const analysis = await analyzeTrip(startTime, endTime, config, logger);
      trip.analysis = analysis;
      logger.info(`Trip analysis completed for ${id}`, analysis);
    } catch (err) {
      logger.error(`Failed to analyze trip ${id}:`, err);
      trip.analysis = {
        error: err.message,
        status: 'failed'
      };
    }
    
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

module.exports = router;
