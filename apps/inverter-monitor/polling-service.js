import { REGISTER_GROUPS } from './registers.js';
import { InverterDataParser } from './data-parser.js';

export class PollingService {
  constructor(modbusClient, pollInterval, webServer = null, mqttPublisher = null, config = {}, modbusLock = null, powerLogger = null) {
    this.modbusClient = modbusClient;
    this.pollInterval = pollInterval;
    this.webServer = webServer;
    this.mqttPublisher = mqttPublisher;
    this.modbusLock = modbusLock;
    this.powerLogger = powerLogger;
    this.parser = new InverterDataParser(modbusClient);
    this.isRunning = false;
    this.isPolling = false;
    this.pollTimer = null;
    
    // Battery projection config
    this.batteryCapacityAh = config.BATTERY_CAPACITY_AH || 200;
    this.minBatterySoc = config.MIN_BATTERY_SOC || 20; // Fallback value
    this.dischargeCutoffSoc = null; // Will be read from inverter register 0xE00F
    this.lastCutoffRead = 0; // Timestamp of last cutoff read
    this.cutoffReadInterval = 60000; // Re-read every 60 seconds
    
    // Historical data for discharge current moving average (5 minutes = 100 samples at 3s interval)
    this.dischargeCurrentHistory = [];
    this.maxDischargeHistory = 100;
  }

