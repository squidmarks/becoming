/**
 * WT901BLECL Binary Protocol Parser
 * 
 * Frame format: 0x55 [TYPE] [DATA0-7] [CHECKSUM]
 * Total: 11 bytes per frame
 */

class WT901Parser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.FRAME_HEADER = 0x55;
    this.FRAME_LENGTH = 11;
    
    // Data type identifiers
    this.TYPE_TIME = 0x50;
    this.TYPE_ACCEL = 0x51;
    this.TYPE_GYRO = 0x52;
    this.TYPE_ANGLE = 0x53;
    this.TYPE_MAG = 0x54;
    this.TYPE_PORT = 0x55;
    this.TYPE_QUATERNION = 0x59;
  }

  /**
   * Add data to buffer and parse frames
   * @param {Buffer} data - Incoming serial data
   * @returns {Array} - Array of parsed data objects
   */
  parse(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    const results = [];

    while (this.buffer.length >= this.FRAME_LENGTH) {
      // Look for frame header
      const headerIndex = this.buffer.indexOf(this.FRAME_HEADER);
      
      if (headerIndex === -1) {
        // No header found, clear buffer
        this.buffer = Buffer.alloc(0);
        break;
      }

      if (headerIndex > 0) {
        // Skip to header
        this.buffer = this.buffer.slice(headerIndex);
      }

      if (this.buffer.length < this.FRAME_LENGTH) {
        // Wait for complete frame
        break;
      }

      // Extract frame
      const frame = this.buffer.slice(0, this.FRAME_LENGTH);
      
      // Validate checksum
      if (this.validateChecksum(frame)) {
        const parsed = this.parseFrame(frame);
        if (parsed) {
          results.push(parsed);
        }
      }

      // Remove processed frame
      this.buffer = this.buffer.slice(this.FRAME_LENGTH);
    }

    return results;
  }

  /**
   * Validate frame checksum
   */
  validateChecksum(frame) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += frame[i];
    }
    return (sum & 0xFF) === frame[10];
  }

  /**
   * Parse a single frame based on type
   */
  parseFrame(frame) {
    const type = frame[1];
    
    switch (type) {
      case this.TYPE_ACCEL:
        return this.parseAcceleration(frame);
      case this.TYPE_GYRO:
        return this.parseGyro(frame);
      case this.TYPE_ANGLE:
        return this.parseAngle(frame);
      case this.TYPE_MAG:
        return this.parseMagnetometer(frame);
      default:
        return null;
    }
  }

  /**
   * Parse acceleration data (TYPE 0x51)
   * Range: ±16g
   */
  parseAcceleration(frame) {
    const ax = this.readInt16LE(frame, 2) / 32768.0 * 16; // g
    const ay = this.readInt16LE(frame, 4) / 32768.0 * 16; // g
    const az = this.readInt16LE(frame, 6) / 32768.0 * 16; // g
    const temp = this.readInt16LE(frame, 8) / 100.0; // °C

    return {
      type: 'acceleration',
      x: ax * 9.81, // Convert to m/s²
      y: ay * 9.81,
      z: az * 9.81,
      temperature: temp + 273.15 // Convert to Kelvin
    };
  }

  /**
   * Parse gyroscope data (TYPE 0x52)
   * Range: ±2000°/s
   */
  parseGyro(frame) {
    const gx = this.readInt16LE(frame, 2) / 32768.0 * 2000; // °/s
    const gy = this.readInt16LE(frame, 4) / 32768.0 * 2000; // °/s
    const gz = this.readInt16LE(frame, 6) / 32768.0 * 2000; // °/s

    return {
      type: 'gyro',
      x: gx * Math.PI / 180, // Convert to rad/s
      y: gy * Math.PI / 180,
      z: gz * Math.PI / 180
    };
  }

  /**
   * Parse angle data (TYPE 0x53)
   * Range: ±180°
   */
  parseAngle(frame) {
    const roll = this.readInt16LE(frame, 2) / 32768.0 * 180;  // °
    const pitch = this.readInt16LE(frame, 4) / 32768.0 * 180; // °
    const yaw = this.readInt16LE(frame, 6) / 32768.0 * 180;   // °

    return {
      type: 'angle',
      roll: roll * Math.PI / 180,   // Convert to radians
      pitch: pitch * Math.PI / 180,
      yaw: yaw * Math.PI / 180
    };
  }

  /**
   * Parse magnetometer data (TYPE 0x54)
   */
  parseMagnetometer(frame) {
    const mx = this.readInt16LE(frame, 2);
    const my = this.readInt16LE(frame, 4);
    const mz = this.readInt16LE(frame, 6);

    return {
      type: 'magnetometer',
      x: mx,
      y: my,
      z: mz
    };
  }

  /**
   * Read 16-bit signed integer (little-endian)
   */
  readInt16LE(buffer, offset) {
    return buffer.readInt16LE(offset);
  }

  /**
   * Reset parser state
   */
  reset() {
    this.buffer = Buffer.alloc(0);
  }
}

module.exports = { WT901Parser };
