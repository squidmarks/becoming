import net from 'net';

export class InverterModbusClient {
  constructor(host, port, slaveId) {
    this.host = host;
    this.port = port;
    this.slaveId = slaveId;
    this.socket = null;
    this.connected = false;
    this.transactionId = 1;
  }

  calculateCRC(buffer) {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    return crc;
  }

  async connect() {
    return new Promise((resolve) => {
      try {
        // Clean up old socket if it exists
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.destroy();
          this.socket = null;
        }
        
        this.socket = new net.Socket();
        this.socket.setTimeout(10000);
        this.socket.setKeepAlive(true, 5000);
        
        this.socket.on('error', (err) => {
          console.error('✗ Socket error:', err.message);
          this.connected = false;
        });

        this.socket.on('close', () => {
          this.connected = false;
        });

        this.socket.on('timeout', () => {
          console.error('✗ Socket timeout');
          this.connected = false;
        });

        this.socket.connect({ host: this.host, port: this.port }, () => {
          this.connected = true;
          console.log(`✓ Connected to inverter at ${this.host}:${this.port} (Slave ID: ${this.slaveId})`);
          setTimeout(() => resolve(true), 200);
        });

        setTimeout(() => {
          if (!this.connected) {
            console.error('✗ Connection timeout');
            this.socket.destroy();
            resolve(false);
          }
        }, 10000);

      } catch (error) {
        console.error('✗ Failed to connect to inverter:', error.message);
        this.connected = false;
        resolve(false);
      }
    });
  }

  async disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
      console.log('✓ Disconnected from inverter');
    }
  }

  buildModbusTCPRequest(slaveId, functionCode, startAddress, quantity) {
    const buffer = Buffer.alloc(12);
    
    buffer.writeUInt16BE(this.transactionId++, 0);
    buffer.writeUInt16BE(0, 2);
    buffer.writeUInt16BE(6, 4);
    buffer.writeUInt8(slaveId, 6);
    buffer.writeUInt8(functionCode, 7);
    buffer.writeUInt16BE(startAddress, 8);
    buffer.writeUInt16BE(quantity, 10);
    
    if (this.transactionId > 65535) this.transactionId = 1;
    
    return buffer;
  }

  async readRegisters(address, count) {
    if (!this.connected) {
      throw new Error('Not connected to inverter');
    }

    return new Promise((resolve, reject) => {
      const request = this.buildModbusTCPRequest(this.slaveId, 0x03, address, count);
      
      const timeout = setTimeout(() => {
        console.error(`Modbus read timeout at register 0x${address.toString(16)}`);
        this.socket.removeListener('data', dataHandler);
        this.connected = false;
        reject(new Error(`Timeout reading registers at 0x${address.toString(16)}`));
      }, 5000);

      let responseBuffer = Buffer.alloc(0);

      const dataHandler = (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        
        if (responseBuffer.length < 9) {
          return;
        }

        const functionCode = responseBuffer[7];
        if (functionCode === 0x83) {
          clearTimeout(timeout);
          this.socket.removeListener('data', dataHandler);
          const exceptionCode = responseBuffer[8];
          reject(new Error(`Modbus exception ${exceptionCode}`));
          return;
        }

        const byteCount = responseBuffer[8];
        const expectedLength = 9 + byteCount;
        
        if (responseBuffer.length < expectedLength) {
          return;
        }

        clearTimeout(timeout);
        this.socket.removeListener('data', dataHandler);
        
        try {
          // Validate we have enough data for the requested registers
          const expectedBytes = count * 2;
          if (byteCount < expectedBytes) {
            reject(new Error(`Incomplete response: expected ${expectedBytes} bytes, got ${byteCount}`));
            return;
          }
          
          const values = [];
          for (let i = 0; i < count; i++) {
            const offset = 9 + (i * 2);
            if (offset + 1 >= responseBuffer.length) {
              reject(new Error(`Buffer overflow at register ${i}: offset ${offset} exceeds buffer length ${responseBuffer.length}`));
              return;
            }
            const value = responseBuffer.readUInt16BE(offset);
            values.push(value);
          }
          resolve(values);
        } catch (error) {
          reject(new Error(`Parse error: ${error.message}`));
        }
      };

      this.socket.on('data', dataHandler);

      this.socket.write(request, (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  async writeMultipleRegisters(startAddress, values) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to inverter');
    }

    const count = values.length;
    if (count === 0 || count > 32) {
      throw new Error(`Invalid register count: ${count} (must be 1-32)`);
    }

    return new Promise((resolve, reject) => {
      const transId = this.transactionId++;
      const byteCount = count * 2;
      
      // Modbus TCP frame for function code 10 (Write Multiple Registers)
      const request = Buffer.alloc(13 + byteCount);
      request.writeUInt16BE(transId, 0);           // Transaction ID
      request.writeUInt16BE(0, 2);                 // Protocol ID
      request.writeUInt16BE(7 + byteCount, 4);     // Length
      request.writeUInt8(this.slaveId, 6);         // Slave ID
      request.writeUInt8(0x10, 7);                 // Function code 10 (16 decimal)
      request.writeUInt16BE(startAddress, 8);      // Starting address
      request.writeUInt16BE(count, 10);            // Register count
      request.writeUInt8(byteCount, 12);           // Byte count
      
      // Write register values
      for (let i = 0; i < count; i++) {
        request.writeUInt16BE(values[i], 13 + i * 2);
      }

      let responseBuffer = Buffer.alloc(0);
      
      const timeout = setTimeout(() => {
        this.socket.removeListener('data', dataHandler);
        console.error(`Modbus write multiple timed out at address 0x${startAddress.toString(16)}`);
        reject(new Error('Timed out waiting for write multiple response'));
      }, 10000);

      const dataHandler = (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        
        // Response should be 12 bytes for function code 10
        if (responseBuffer.length >= 12) {
          clearTimeout(timeout);
          this.socket.removeListener('data', dataHandler);
          
          try {
            const responseSlaveId = responseBuffer[6];
            const responseFunctionCode = responseBuffer[7];
            
            // Check for exception response (function code + 0x80)
            if (responseFunctionCode === 0x90) {
              const exceptionCode = responseBuffer[8];
              reject(new Error(`Modbus exception ${exceptionCode} writing multiple to address 0x${startAddress.toString(16)}`));
              return;
            }
            
            if (responseSlaveId !== this.slaveId || responseFunctionCode !== 0x10) {
              reject(new Error(`Invalid response: expected slave ${this.slaveId} fc 10, got slave ${responseSlaveId} fc ${responseFunctionCode}`));
              return;
            }
            
            const responseAddress = responseBuffer.readUInt16BE(8);
            const responseCount = responseBuffer.readUInt16BE(10);
            
            if (responseAddress !== startAddress || responseCount !== count) {
              reject(new Error(`Write verification failed: expected addr=${startAddress} count=${count}, got addr=${responseAddress} count=${responseCount}`));
              return;
            }
            
            resolve({ startAddress, count, values });
          } catch (error) {
            reject(error);
          }
        }
      };

      this.socket.on('data', dataHandler);
      this.socket.write(request);
    });
  }

  async writeSingleRegister(address, value) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to inverter');
    }

    return new Promise((resolve, reject) => {
      const transId = this.transactionId++;
      
      // Modbus TCP frame for function code 06 (Write Single Register)
      const request = Buffer.alloc(12);
      request.writeUInt16BE(transId, 0);      // Transaction ID
      request.writeUInt16BE(0, 2);            // Protocol ID
      request.writeUInt16BE(6, 4);            // Length
      request.writeUInt8(this.slaveId, 6);    // Slave ID
      request.writeUInt8(0x06, 7);            // Function code 06
      request.writeUInt16BE(address, 8);      // Register address
      request.writeUInt16BE(value, 10);       // Register value

      let responseBuffer = Buffer.alloc(0);
      
      const timeout = setTimeout(() => {
        this.socket.removeListener('data', dataHandler);
        console.error(`Modbus write timed out at address 0x${address.toString(16)}`);
        reject(new Error('Timed out waiting for write response'));
      }, 10000);

      const dataHandler = (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        
        // Response should be 12 bytes for function code 06
        if (responseBuffer.length >= 12) {
          clearTimeout(timeout);
          this.socket.removeListener('data', dataHandler);
          
          try {
            const responseSlaveId = responseBuffer[6];
            const responseFunctionCode = responseBuffer[7];
            
            // Check for exception response (function code + 0x80)
            if (responseFunctionCode === 0x86) {
              const exceptionCode = responseBuffer[8];
              reject(new Error(`Modbus exception ${exceptionCode} writing to address 0x${address.toString(16)}`));
              return;
            }
            
            if (responseSlaveId !== this.slaveId || responseFunctionCode !== 0x06) {
              reject(new Error(`Invalid response: expected slave ${this.slaveId} fc 06, got slave ${responseSlaveId} fc ${responseFunctionCode}`));
              return;
            }
            
            const responseAddress = responseBuffer.readUInt16BE(8);
            const responseValue = responseBuffer.readUInt16BE(10);
            
            if (responseAddress !== address || responseValue !== value) {
              reject(new Error(`Write verification failed: expected ${address}=${value}, got ${responseAddress}=${responseValue}`));
              return;
            }
            
            resolve({ address, value });
          } catch (error) {
            reject(new Error(`Parse error: ${error.message}`));
          }
        }
      };

      this.socket.on('data', dataHandler);

      this.socket.write(request, (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  async readRegisterGroups(groups, delayMs = 100) {
    const results = {};
    
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      try {
        const data = await this.readRegisters(group.address, group.count);
        results[group.name] = {
          address: group.address,
          data: data
        };
        
        if (i < groups.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        results[group.name] = {
          address: group.address,
          error: error.message
        };
      }
    }
    
    return results;
  }

  parseValue(rawValue, type) {
    switch (type) {
      case 'int16':
        return rawValue > 32767 ? rawValue - 65536 : rawValue;
      case 'uint16':
        return rawValue;
      case 'uint32':
        return rawValue;
      default:
        return rawValue;
    }
  }

  parse32BitValue(registers, startIndex) {
    const lowWord = registers[startIndex];
    const highWord = registers[startIndex + 1];
    return (highWord << 16) | lowWord;
  }

  extractRegisterValue(registers, baseAddress, targetAddress, regDef) {
    const offset = targetAddress - baseAddress;
    
    if (offset < 0 || offset >= registers.length) {
      return null;
    }

    let rawValue;
    if (regDef.length === 2) {
      if (offset + 1 >= registers.length) {
        return null;
      }
      rawValue = this.parse32BitValue(registers, offset);
    } else {
      rawValue = registers[offset];
    }

    const parsedValue = this.parseValue(rawValue, regDef.type);
    const scaledValue = parsedValue * regDef.scale;
    
    return scaledValue;
  }
}
