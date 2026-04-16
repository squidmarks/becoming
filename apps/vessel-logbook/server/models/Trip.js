/**
 * Trip Model
 * MongoDB schema for trip logs
 */

const mongoose = require('mongoose');

const ConditionsSchema = new mongoose.Schema({
  time: { type: Date, required: true },
  locationName: String,
  position: {
    latitude: Number,
    longitude: Number
  },
  engineHours: {
    port: Number,
    starboard: Number
  },
  fuelLevel: Number,
  conditions: {
    wind: {
      speed: Number,
      direction: Number
    },
    barometer: Number,
    temperature: Number,
    seaState: String
  }
}, { _id: false });

const CalculatedSchema = new mongoose.Schema({
  duration: {
    milliseconds: Number,
    hours: Number,
    minutes: Number,
    formatted: String
  },
  distance: {
    nauticalMiles: Number,
    kilometers: Number
  },
  averageSpeed: Number,
  engineHoursAdded: {
    port: Number,
    starboard: Number
  },
  fuelUsed: Number
}, { _id: false });

const TripSchema = new mongoose.Schema({
  start: {
    type: ConditionsSchema,
    required: true
  },
  end: {
    type: ConditionsSchema,
    required: true
  },
  calculated: CalculatedSchema,
  tags: [String],
  crew: [String],
  notes: String
}, {
  timestamps: true  // Adds createdAt and updatedAt automatically
});

// Index for sorting and querying
TripSchema.index({ 'start.time': -1 });
TripSchema.index({ 'tags': 1 });
TripSchema.index({ 'crew': 1 });

module.exports = mongoose.model('Trip', TripSchema);
