export class TerminalFormatter {
  static clearScreen() {
    console.clear();
  }

  static formatHeader(timestamp) {
    console.log('═'.repeat(80));
    console.log('  SUNGOLD INVERTER MONITOR - M/Y JEFFERSON 48');
    console.log(`  ${timestamp.toLocaleString()}`);
    console.log('═'.repeat(80));
  }

  static formatSystemStatus(status) {
    console.log('\n┌─ SYSTEM STATUS ─────────────────────────────────────────────────────────┐');
    console.log(`│ State: ${status.stateText.padEnd(30)} │`);
    
    if (status.faultCodes.length > 0) {
      console.log(`│ Fault Codes: ${status.faultCodes.join(', ').padEnd(26)} │`);
    } else {
      console.log(`│ Fault Codes: None${' '.repeat(35)} │`);
    }
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatBattery(battery) {
    if (!battery) {
      console.log('\n┌─ BATTERY ───────────────────────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    const currentDirection = battery.current > 0 ? 'Discharging' : battery.current < 0 ? 'Charging' : 'Idle';
    const absCurrentDisplay = Math.abs(battery.current || 0).toFixed(1);

    console.log('\n┌─ BATTERY ───────────────────────────────────────────────────────────────┐');
    console.log(`│ SOC: ${(battery.soc || 0).toString().padEnd(3)}%  │  Voltage: ${(battery.voltage || 0).toFixed(1).padStart(5)}V  │  Current: ${absCurrentDisplay.padStart(5)}A (${currentDirection}) │`);
    console.log(`│ Temperature: ${(battery.temperature || 0).toFixed(1).padStart(5)}°C  │  SOH: ${(battery.soh || 0).toFixed(1).padStart(5)}%    │  Cycles: ${(battery.cycleCount || 0).toString().padStart(5)}      │`);
    console.log(`│ State: ${battery.chargeStateText.padEnd(22)} │  Charge Power: ${(battery.chargePower || 0).toString().padStart(5)}W        │`);
    
    if (battery.bms.voltage) {
      console.log('│                                                                         │');
      console.log('│ BMS Data:                                                               │');
      console.log(`│   Voltage: ${(battery.bms.voltage || 0).toFixed(1).padStart(5)}V  │  Current: ${(battery.bms.current || 0).toFixed(1).padStart(6)}A  │  Temp: ${(battery.bms.temperature || 0).toFixed(1).padStart(5)}°C │`);
      console.log(`│   Charge Limit: ${(battery.bms.chgLimitCurr || 0).toFixed(1).padStart(5)}A  │  Discharge Limit: ${(battery.bms.dchgLimitCurr || 0).toFixed(1).padStart(5)}A          │`);
      
      if (battery.bms.alarmH || battery.bms.alarmL || battery.bms.protectH || battery.bms.protectL) {
        console.log(`│   Alarms: 0x${battery.bms.alarmH.toString(16).padStart(4, '0')}-0x${battery.bms.alarmL.toString(16).padStart(4, '0')}  │  Protections: 0x${battery.bms.protectH.toString(16).padStart(4, '0')}-0x${battery.bms.protectL.toString(16).padStart(4, '0')}     │`);
      }
    }
    
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatPV(battery) {
    if (!battery) return;

    const pv1Power = battery.pv1.power || 0;
    const pv2Power = battery.pv2.power || 0;
    const totalPower = battery.pvTotalPower || 0;

    console.log('\n┌─ SOLAR PV ──────────────────────────────────────────────────────────────┐');
    console.log(`│ PV1: ${(battery.pv1.voltage || 0).toFixed(1).padStart(5)}V  ${(battery.pv1.current || 0).toFixed(1).padStart(5)}A  ${pv1Power.toString().padStart(5)}W       │`);
    console.log(`│ PV2: ${(battery.pv2.voltage || 0).toFixed(1).padStart(5)}V  ${(battery.pv2.current || 0).toFixed(1).padStart(5)}A  ${pv2Power.toString().padStart(5)}W       │`);
    console.log(`│ Total Power: ${totalPower.toString().padStart(5)}W${' '.repeat(44)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatACInput(ac) {
    if (!ac) {
      console.log('\n┌─ AC INPUT (Grid/Generator) ─────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    const freq = ac.grid.frequency || 0;
    
    console.log('\n┌─ AC INPUT (Grid/Generator) ─────────────────────────────────────────────┐');
    console.log(`│ Frequency: ${freq.toFixed(2)}Hz${' '.repeat(55)} │`);
    console.log('│                                                                         │');
    console.log('│ L1: Voltage  Current   Active Power   Apparent Power                   │');
    console.log(`│     ${(ac.grid.l1.voltage || 0).toFixed(1).padStart(6)}V  ${(ac.grid.l1.current || 0).toFixed(1).padStart(6)}A  ${(ac.grid.l1.activePower || 0).toString().padStart(8)}W      ${(ac.grid.l1.apparentPower || 0).toString().padStart(8)}VA      │`);
    console.log('│                                                                         │');
    console.log('│ L2: Voltage  Current   Active Power   Apparent Power                   │');
    console.log(`│     ${(ac.grid.l2.voltage || 0).toFixed(1).padStart(6)}V  ${(ac.grid.l2.current || 0).toFixed(1).padStart(6)}A  ${(ac.grid.l2.activePower || 0).toString().padStart(8)}W      ${(ac.grid.l2.apparentPower || 0).toString().padStart(8)}VA      │`);
    console.log('│                                                                         │');
    console.log(`│ Line Charge Current: ${(ac.lineChargeCurrent || 0).toFixed(1).padStart(5)}A${' '.repeat(37)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatACOutput(ac) {
    if (!ac) {
      console.log('\n┌─ INVERTER OUTPUT ───────────────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    const freq = ac.inverter.frequency || 0;
    
    console.log('\n┌─ INVERTER OUTPUT ───────────────────────────────────────────────────────┐');
    console.log(`│ Frequency: ${freq.toFixed(2)}Hz${' '.repeat(55)} │`);
    console.log('│                                                                         │');
    console.log('│ L1: Voltage  Current                                                    │');
    console.log(`│     ${(ac.inverter.l1.voltage || 0).toFixed(1).padStart(6)}V  ${(ac.inverter.l1.current || 0).toFixed(1).padStart(6)}A${' '.repeat(42)} │`);
    console.log('│                                                                         │');
    console.log('│ L2: Voltage  Current                                                    │');
    console.log(`│     ${(ac.inverter.l2.voltage || 0).toFixed(1).padStart(6)}V  ${(ac.inverter.l2.current || 0).toFixed(1).padStart(6)}A${' '.repeat(42)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatLoad(ac) {
    if (!ac) {
      console.log('\n┌─ LOAD ──────────────────────────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    const pf = ac.load.powerFactor || 0;
    
    console.log('\n┌─ LOAD ──────────────────────────────────────────────────────────────────┐');
    console.log(`│ Power Factor: ${pf.toFixed(3)}${' '.repeat(51)} │`);
    console.log('│                                                                         │');
    console.log('│ L1: Current   Active Power   Apparent Power   Load Ratio               │');
    console.log(`│     ${(ac.load.l1.current || 0).toFixed(1).padStart(6)}A  ${(ac.load.l1.activePower || 0).toString().padStart(8)}W      ${(ac.load.l1.apparentPower || 0).toString().padStart(8)}VA      ${(ac.load.l1.ratio || 0).toString().padStart(3)}%  │`);
    console.log('│                                                                         │');
    console.log('│ L2: Current   Active Power   Apparent Power   Load Ratio               │');
    console.log(`│     ${(ac.load.l2.current || 0).toFixed(1).padStart(6)}A  ${(ac.load.l2.activePower || 0).toString().padStart(8)}W      ${(ac.load.l2.apparentPower || 0).toString().padStart(8)}VA      ${(ac.load.l2.ratio || 0).toString().padStart(3)}%  │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatTemperatures(ac) {
    if (!ac) {
      console.log('\n┌─ TEMPERATURES ──────────────────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    console.log('\n┌─ TEMPERATURES ──────────────────────────────────────────────────────────┐');
    console.log(`│ DC-DC Heatsink:  ${(ac.temperatures.dcDc || 0).toFixed(1).padStart(5)}°C${' '.repeat(40)} │`);
    console.log(`│ DC-AC Heatsink:  ${(ac.temperatures.dcAc || 0).toFixed(1).padStart(5)}°C${' '.repeat(40)} │`);
    console.log(`│ Transformer:     ${(ac.temperatures.transformer || 0).toFixed(1).padStart(5)}°C${' '.repeat(40)} │`);
    console.log(`│ Ambient:         ${(ac.temperatures.ambient || 0).toFixed(1).padStart(5)}°C${' '.repeat(40)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }

  static formatEnergy(energy) {
    if (!energy) {
      console.log('\n┌─ ENERGY STATISTICS ─────────────────────────────────────────────────────┐');
      console.log('│ No data available                                                       │');
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
      return;
    }

    console.log('\n┌─ ENERGY STATISTICS (Today) ─────────────────────────────────────────────┐');
    console.log(`│ PV Generation:       ${(energy.today.pvGeneration || 0).toFixed(1).padStart(7)} kWh${' '.repeat(33)} │`);
    console.log(`│ Battery Charged:     ${(energy.today.batteryChargeKwh || 0).toFixed(1).padStart(7)} kWh  (${(energy.today.batteryChargeAh || 0).toString().padStart(5)} Ah)${' '.repeat(13)} │`);
    console.log(`│ Battery Discharged:  ${(energy.today.batteryDischargeKwh || 0).toFixed(1).padStart(7)} kWh  (${(energy.today.batteryDischargeAh || 0).toString().padStart(5)} Ah)${' '.repeat(13)} │`);
    console.log(`│ Load Consumption:    ${(energy.today.loadConsumption || 0).toFixed(1).padStart(7)} kWh${' '.repeat(33)} │`);
    console.log(`│ Line Charge:         ${(energy.today.lineChargeAh || 0).toString().padStart(7)} Ah${' '.repeat(34)} │`);
    console.log(`│ Inverter Runtime:    ${(energy.today.invWorkTime || 0).toString().padStart(7)} min${' '.repeat(33)} │`);
    console.log(`│ Line Runtime:        ${(energy.today.lineWorkTime || 0).toString().padStart(7)} min${' '.repeat(33)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');

    if (energy.total) {
      console.log('\n┌─ ENERGY STATISTICS (Lifetime) ──────────────────────────────────────────┐');
      console.log(`│ Operating Days:      ${(energy.total.workDays || 0).toString().padStart(7)} days${' '.repeat(32)} │`);
      console.log(`│ PV Generation:       ${(energy.total.pvGeneration || 0).toFixed(1).padStart(10)} kWh${' '.repeat(30)} │`);
      console.log(`│ Battery Charged:     ${(energy.total.batteryChargeKwh || 0).toFixed(1).padStart(10)} kWh${' '.repeat(30)} │`);
      console.log(`│ Battery Discharged:  ${(energy.total.batteryDischargeKwh || 0).toFixed(1).padStart(10)} kWh${' '.repeat(30)} │`);
      console.log(`│ Load Consumption:    ${(energy.total.loadConsumption || 0).toFixed(1).padStart(10)} kWh${' '.repeat(30)} │`);
      console.log(`│ Inverter Runtime:    ${(energy.total.invWorkTime || 0).toString().padStart(10)} hours${' '.repeat(28)} │`);
      console.log(`│ Line Runtime:        ${(energy.total.lineWorkTime || 0).toString().padStart(10)} hours${' '.repeat(28)} │`);
      console.log('└─────────────────────────────────────────────────────────────────────────┘');
    }
  }

  static formatFooter(pollInterval) {
    console.log('\n' + '─'.repeat(80));
    console.log(`  Polling every ${pollInterval / 1000}s | Press Ctrl+C to exit`);
    console.log('─'.repeat(80) + '\n');
  }

  static displayData(systemStatus, battery, ac, energy, pollInterval) {
    this.clearScreen();
    this.formatHeader(new Date());
    this.formatSystemStatus(systemStatus);
    this.formatBattery(battery);
    this.formatPV(battery);
    this.formatACInput(ac);
    this.formatACOutput(ac);
    this.formatLoad(ac);
    this.formatTemperatures(ac);
    this.formatEnergy(energy);
    this.formatFooter(pollInterval);
  }

  static displayError(error) {
    console.log('\n┌─ ERROR ─────────────────────────────────────────────────────────────────┐');
    console.log(`│ ${error.message.padEnd(71)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
  }
}
