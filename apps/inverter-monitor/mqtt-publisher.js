import mqtt from 'mqtt';

export class MqttPublisher {
  constructor(host, port, options = {}) {
    this.host = host;
    this.port = port;
    this.options = options;
    this.client = null;
    this.connected = false;
    this.baseTopic = options.baseTopic || 'vessels/self';
  }

  toKelvin(celsius) {
    if (celsius === null || celsius === undefined) return null;
    return Math.round((celsius + 273.15) * 100) / 100;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const url = `mqtt://${this.host}:${this.port}`;
      
      console.log(`Connecting to MQTT broker at ${url}...`);
      
      this.client = mqtt.connect(url, {
        clientId: 'sungold-inverter',
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        ...this.options
      });

      this.client.on('connect', () => {
        const wasConnected = this.connected;
        this.connected = true;
        if (!wasConnected) {
          console.log('✓ Connected to MQTT broker');
          resolve(true);
        } else {
          console.log('✓ MQTT reconnected successfully');
        }
      });

      this.client.on('error', (error) => {
        console.error('MQTT connection error:', error.message);
        if (!this.connected) {
          reject(error);
        }
      });

      this.client.on('reconnect', () => {
        console.log('Reconnecting to MQTT broker...');
        this.connected = false;
      });

      this.client.on('offline', () => {
        console.log('MQTT client offline');
        this.connected = false;
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('MQTT connection timeout'));
        }
      }, 10000);
    });
  }

  async disconnect() {
    if (this.client) {
      return new Promise((resolve) => {
        this.client.end(false, {}, () => {
          console.log('Disconnected from MQTT broker');
          this.connected = false;
          resolve();
        });
      });
    }
  }

  publish(skPath, value, options = {}) {
    if (!this.connected || !this.client) {
      return;
    }

    if (value === null || value === undefined) {
      return;
    }

    const topic = `${this.baseTopic}/${skPath.replace(/\./g, '/')}`;
    let message;
    
    if (typeof value === 'object') {
      message = JSON.stringify(value);
    } else if (typeof value === 'number') {
      message = String(value);
    } else {
      message = String(value);
    }

    this.client.publish(topic, message, {
      qos: options.qos || 0,
      retain: options.retain || true
    }, (error) => {
      if (error) {
        console.error(`Error publishing to ${topic}:`, error.message);
      }
    });
  }

  mapInverterMode(stateText) {
    if (!stateText) return 'unknown';
    
    const lower = stateText.toLowerCase();
    if (lower.includes('inverter operation')) return 'inverting';
    if (lower.includes('standby')) return 'standby';
    if (lower.includes('fault')) return 'faulted';
    if (lower.includes('bypass') || lower.includes('ac power')) return 'idle';
    if (lower.includes('shutdown')) return 'disabled';
    return 'other';
  }

  publishInverterData(data) {
    if (!this.connected) {
      return;
    }

    if (data.systemStatus) {
      const mode = this.mapInverterMode(data.systemStatus.stateText);
      this.publish('electrical.inverters.0.mode', mode);
      this.publish('electrical.inverters.0.modeText', data.systemStatus.stateText);
      this.publish('electrical.inverters.0.state', data.systemStatus.state);
      
      // Publish state duration (time in current state)
      if (data.systemStatus.stateElapsed) {
        this.publish('electrical.inverters.0.stateDuration', data.systemStatus.stateElapsed.totalMinutes * 60); // Convert to seconds for SignalK
      }
      
      if (data.systemStatus.faultCodes && data.systemStatus.faultCodes.length > 0) {
        data.systemStatus.faultCodes.forEach((code, index) => {
          this.publish(`electrical.inverters.0.faultCode${index}`, code);
        });
      }
    }

    if (data.battery) {
      const b = data.battery;
      
      this.publish('electrical.batteries.0.capacity.stateOfCharge', b.soc !== null ? b.soc / 100 : null);
      this.publish('electrical.batteries.0.voltage', b.voltage);
      this.publish('electrical.batteries.0.current', b.current);
      this.publish('electrical.batteries.0.temperature', this.toKelvin(b.temperature));
      this.publish('electrical.batteries.0.chargingPower', b.chargePower);
      this.publish('electrical.batteries.0.chargeState', b.chargeState);

      if (b.pv1) {
        this.publish('electrical.solar.0.panelVoltage', b.pv1.voltage);
        this.publish('electrical.solar.0.panelCurrent', b.pv1.current);
        this.publish('electrical.solar.0.chargingPower', b.pv1.power);
      }

      if (b.pv2) {
        this.publish('electrical.solar.1.panelVoltage', b.pv2.voltage);
        this.publish('electrical.solar.1.panelCurrent', b.pv2.current);
        this.publish('electrical.solar.1.chargingPower', b.pv2.power);
      }

      if (b.bms) {
        this.publish('electrical.batteries.0.bms.voltage', b.bms.voltage);
        this.publish('electrical.batteries.0.bms.current', b.bms.current);
        this.publish('electrical.batteries.0.bms.soc', b.bms.soc !== null ? b.bms.soc / 100 : null);
        this.publish('electrical.batteries.0.bms.temperature', this.toKelvin(b.bms.temperature));
      }
      
      // Publish battery projections
      if (b.projections) {
        this.publish('electrical.batteries.0.capacity.timeToFull', b.projections.timeToFull !== null ? b.projections.timeToFull * 3600 : null);
        this.publish('electrical.batteries.0.capacity.timeRemaining', b.projections.timeRemaining !== null ? b.projections.timeRemaining * 3600 : null);
      }
    }

    if (data.ac) {
      if (data.ac.grid) {
        this.publish('electrical.inverters.0.acin.frequency', data.ac.grid.frequency);
        
        if (data.ac.grid.l1) {
          this.publish('electrical.inverters.0.acin.voltageL1', data.ac.grid.l1.voltage);
          this.publish('electrical.inverters.0.acin.currentL1', data.ac.grid.l1.current);
          this.publish('electrical.inverters.0.acin.activePowerL1', data.ac.grid.l1.activePower);
          this.publish('electrical.inverters.0.acin.apparentPowerL1', data.ac.grid.l1.apparentPower);
        }

        if (data.ac.grid.l2) {
          this.publish('electrical.inverters.0.acin.voltageL2', data.ac.grid.l2.voltage);
          this.publish('electrical.inverters.0.acin.currentL2', data.ac.grid.l2.current);
          this.publish('electrical.inverters.0.acin.activePowerL2', data.ac.grid.l2.activePower);
          this.publish('electrical.inverters.0.acin.apparentPowerL2', data.ac.grid.l2.apparentPower);
        }

        const totalGridPower = (data.ac.grid.l1?.activePower || 0) + (data.ac.grid.l2?.activePower || 0);
        this.publish('electrical.inverters.0.acin.activePowerTotal', totalGridPower);
      }

      if (data.ac.inverter) {
        this.publish('electrical.inverters.0.acout.frequency', data.ac.inverter.frequency);
        
        if (data.ac.inverter.l1) {
          this.publish('electrical.inverters.0.acout.voltageL1', data.ac.inverter.l1.voltage);
          this.publish('electrical.inverters.0.acout.currentL1', data.ac.inverter.l1.current);
        }

        if (data.ac.inverter.l2) {
          this.publish('electrical.inverters.0.acout.voltageL2', data.ac.inverter.l2.voltage);
          this.publish('electrical.inverters.0.acout.currentL2', data.ac.inverter.l2.current);
        }
      }

      if (data.ac.load) {
        if (data.ac.load.l1) {
          this.publish('electrical.inverters.0.acout.loadCurrentL1', data.ac.load.l1.current);
          this.publish('electrical.inverters.0.acout.loadPowerL1', data.ac.load.l1.activePower);
          this.publish('electrical.inverters.0.acout.loadApparentPowerL1', data.ac.load.l1.apparentPower);
          this.publish('electrical.inverters.0.acout.loadRatioL1', data.ac.load.l1.ratio);
        }

        if (data.ac.load.l2) {
          this.publish('electrical.inverters.0.acout.loadCurrentL2', data.ac.load.l2.current);
          this.publish('electrical.inverters.0.acout.loadPowerL2', data.ac.load.l2.activePower);
          this.publish('electrical.inverters.0.acout.loadApparentPowerL2', data.ac.load.l2.apparentPower);
          this.publish('electrical.inverters.0.acout.loadRatioL2', data.ac.load.l2.ratio);
        }

        const totalLoadPower = (data.ac.load.l1?.activePower || 0) + (data.ac.load.l2?.activePower || 0);
        this.publish('electrical.inverters.0.acout.loadPowerTotal', totalLoadPower);
      }

      if (data.ac.temperatures) {
        this.publish('electrical.inverters.0.temperature.dcdc', this.toKelvin(data.ac.temperatures.dcDc));
        this.publish('electrical.inverters.0.temperature.dcac', this.toKelvin(data.ac.temperatures.dcAc));
        this.publish('electrical.inverters.0.temperature.transformer', this.toKelvin(data.ac.temperatures.transformer));
        this.publish('electrical.inverters.0.temperature.ambient', this.toKelvin(data.ac.temperatures.ambient));
      }
    }

    if (data.energy) {
      if (data.energy.today) {
        this.publish('electrical.solar.0.energyTodayKwh', data.energy.today.pvGeneration);
        this.publish('electrical.inverters.0.loadEnergyTodayKwh', data.energy.today.loadConsumption);
        this.publish('electrical.batteries.0.capacity.chargeAhToday', data.energy.today.batteryChargeAh);
        this.publish('electrical.batteries.0.capacity.dischargeAhToday', data.energy.today.batteryDischargeAh);
      }

      if (data.energy.total) {
        this.publish('electrical.inverters.0.workDaysTotal', data.energy.total.workDays);
        this.publish('electrical.solar.0.energyTotalKwh', data.energy.total.pvGeneration);
      }
    }
  }
}
