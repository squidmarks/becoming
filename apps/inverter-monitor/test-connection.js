#!/usr/bin/env node

import { loadConfig } from './config.js';
import { InverterModbusClient } from './modbus-client.js';

async function testConnection() {
  const config = loadConfig();
  const client = new InverterModbusClient(config.INVERTER_HOST, config.INVERTER_PORT, config.SLAVE_ID);

  console.log('═'.repeat(60));
  console.log('  MODBUS CONNECTION TEST');
  console.log('═'.repeat(60));
  console.log(`\nTarget: ${config.INVERTER_HOST}:${config.INVERTER_PORT}`);
  console.log(`Slave ID: ${config.SLAVE_ID}\n`);

  try {
    console.log('Connecting to inverter...');
    const connected = await client.connect();
    if (!connected) {
      throw new Error('Connection failed');
    }
    console.log('✓ Connected successfully!\n');

    console.log('Reading test registers...\n');

    console.log('1. Machine State (0x0210):');
    const stateData = await client.readRegisters(0x0210, 1);
    const stateValues = {
      0: 'Power-on Delay', 1: 'Standby', 2: 'Initialization',
      3: 'Soft Start', 4: 'AC Power Operation (Bypass)', 5: 'Inverter Operation',
      6: 'Inverter to AC Power', 7: 'AC Power to Inverter',
      8: 'Battery Activation', 9: 'Manual Shutdown', 10: 'Fault'
    };
    console.log(`   Raw value: ${stateData[0]}`);
    console.log(`   State: ${stateValues[stateData[0]] || 'Unknown'}\n`);

    await new Promise(r => setTimeout(r, 100));

    console.log('2. Battery Status (0x0100-0x0103):');
    const batteryData = await client.readRegisters(0x0100, 4);
    const soc = batteryData[0];
    const voltage = batteryData[1] * 0.1;
    const currentRaw = batteryData[2];
    const current = currentRaw > 32767 ? (currentRaw - 65536) * 0.1 : currentRaw * 0.1;
    const tempRaw = batteryData[3];
    const temp = tempRaw > 32767 ? (tempRaw - 65536) * 0.1 : tempRaw * 0.1;
    
    console.log(`   SOC: ${soc}%`);
    console.log(`   Voltage: ${voltage.toFixed(1)}V`);
    console.log(`   Current: ${current.toFixed(1)}A ${current > 0 ? '(Discharging)' : current < 0 ? '(Charging)' : '(Idle)'}`);
    console.log(`   Temperature: ${temp.toFixed(1)}°C\n`);

    await new Promise(r => setTimeout(r, 100));

    console.log('3. AC Grid Input (0x0213-0x0215):');
    const gridData = await client.readRegisters(0x0213, 3);
    const gridVolt = gridData[0] * 0.1;
    const gridCurr = gridData[1] * 0.1;
    const gridFreq = gridData[2] * 0.01;
    
    console.log(`   L1 Voltage: ${gridVolt.toFixed(1)}V`);
    console.log(`   L1 Current: ${gridCurr.toFixed(1)}A`);
    console.log(`   Frequency: ${gridFreq.toFixed(2)}Hz\n`);

    await new Promise(r => setTimeout(r, 100));

    console.log('4. Inverter Output (0x0216-0x0218):');
    const invData = await client.readRegisters(0x0216, 3);
    const invVolt = invData[0] * 0.1;
    const invCurr = invData[1] * 0.1;
    const invFreq = invData[2] * 0.01;
    
    console.log(`   L1 Voltage: ${invVolt.toFixed(1)}V`);
    console.log(`   L1 Current: ${invCurr.toFixed(1)}A`);
    console.log(`   Frequency: ${invFreq.toFixed(2)}Hz\n`);

    await new Promise(r => setTimeout(r, 100));

    console.log('5. PV Data (0x0107-0x010A):');
    const pvData = await client.readRegisters(0x0107, 4);
    const pv1Volt = pvData[0] * 0.1;
    const pv1Curr = pvData[1] * 0.1;
    const pv1Power = pvData[2];
    const pvTotal = pvData[3];
    
    console.log(`   PV1 Voltage: ${pv1Volt.toFixed(1)}V`);
    console.log(`   PV1 Current: ${pv1Curr.toFixed(1)}A`);
    console.log(`   PV1 Power: ${pv1Power}W`);
    console.log(`   Total PV Power: ${pvTotal}W\n`);

    console.log('═'.repeat(60));
    console.log('✓ Connection test successful!');
    console.log('  All registers readable. Ready to run full application.');
    console.log('═'.repeat(60));

    await client.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Connection test failed!');
    console.error(`Error: ${error.message}\n`);
    
    console.log('Troubleshooting:');
    console.log('  1. Check inverter is powered on');
    console.log('  2. Verify RS-485 WiFi bridge is connected');
    console.log(`  3. Confirm IP ${config.INVERTER_HOST}:${config.INVERTER_PORT} is correct`);
    console.log('  4. Test network connectivity: ping ' + config.INVERTER_HOST);
    console.log('  5. Verify Slave ID is 1 (check inverter settings)\n');
    
    await client.disconnect();
    process.exit(1);
  }
}

testConnection();
