/**
 * WT901BLECL Bluetooth LE Parser
 * 
 * Parses 20-byte data packets from WT901BLECL sensor
 * ALL data (accel, gyro, angles) is in one packet!
 */

class WT901BLEParser {
  constructor() {
    this.reset();
  }

  /**
   * Parse a 20-byte WT901BLECL data packet
   * @param {Buffer} data - 20-byte packet from BLE notification
   * @returns {Object|null} - Parsed sensor data or null if invalid
   */
  parse(data) {
    if (!data || data.length < 20) {
      return null;
    }

    // Skip header (bytes 0-1), process data bytes 2-19
    const rawData = data.slice(2);
    
    // Convert unsigned bytes to signed
    const signedBytes = [];
    for (let i = 0; i < rawData.length; i++) {
      const b = rawData[i];
      signedBytes.push(b <= 127 ? b : (256 - b) * -1);
    }

    // Parse acceleration (bytes 0-5 of raw data)
    const ax_raw = (signedBytes[1] << 8) | (signedBytes[0] & 0xFF);
    const ay_raw = (signedBytes[3] << 8) | (signedBytes[2] & 0xFF);
    const az_raw = (signedBytes[5] << 8) | (signedBytes[4] & 0xFF);

    const ax = (ax_raw / 32768.0) * (16 * 9.8);  // m/s²
    const ay = (ay_raw / 32768.0) * (16 * 9.8);
    const az = (az_raw / 32768.0) * (16 * 9.8);

    // Parse angular velocity (bytes 6-11)
    const wx_raw = (signedBytes[7] << 8) | (signedBytes[6] & 0xFF);
    const wy_raw = (signedBytes[9] << 8) | (signedBytes[8] & 0xFF);
    const wz_raw = (signedBytes[11] << 8) | (signedBytes[10] & 0xFF);

    const wx = (wx_raw / 32768.0) * 2000;  // deg/s
    const wy = (wy_raw / 32768.0) * 2000;
    const wz = (wz_raw / 32768.0) * 2000;

    // Parse angles (bytes 12-17) - THIS IS THE KEY DATA!
    const roll_raw = (signedBytes[13] << 8) | (signedBytes[12] & 0xFF);
    const pitch_raw = (signedBytes[15] << 8) | (signedBytes[14] & 0xFF);
    const yaw_raw = (signedBytes[17] << 8) | (signedBytes[16] & 0xFF);

    const roll = (roll_raw / 32768.0) * 180;  // degrees
    const pitch = (pitch_raw / 32768.0) * 180;
    const yaw = (yaw_raw / 32768.0) * 180;

    return {
      type: 'combined',  // All data in one packet
      timestamp: Date.now(),
      acceleration: {
        x: ax,
        y: ay,
        z: az
      },
      gyro: {
        x: wx,
        y: wy,
        z: wz
      },
      angle: {
        roll: roll * (Math.PI / 180),   // Convert to radians for SignalK
        pitch: pitch * (Math.PI / 180),
        yaw: yaw * (Math.PI / 180)
      }
    };
  }

  reset() {
    // No state to reset for BLE parser
  }
}

module.exports = { WT901BLEParser };
