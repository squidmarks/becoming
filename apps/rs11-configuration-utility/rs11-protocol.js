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
    return '@<\r\n';
  }

  restartDevice() {
    return '@>\r\n';
  }

  queryConfig() {
    return '@?\r\n';
  }

  queryLive() {
    return '@q\r\n';
  }

  factoryReset() {
    return '@~rst\r\n';
  }

  // Configuration Commands
  setEngineInstance(portInstance, stbdInstance = null) {
    // DISCOVERY: @Q sets BOTH port and starboard instances with a single value
    // Testing revealed: @Q001 = port:0, stbd:1 (ideal for dual engines)
    // The command sets starboard = value sent, and port appears to be 0 when value is small
    // For dual engine setup, always use @Q001 to get port=0, starboard=1
    if (stbdInstance !== null && stbdInstance !== undefined && stbdInstance === 1 && portInstance === 0) {
      // Standard dual-engine configuration: port=0, starboard=1
      return `@Q001\r\n`;
    } else {
      // Single value format - behavior may vary
      const val = String(portInstance).padStart(3, '0');
      return `@Q${val}\r\n`;
    }
  }

  setStartAddress(address) {
    const val = String(address).padStart(3, '0');
    return `@|${val}\r\n`;
  }

  setMultiBattStartInstance(value) {
    // 0/4/6
    return `@b${value}\r\n`;
  }

  setEngineHours(engine, hours) {
    // engine: 'P' or 'S', hours: 0-99998
    const val = String(hours).padStart(5, '0');
    return `@R${engine}${val}\r\n`;
  }

  setPortPPR(ppr) {
    // 001-500, 000=off
    const val = String(ppr).padStart(3, '0');
    return `@P${val}\r\n`;
  }

  setStbdPPR(ppr) {
    // 001-500, 000=off
    const val = String(ppr).padStart(3, '0');
    return `@S${val}\r\n`;
  }

  setPortPPL(ppl) {
    // 0060-9999, 99999=off
    const val = ppl === 99999 ? '99999' : String(ppl).padStart(4, '0');
    return `@p${val}\r\n`;
  }

  setStbdPPL(ppl) {
    // 0060-9999, 99999=off
    const val = ppl === 99999 ? '99999' : String(ppl).padStart(4, '0');
    return `@s${val}\r\n`;
  }

  enableMessage(messageNum, engine, enabled) {
    // messageNum: 1-9, engine: 'P' or 'S', enabled: true/false
    const state = enabled ? '+' : '-';
    return `@N${messageNum}${engine}${state}\r\n`;
  }

  setSenderCurrent(port, enabled) {
    // port: 1-4, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@C${port}${state}\r\n`;
  }

  setSmoothing(port, enabled) {
    // port: 1-4, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@T${port}${state}\r\n`;
  }

  setFuelCapacity(engine, liters) {
    // engine: 'P' or 'S'
    const val = String(liters).padStart(3, '0');
    return `@^${engine}${val}\r\n`;
  }

  setWaterCapacity(engine, liters) {
    const val = String(liters).padStart(3, '0');
    return `@[${engine}${val}\r\n`;
  }

  setOilCapacity(engine, liters) {
    const val = String(liters).padStart(3, '0');
    return `@]${engine}${val}\r\n`;
  }

  // Calibration Commands
  setAnalogField(port, engine, fieldNum) {
    // port: 1-6, engine: 'P' or 'S', fieldNum: 0-n
    return `@D${port}${engine}${fieldNum}\r\n`;
  }

  setCANbusMessage(msgNum, engine, enabled) {
    // msgNum: 1-9, engine: 'P' or 'S', enabled: true/false
    const state = enabled ? '+' : '-';
    return `@N${msgNum}${engine}${state}\r\n`;
  }

  setAnalogXValue(port, sign, value) {
    // port: 1-6, sign: '+' or '-', value: 0000-9999
    const val = String(value).padStart(4, '0');
    return `@X${port}${sign}${val}\r\n`;
  }

  setAnalogYValue(port, sign, value) {
    // port: 1-6, sign: '+' or '-', value: 001-125
    const val = String(value).padStart(3, '0');
    return `@Y${port}${sign}${val}\r\n`;
  }

  setAnalogZByte(port, hex, enabled) {
    // port: 1-6, hex: 0-F, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@Z${port}${hex}${state}\r\n`;
  }

  setBreakpoint(port, value) {
    // port: 1-6, value: x100, 000=off
    const val = String(value).padStart(3, '0');
    return `@L${port}${val}\r\n`;
  }

  setThreePointXValue(port, value) {
    // port: 1-6, value: 0000-9999
    const val = String(value).padStart(4, '0');
    return `@x${port}${val}\r\n`;
  }

  setThreePointYValue(port, value) {
    // port: 1-6, value: 001-125
    const val = String(value).padStart(3, '0');
    return `@y${port}${val}\r\n`;
  }

  setThreePointZByte(port, hex, enabled) {
    // port: 1-6, hex: 0-F, enabled: true/false
    const state = enabled ? '+' : '-';
    return `@z${port}${hex}${state}\r\n`;
  }

  setAlarmValue(port, value) {
    // port: 1-6, value: 00-99, 00=off
    const val = String(value).padStart(2, '0');
    return `@A${port}${val}\r\n`;
  }

  setTwoPointCalibration(port, lowVolts, lowValue, highVolts, highValue, fieldType = null) {
    // UNDOCUMENTED command discovered from Windows app terminal output
    // @m{port}stn:{flag};{lowVolts};{lowValue};{highVolts};{highValue};{alarm}>
    // Flag: 0=pressure (PSI), 1=temperature (°F)
    // RS11 calculates X/Y internally and converts to SI units (Pa, K) for NMEA 2000
    
    let flag = 0; // Default to pressure
    if (fieldType && fieldType.includes('Temp')) {
      flag = 1; // Temperature
    }
    
    return `@m${port}stn:${flag};${lowVolts};${lowValue};${highVolts};${highValue};0>\r\n`;
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
    for (const line of lines) {
      if (line.includes('Instance')) {
        const match = line.match(/(\d+)/);
        if (match) config.instance = parseInt(match[1]);
      }
      // Message1 Eng Rapid Port (On)/Stbd(Off) [ppr=123/456] or [ppr=---/---]
      if (line.includes('ppr=')) {
        const match = line.match(/ppr=(\d+|---?)\/(\d+|---?)/i);
        if (match) {
          config.portPPR = match[1].includes('-') ? 0 : parseInt(match[1]);
          config.stbdPPR = match[2].includes('-') ? 0 : parseInt(match[2]);
        }
      }
      // Message2 Eng Dynamic Port (On)/Stbd(Off) [ppl=1234/5678] or [ppl=9999/----]
      if (line.includes('ppl=')) {
        const match = line.match(/ppl=(\d+|---?)\/(\d+|---?)/i);
        if (match) {
          const portVal = match[1].includes('-') ? 99999 : parseInt(match[1]);
          const stbdVal = match[2].includes('-') ? 99999 : parseInt(match[2]);
          config.portPPL = portVal === 9999 ? 99999 : portVal;
          config.stbdPPL = stbdVal === 9999 ? 99999 : stbdVal;
        }
      }
      
      // Parse analog lines: "A1= Port Oil Pres   [-0708,+008,0] 0000 Sndr_Curr(Off)"
      // Note: Field name may have trailing spaces before the bracket
      if (line.startsWith('A') && line.includes('[')) {
        console.log('DEBUG: Analog line:', line);
      }
      const analogMatch = line.match(/^A(\d)=\s+(Port|Stbd)\s+(.+?)\s*\[([+\-]\d+),([+\-]\d+),(.)\]\s+([0-9A-F]+)/);
      if (analogMatch) {
        console.log('DEBUG: Regex MATCHED for', analogMatch[1]);
        const port = parseInt(analogMatch[1]);
        const engine = analogMatch[2] === 'Port' ? 'P' : 'S';
        const fieldName = analogMatch[3].trim();
        const xValue = analogMatch[4]; // e.g., "-0708" or "+3781"
        const yValue = analogMatch[5]; // e.g., "+008" or "-013"
        const zValue = analogMatch[6]; // e.g., "0" or "@"
        const hexValue = analogMatch[7]; // e.g., "0000" or "FFFF"
        const senderCurrentMatch = line.match(/Sndr_Curr\s*\((\w+)\)/);
        const senderCurrent = senderCurrentMatch ? senderCurrentMatch[1] === 'On' : null;
        
        config.analogs.push({
          port,
          engine,
          fieldName,
          xValue,
          yValue,
          zValue,
          hexValue,
          senderCurrent
        });
      } else if (line.startsWith('A') && line.includes('[')) {
        console.log('DEBUG: Regex FAILED to match analog line');
        
        // Fallback: Try old parsing logic without calibration values
        const fallbackMatch = line.match(/^A(\d)=\s+(Port|Stbd)\s+(.+?)\s+\[/);
        if (fallbackMatch) {
          console.log('DEBUG: Fallback matched, adding without calibration');
          const port = parseInt(fallbackMatch[1]);
          const engine = fallbackMatch[2] === 'Port' ? 'P' : 'S';
          const fieldName = fallbackMatch[3].trim();
          const senderCurrentMatch = line.match(/Sndr_Curr\s*\((\w+)\)/);
          const senderCurrent = senderCurrentMatch ? senderCurrentMatch[1] === 'On' : null;
          
          config.analogs.push({
            port,
            engine,
            fieldName,
            senderCurrent
          });
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

    // Parse NMEA sentences from continuous stream
    // $PNOLA sentence format: $PNOLA,A1,A2,A3,A4,A5,A6,hex1,hex2
    for (const line of lines) {
      if (line.startsWith('$PNOLA,')) {
        const parts = line.split(',');
        if (parts.length >= 7) {
          // Extract 6 analog voltage values
          for (let i = 0; i < 6; i++) {
            const value = parseFloat(parts[i + 1]);
            if (!isNaN(value)) {
              data.analogs.push({
                port: i + 1,
                value: value
              });
            }
          }
        }
      }
      
      // Parse RPM data if present
      if (line.includes('RPM')) {
        const match = line.match(/Port.*?(\d+).*?Stbd.*?(\d+)/i);
        if (match) {
          data.portRPM = parseInt(match[1]);
          data.stbdRPM = parseInt(match[2]);
        }
      }
    }

    return data;
  }
}
