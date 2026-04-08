import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultConfig = {
  subscriptions: [
    {
      path: "navigation.position",
      enabled: true,
      logInterval: 10,
      deltaThreshold: null,
      description: "GPS position"
    },
    {
      path: "navigation.speedOverGround",
      enabled: true,
      logInterval: 5,
      deltaThreshold: 0.1,
      description: "Speed over ground (knots)"
    },
    {
      path: "navigation.courseOverGroundTrue",
      enabled: true,
      logInterval: 5,
      deltaThreshold: 5,
      description: "Course over ground (radians)"
    },
    {
      path: "electrical.batteries.0.voltage",
      enabled: true,
      logInterval: 60,
      deltaThreshold: 0.5,
      description: "House battery voltage"
    },
    {
      path: "electrical.batteries.0.current",
      enabled: true,
      logInterval: 60,
      deltaThreshold: 1.0,
      description: "House battery current"
    },
    {
      path: "electrical.batteries.0.capacity.stateOfCharge",
      enabled: true,
      logInterval: 300,
      deltaThreshold: 1,
      description: "House battery state of charge (%)"
    },
    {
      path: "electrical.solar.0.voltage",
      enabled: true,
      logInterval: 60,
      deltaThreshold: 1.0,
      description: "Solar PV1 voltage"
    },
    {
      path: "electrical.solar.0.current",
      enabled: true,
      logInterval: 60,
      deltaThreshold: 0.5,
      description: "Solar PV1 current"
    },
    {
      path: "propulsion.port.temperature",
      enabled: false,
      logInterval: 10,
      deltaThreshold: 2,
      description: "Port engine temperature",
      condition: {
        path: "propulsion.port.revolutions",
        operator: ">",
        value: 0
      }
    },
    {
      path: "propulsion.port.runTime",
      enabled: false,
      logInterval: 300,
      deltaThreshold: null,
      description: "Port engine run time",
      condition: {
        path: "propulsion.port.revolutions",
        operator: ">",
        value: 0
      }
    }
  ],
  retention: {
    highResolutionDays: 30,
    downsampleAfterDays: 30,
    deleteAfterDays: 365
  }
};

const configPath = path.join(__dirname, '..', 'config.json');

if (fs.existsSync(configPath)) {
  console.log('⚠️  config.json already exists');
  const answer = await new Promise((resolve) => {
    process.stdout.write('Overwrite? (y/N): ');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim().toLowerCase());
    });
  });

  if (answer !== 'y' && answer !== 'yes') {
    console.log('Aborted');
    process.exit(0);
  }
}

fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
console.log('✓ Created config.json with default configuration');
process.exit(0);