  async start() {
    if (this.isRunning) {
      console.log('Polling service is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting polling service (interval: ${this.pollInterval}ms)...\n`);
    
    await this.poll();
    
    this.pollTimer = setInterval(async () => {
      if (!this.isPolling) {
        await this.poll();
      } else {
        console.warn('⚠ Skipping poll - previous cycle still in progress');
      }
    }, this.pollInterval);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
    console.log('Polling service stopped');
  }

  checkForErrors(data, context, required = false) {
    let hasAnyData = false;
    let errorCount = 0;
    
    for (const key in data) {
      if (data[key].error) {
        console.warn(`${context} - ${key}: ${data[key].error}`);
        errorCount++;
      } else if (data[key].data) {
        hasAnyData = true;
      }
    }
    
    if (required && !hasAnyData) {
      throw new Error(`${context}: Critical data unavailable (all register groups failed)`);
    }
  }

  async readDischargeCutoffSoc() {
    try {
      // Read register 0xE00F (Discharge Cutoff SoC)
      const result = await this.modbusClient.readRegisters(0xE00F, 1);
      if (result && result.length > 0) {
        this.dischargeCutoffSoc = result[0]; // Value is already in %
        console.log(`✓ Read Discharge Cutoff SoC from inverter: ${this.dischargeCutoffSoc}%`);
        return this.dischargeCutoffSoc;
      }
    } catch (error) {
      console.warn(`⚠ Failed to read Discharge Cutoff SoC register: ${error.message}`);
      // Keep using fallback value
    }
    return null;
  }

  getEffectiveCutoffSoc() {
    // Use actual configured value from inverter if available, otherwise fallback to config
    return this.dischargeCutoffSoc !== null ? this.dischargeCutoffSoc : this.minBatterySoc;
  }

  calculateBatteryProjections(soc, current) {
    const projections = {
      timeToFull: null,
      timeRemaining: null
    };
    
    // Only calculate if we have valid data
    if (soc === null || soc === undefined || current === null || current === undefined) {
      return projections;
    }
    
    // Charging projection - time to 100%
    // Negative current = charging
    if (current < -1 && soc < 98) {
      const socRemaining = 100 - soc;
      const hoursToFull = (socRemaining / 100) * this.batteryCapacityAh / Math.abs(current);
      projections.timeToFull = hoursToFull; // in hours
    }
    
    // Discharging projection - time remaining to configured cutoff SoC
    // Positive current = discharging
    const effectiveCutoff = this.getEffectiveCutoffSoc();
    if (current > 1 && soc > effectiveCutoff) {
      // Track discharge current for moving average
      this.dischargeCurrentHistory.push(current);
      if (this.dischargeCurrentHistory.length > this.maxDischargeHistory) {
        this.dischargeCurrentHistory.shift();
      }
      
      // Calculate 5-minute moving average
      const avgDischargeCurrent = this.dischargeCurrentHistory.reduce((sum, val) => sum + val, 0) 
        / this.dischargeCurrentHistory.length;
      
      const socRemaining = soc - effectiveCutoff;
      const hoursRemaining = (socRemaining / 100) * this.batteryCapacityAh / avgDischargeCurrent;
      projections.timeRemaining = hoursRemaining; // in hours
    }
    
    return projections;
  }

  async poll() {
    if (this.isPolling) {
      console.warn('⚠ Poll already in progress, skipping');
      return;
    }
    
    // Skip polling if settings are being read
    if (this.modbusLock && this.modbusLock.isLocked()) {
      console.warn('⚠ Skipping poll - settings operation in progress');
      return;
    }
    
    this.isPolling = true;
    
    // Acquire lock to prevent settings reads during polling
    if (this.modbusLock) {
      await this.modbusLock.acquire(5000);
    }
    
    try {
      // Periodically read the discharge cutoff SoC setting from inverter
      const now = Date.now();
      if (now - this.lastCutoffRead > this.cutoffReadInterval || this.dischargeCutoffSoc === null) {
        await this.readDischargeCutoffSoc();
        this.lastCutoffRead = now;
      }

      const systemStatusGroups = REGISTER_GROUPS.SYSTEM_STATUS;
      const batteryGroups = REGISTER_GROUPS.BATTERY;
      const acGroups = REGISTER_GROUPS.AC_GRID_INV_LOAD;
      const energyGroups = REGISTER_GROUPS.ENERGY;

      const systemStatusData = await this.modbusClient.readRegisterGroups(systemStatusGroups, 200);
      this.checkForErrors(systemStatusData, 'System status', true);
      
      const batteryData = await this.modbusClient.readRegisterGroups(batteryGroups, 200);
      this.checkForErrors(batteryData, 'Battery data', false);
      
      const acData = await this.modbusClient.readRegisterGroups(acGroups, 200);
      this.checkForErrors(acData, 'AC data', false);
      
      const energyData = await this.modbusClient.readRegisterGroups(energyGroups, 200);
      this.checkForErrors(energyData, 'Energy data', false);

      const systemStatus = this.parser.parseSystemStatus(systemStatusData);
      const battery = this.parser.parseBatteryData(batteryData);
      const ac = this.parser.parseACData(acData);
      const energy = this.parser.parseEnergyData(energyData);

      // Calculate battery projections
      const projections = this.calculateBatteryProjections(battery.soc, battery.current);

      const payload = {
        timestamp: new Date().toISOString(),
        inverterConnected: true,
        mqttConnected: this.mqttPublisher ? this.mqttPublisher.connected : false,
        systemStatus,
        battery: {
          ...battery,
          projections,
          dischargeCutoffSoc: this.getEffectiveCutoffSoc() // Include configured cutoff for frontend
        },
        ac,
        energy
      };

      if (this.webServer) {
        this.webServer.broadcastData(payload);
      }

      if (this.mqttPublisher) {
        this.mqttPublisher.publishInverterData(payload);
      }

      // Log power data for historical tracking
      if (this.powerLogger) {
        this.powerLogger.addSample(payload);
      }

    } catch (error) {
      console.error('Error during polling:', error.message);
      
      if (this.webServer) {
        this.webServer.broadcastData({
          timestamp: new Date().toISOString(),
          inverterConnected: false,
          mqttConnected: this.mqttPublisher ? this.mqttPublisher.connected : false,
          error: error.message
        });
      }
      
      if (error.message.includes('Timed out') || 
          error.message.includes('connection') || 
          error.message.includes('Not connected') ||
          error.message.includes('Critical data unavailable')) {
        console.log('Attempting to reconnect to inverter...');
        this.modbusClient.connected = false;
        try {
          const reconnected = await this.modbusClient.connect();
          if (reconnected) {
            console.log('✓ Reconnected to inverter');
          } else {
            console.error('Failed to reconnect, will retry on next poll cycle');
          }
        } catch (reconnectError) {
          console.error('Reconnection error:', reconnectError.message);
        }
      }
    } finally {
      // Always release lock and polling flag
      if (this.modbusLock) {
        this.modbusLock.release();
      }
      this.isPolling = false;
    }
  }
}
