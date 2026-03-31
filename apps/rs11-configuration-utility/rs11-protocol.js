/**
 * RS11 Protocol Handler
 * Builds and parses commands for the NoLand RS11 Engine Data Converter
 */

export class RS11Protocol {
  constructor() {
    this.commandQueue = [];
  }

  // Operating Commands
  stopDevice() {
    return '@<\r';
  }

  restartDevice() {
    return '@>\r';
  }

  queryConfig() {
    return '@?\r';
  }

  queryLive() {
    return '@q\r';
  }

  factoryReset() {
    return '@~rst\r';
  }

  // Configuration Commands
  setEngineInstance(instance) {
    const val = String(instance).padStart(3, '0');
    return `@Q${val}\r`;
  }

  setStartAddress(address) {
    const val = String(address).padStart(3, '0');
    return `@|${val}\r`;
  }

  setMultiBattStartInstance(value) {
    // 0/4/6
    return `@b${value}\r`;
  }

  setEngineHours(engine, hours) {
    // engine: 'P' or 'S', hours: 0-99998
    const val = String(hours).padStart(5, '0');
    return `@R${engine},${val}\r`;
  }

  setPortPPR(ppr) {
    // 001-500, 000=off
    const val = String(ppr).padStart(3, '0');
    return `@P${val}\r`;
  }

  setStbdPPR(ppr) {
    // 001-500, 000=off
    const val = String(ppr).padStart(3, '0');
    return `@S${val}\r`;
  }

  setPortPPL(ppl) {
    // 0060-9999, 99999=off
    const val = ppl === 99999 ? '99999' : String(ppl).padStart(4, '0');
    return `@p${val}\r`;
  }

  setStbdPPL(ppl) {
    // 0060-9999, 99999=off
    const val = ppl === 99999 ? '99999' : String(ppl).padStart(4, '0');
    return `@s${val}\r`;
  }

  setSenderCurrent(port, enabled) {
    // port: 1-4, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@C${port},${state}\r`;
  }

  setSmoothing(port, enabled) {
    // port: 1-4, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@T${port},${state}\r`;
  }

  setFuelCapacity(engine, liters) {
    // engine: 'P' or 'S'
    const val = String(liters).padStart(3, '0');
    return `@^${engine},${val}\r`;
  }

  setWaterCapacity(engine, liters) {
    const val = String(liters).padStart(3, '0');
    return `@[${engine},${val}\r`;
  }

  setOilCapacity(engine, liters) {
    const val = String(liters).padStart(3, '0');
    return `@]${engine},${val}\r`;
  }

  // Calibration Commands
  setAnalogField(port, engine, fieldNum) {
    // port: 1-6, engine: 'P' or 'S', fieldNum: 0-n
    return `@D${port},${engine},${fieldNum}\r`;
  }

  setCANbusMessage(msgNum, engine, enabled) {
    // msgNum: 1-9, engine: 'P' or 'S', enabled: true/false
    const state = enabled ? '+' : '-';
    return `@N${msgNum},${engine},${state}\r`;
  }

  setAnalogXValue(port, sign, value) {
    // port: 1-6, sign: '+' or '-', value: 0000-9999
    const val = String(value).padStart(4, '0');
    return `@X${port},${sign},${val}\r`;
  }

  setAnalogYValue(port, sign, value) {
    // port: 1-6, sign: '+' or '-', value: 001-125
    const val = String(value).padStart(3, '0');
    return `@Y${port},${sign},${val}\r`;
  }

  setAnalogZByte(port, hex, enabled) {
    // port: 1-6, hex: 0-F, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@Z${port},${hex},${state}\r`;
  }

  setBreakpoint(port, value) {
    // port: 1-6, value: x100, 000=off
    const val = String(value).padStart(3, '0');
    return `@L${port},${val}\r`;
  }

  setThreePointXValue(port, value) {
    // port: 1-6, value: 0000-9999
    const val = String(value).padStart(4, '0');
    return `@x${port},${val}\r`;
  }

  setThreePointYValue(port, value) {
    // port: 1-6, value: 001-125
    const val = String(value).padStart(3, '0');
    return `@y${port},${val}\r`;
  }

  setThreePointZByte(port, hex, enabled) {
    // port: 1-6, hex: 0-F, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@z${port},${hex},${state}\r`;
  }

  setAlarmValue(port, value) {
    // port: 1-6, value: 00-99, 00=off
    const val = String(value).padStart(2, '0');
    return `@A${port},${val}\r`;
  }

  // Parse response from device
  parseResponse(data) {
    const lines = data.toString().split('\r\n').filter(line => line.trim());
    return lines;
  }

  // Parse configuration query response
  parseConfigResponse(lines) {
    const config = {
      instance: null,
      startAddress: null,
      portPPR: null,
      stbdPPR: null,
      portPPL: null,
      stbdPPL: null,
      analogs: [],
      raw: lines
    };

    // Parse configuration lines
    // Format varies, will need to be refined based on actual device response
    for (const line of lines) {
      if (line.includes('Instance')) {
        const match = line.match(/(\d+)/);
        if (match) config.instance = parseInt(match[1]);
      }
      if (line.includes('PPR')) {
        const match = line.match(/Port.*?(\d+).*?Stbd.*?(\d+)/i);
        if (match) {
          config.portPPR = parseInt(match[1]);
          config.stbdPPR = parseInt(match[2]);
        }
      }
    }

    return config;
  }

  // Parse live query response
  parseLiveResponse(lines) {
    const data = {
      timestamp: new Date(),
      portRPM: null,
      stbdRPM: null,
      analogs: [],
      raw: lines
    };

    // Parse live data lines
    // Format will need to be refined based on actual device response
    for (const line of lines) {
      if (line.includes('RPM')) {
        const match = line.match(/Port.*?(\d+).*?Stbd.*?(\d+)/i);
        if (match) {
          data.portRPM = parseInt(match[1]);
          data.stbdRPM = parseInt(match[2]);
        }
      }
      // Parse analog values
      const analogMatch = line.match(/A(\d+).*?(\d+\.?\d*)/);
      if (analogMatch) {
        data.analogs.push({
          port: parseInt(analogMatch[1]),
          value: parseFloat(analogMatch[2])
        });
      }
    }

    return data;
  }
}
