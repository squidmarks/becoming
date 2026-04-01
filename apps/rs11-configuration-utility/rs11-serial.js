/**
 * RS11 Serial Communication Handler
 * Manages serial port connection and communication with RS11 device
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { RS11Protocol } from './rs11-protocol.js';

export class RS11Serial {
  constructor() {
    this.port = null;
    this.parser = null;
    this.protocol = new RS11Protocol();
    this.connected = false;
    this.buffer = '';
  }

  // List available serial ports
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      // Filter for likely RS11 devices (USB serial adapters)
      return ports.filter(port => {
        const desc = (port.manufacturer || '').toLowerCase();
        const pnp = (port.pnpId || '').toLowerCase();
        // Common USB-Serial chip manufacturers
        return desc.includes('ftdi') || 
               desc.includes('prolific') || 
               desc.includes('ch340') ||
               desc.includes('cp210') ||
               pnp.includes('usb');
      });
    } catch (error) {
      console.error('Error listing ports:', error);
      return [];
    }
  }

  // Connect to RS11 on specified port
  async connect(portPath, baudRate = 4800) {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: portPath,
          baudRate: baudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none'
        });

        // Set up line parser (responses end with \r\n)
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        this.port.on('open', () => {
          console.log(`✓ Connected to RS11 on ${portPath}`);
          this.connected = true;
          
          // Give device a moment to initialize
          setTimeout(() => {
            resolve({ success: true, port: portPath });
          }, 500);
        });

        this.port.on('error', (err) => {
          console.error('Serial port error:', err);
          this.connected = false;
          reject(err);
        });

        this.port.on('close', () => {
          console.log('✓ Serial port closed');
          this.connected = false;
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Disconnect from device
  async disconnect() {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.connected) {
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.connected = false;
          this.port = null;
          this.parser = null;
          resolve();
        }
      });
    });
  }

  // Send command and wait for response
  async sendCommand(command, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to device'));
        return;
      }

      const responses = [];
      let responseTimeout = null;

      // Set up temporary data handler to collect responses
      const dataHandler = (line) => {
        console.log('RX:', line);
        responses.push(line);
        
        // Reset timeout on each line received
        if (responseTimeout) {
          clearTimeout(responseTimeout);
        }
        
        // For query commands, wait for more data
        if (command.includes('@?') || command.includes('@q')) {
          responseTimeout = setTimeout(() => {
            this.parser.removeListener('data', dataHandler);
            console.log(`Collected ${responses.length} response lines`);
            resolve({ responses, timeout: false });
          }, 500); // Wait 500ms after last line
        }
      };

      this.parser.on('data', dataHandler);

      // Set overall timeout
      const overallTimeout = setTimeout(() => {
        this.parser.removeListener('data', dataHandler);
        if (responseTimeout) clearTimeout(responseTimeout);
        console.log(`Command timeout after ${timeoutMs}ms, collected ${responses.length} lines`);
        resolve({ responses, timeout: true });
      }, timeoutMs);

      // Write command
      console.log('TX:', command.trim());
      this.port.write(command, (err) => {
        if (err) {
          clearTimeout(overallTimeout);
          if (responseTimeout) clearTimeout(responseTimeout);
          this.parser.removeListener('data', dataHandler);
          reject(err);
        } else {
          // For non-query commands, resolve quickly
          if (!command.includes('@?') && !command.includes('@q')) {
            setTimeout(() => {
              clearTimeout(overallTimeout);
              if (responseTimeout) clearTimeout(responseTimeout);
              this.parser.removeListener('data', dataHandler);
              resolve({ responses, timeout: false });
            }, 300);
          }
        }
      });
    });
  }

  // Query configuration
  async queryConfig() {
    const result = await this.sendCommand(this.protocol.queryConfig());
    return this.protocol.parseConfigResponse(result.responses);
  }

  // Query live values
  async queryLive() {
    const result = await this.sendCommand(this.protocol.queryLive());
    return this.protocol.parseLiveResponse(result.responses);
  }

  // Stop device
  async stopDevice() {
    return await this.sendCommand(this.protocol.stopDevice());
  }

  // Restart device
  async restartDevice() {
    return await this.sendCommand(this.protocol.restartDevice());
  }

  // Factory reset
  async factoryReset() {
    return await this.sendCommand(this.protocol.factoryReset(), 5000);
  }

  // Configuration setters
  async setEngineInstance(instance) {
    return await this.sendCommand(this.protocol.setEngineInstance(instance));
  }

  async setStartAddress(address) {
    return await this.sendCommand(this.protocol.setStartAddress(address));
  }

  async setMultiBattStartInstance(value) {
    return await this.sendCommand(this.protocol.setMultiBattStartInstance(value));
  }

  async setEngineHours(engine, hours) {
    return await this.sendCommand(this.protocol.setEngineHours(engine, hours));
  }

  async setPortPPR(ppr) {
    return await this.sendCommand(this.protocol.setPortPPR(ppr));
  }

  async setStbdPPR(ppr) {
    return await this.sendCommand(this.protocol.setStbdPPR(ppr));
  }

  async setPortPPL(ppl) {
    return await this.sendCommand(this.protocol.setPortPPL(ppl));
  }

  async setStbdPPL(ppl) {
    return await this.sendCommand(this.protocol.setStbdPPL(ppl));
  }

  async setSenderCurrent(port, enabled) {
    return await this.sendCommand(this.protocol.setSenderCurrent(port, enabled));
  }

  async setSmoothing(port, enabled) {
    return await this.sendCommand(this.protocol.setSmoothing(port, enabled));
  }

  async setAnalogField(port, engine, fieldNum) {
    return await this.sendCommand(this.protocol.setAnalogField(port, engine, fieldNum));
  }

  async setAnalogXValue(port, sign, value) {
    return await this.sendCommand(this.protocol.setAnalogXValue(port, sign, value));
  }

  async setAnalogYValue(port, sign, value) {
    return await this.sendCommand(this.protocol.setAnalogYValue(port, sign, value));
  }

  async setAlarmValue(port, value) {
    return await this.sendCommand(this.protocol.setAlarmValue(port, value));
  }

  // Get connection status
  isConnected() {
    return this.connected;
  }
}
