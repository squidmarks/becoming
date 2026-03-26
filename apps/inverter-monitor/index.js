#!/usr/bin/env node

import { loadConfig } from './config.js';
import { InverterModbusClient } from './modbus-client.js';
import { PollingService } from './polling-service.js';
import { WebServer } from './web-server.js';
import { MqttPublisher } from './mqtt-publisher.js';
import { ModbusLock } from './modbus-lock.js';
import { PowerLogger } from './power-logger.js';
import { StorageManager } from './storage/index.js';

async function main() {
  const config = loadConfig();
  
  console.log('═'.repeat(80));
  console.log('  Sungold Inverter Monitor - M/Y Jefferson 48');
  console.log('═'.repeat(80));
  console.log(`\nConfiguration:`);
  console.log(`  Inverter:    ${config.INVERTER_HOST}:${config.INVERTER_PORT}`);
  console.log(`  Slave ID:    ${config.SLAVE_ID}`);
  console.log(`  Poll Rate:   ${config.POLL_INTERVAL_MS}ms`);
  console.log(`  Web Port:    ${config.WEB_PORT}`);
  console.log(`  MQTT:        ${config.MQTT_HOST}:${config.MQTT_PORT}`);
  console.log('\nInitializing...\n');

  const modbusClient = new InverterModbusClient(
    config.INVERTER_HOST,
    config.INVERTER_PORT,
    config.SLAVE_ID
  );

  const connected = await modbusClient.connect();
  
  if (!connected) {
    console.error('\n✗ Failed to connect to inverter. Please check:');
    console.error('  - Inverter is powered on');
    console.error('  - RS-485 to WiFi bridge is connected and configured');
    console.error(`  - IP address ${config.INVERTER_HOST}:${config.INVERTER_PORT} is correct`);
    console.error('  - Network connectivity from this device to the bridge');
    process.exit(1);
  }

  // Shared lock to coordinate settings reads and polling
  const modbusLock = new ModbusLock();

  // Initialize power storage and logger first (needed by webServer)
  // StorageManager will auto-select MongoDB or CSV based on MONGO_URI in .env
  const powerStorage = await StorageManager.initialize({
    mongoUri: config.MONGO_URI,
    csvLogDir: './logs',
    retentionDays: 7
  });
  const powerLogger = new PowerLogger(powerStorage, 5); // 5-minute intervals
  await powerLogger.init();

  const webServer = new WebServer(config.WEB_PORT, config, modbusClient, modbusLock, powerLogger);
  await webServer.start();

  const mqttPublisher = new MqttPublisher(config.MQTT_HOST, config.MQTT_PORT, {
    baseTopic: config.MQTT_BASE_TOPIC
  });
  
  try {
    await mqttPublisher.connect();
  } catch (error) {
    console.error('✗ Failed to connect to MQTT broker:', error.message);
    console.log('  Continuing without MQTT publishing...\n');
  }

  const pollingService = new PollingService(modbusClient, config.POLL_INTERVAL_MS, webServer, mqttPublisher, config, modbusLock, powerLogger);

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    pollingService.stop();
    await powerLogger.stop();
    webServer.stop();
    await mqttPublisher.disconnect();
    await modbusClient.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nShutting down...');
    pollingService.stop();
    await powerLogger.stop();
    webServer.stop();
    await mqttPublisher.disconnect();
    await modbusClient.disconnect();
    process.exit(0);
  });

  await pollingService.start();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
