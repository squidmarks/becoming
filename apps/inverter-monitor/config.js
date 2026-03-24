import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  const envPath = path.join(__dirname, '.env');
  const config = {
    INVERTER_HOST: '192.168.1.194',
    INVERTER_PORT: 8899,
    SLAVE_ID: 1,
    MQTT_HOST: 'becoming-hub',
    MQTT_PORT: 1883,
    MQTT_BASE_TOPIC: 'vessels/jefferson48/electrical/inverter',
    POLL_INTERVAL_MS: 5000,
    WEB_PORT: 3000,
    BATTERY_CAPACITY_AH: 200,
    MIN_BATTERY_SOC: 20
  };

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split('=');
        if (key && value) {
          const trimmedKey = key.trim();
          const trimmedValue = value.trim();
          
          if (trimmedKey in config) {
            if (trimmedKey.includes('PORT') || trimmedKey.includes('ID') || trimmedKey.includes('INTERVAL') || 
                trimmedKey.includes('CAPACITY') || trimmedKey.includes('SOC')) {
              config[trimmedKey] = parseInt(trimmedValue, 10);
            } else {
              config[trimmedKey] = trimmedValue;
            }
          }
        }
      }
    }
  }

  return config;
}
