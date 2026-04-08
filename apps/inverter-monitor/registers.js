export const MACHINE_STATES = {
  0: 'Power-on',
  1: 'Standby',
  2: 'AC Power (Bypass)',
  3: 'Inverter Operation',
  4: 'AC Power (Bypass)',
  5: 'Inverter Operation',
  6: 'Inverter to AC Power',
  7: 'Switching',
  8: 'Activating',
  9: 'Shutdown',
  10: 'Fault'
};

export const CHARGE_STATES = {
  0: 'Charge Off',
  1: 'Quick Charge',
  2: 'Const Voltage Charge',
  4: 'Float Charge',
  5: 'Reserved',
  6: 'Li Battery Activate',
  8: 'Full'
};

export const FAULT_CODES = {
  0: 'No Fault',
  1: 'Battery Under-Voltage',
  2: 'Battery Overcurrent (SW)',
  3: 'Disconnected Battery',
  4: 'Battery Over-Discharge',
  5: 'Battery Overcurrent (HW)',
  6: 'Battery Overvoltage',
  7: 'Bus Overvoltage (HW)',
  8: 'Bus Overvoltage (SW)',
  9: 'PV Overvoltage',
  10: 'Boost Overcurrent (SW)',
  11: 'Boost Overcurrent (HW)',
  12: 'SPI Communication Fault',
  13: 'Bypass Overload',
  14: 'Inverter Overload',
  15: 'AC Overcurrent (HW)',
  16: 'Slave Chip OFF Request',
  17: 'Inverter Short-Circuit',
  18: 'Bus Soft-Start Failure',
  19: 'PV Heat Sink Over-Temp',
  20: 'Inverter Heat Sink Over-Temp',
  21: 'Fan Fault',
  22: 'EEPROM Fault',
  23: 'Model Setting Error',
  24: 'Bus Voltage Imbalance',
  25: 'Bus Short-Circuit',
  26: 'AC Relay Short-Circuit',
  28: 'Mains Phase Error',
  29: 'Bus Low-Voltage',
  30: 'Battery Capacity <10%',
  31: 'Battery Capacity <5%',
  32: 'Battery Low Capacity OFF',
  34: 'CAN Communication Fault',
  35: 'Parallel Address Error',
  37: 'Parallel Current Sharing Fault',
  38: 'Parallel Battery Voltage Difference',
  39: 'Parallel AC Source Inconsistent',
  40: 'Parallel HW Sync Error',
  41: 'Inverter DC Voltage Error',
  42: 'Parallel FW Version Inconsistent',
  43: 'Parallel Connection Fault',
  44: 'Serial Number Error',
  45: 'Split-Phase Setting Error',
  56: 'Low Insulation Resistance',
  57: 'Leakage Current Overload',
  58: 'BMS Communication Error',
  60: 'BMS Under-Temperature',
  61: 'BMS Over-Temperature',
  62: 'BMS Overcurrent',
  63: 'BMS Under-Voltage',
  64: 'BMS Overvoltage'
};

export const REGISTERS = {
  PRODUCT_INFO: {
    MINOR_VERSION: { address: 0x000A, length: 1, scale: 1, type: 'uint16', unit: '' },
    MACH_TYPE: { address: 0x000B, length: 1, scale: 1, type: 'uint16', unit: '' },
    SOFTWARE_VERSION: { address: 0x0014, length: 2, scale: 1, type: 'uint16', unit: '' },
    HARDWARE_VERSION: { address: 0x0016, length: 2, scale: 1, type: 'uint16', unit: '' },
    RS485_ADDR: { address: 0x001A, length: 1, scale: 1, type: 'uint16', unit: '' },
  },

  DC_DATA: {
    BAT_SOC: { address: 0x0100, length: 1, scale: 1, type: 'uint16', unit: '%' },
    BAT_VOLT: { address: 0x0101, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    CHARGE_CURR: { address: 0x0102, length: 1, scale: 0.1, type: 'int16', unit: 'A' },
    DEVICE_BAT_TEMPER: { address: 0x0103, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    BAT_SOH: { address: 0x0104, length: 1, scale: 0.1, type: 'uint16', unit: '%' },
    BAT_RATED_CAPACITY: { address: 0x0105, length: 1, scale: 0.01, type: 'uint16', unit: 'Ah' },
    BAT_REMAIN_CAPACITY: { address: 0x0106, length: 1, scale: 1, type: 'uint16', unit: 'Ah' },
    PV1_VOLT: { address: 0x0107, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    PV1_CURR: { address: 0x0108, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    PV1_CHARGE_POWER: { address: 0x0109, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    PV_TOTAL_POWER: { address: 0x010A, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    CHARGE_STATE: { address: 0x010B, length: 1, scale: 1, type: 'uint16', unit: '' },
    BATTERY_CYCLE_COUNT: { address: 0x010C, length: 1, scale: 2, type: 'uint16', unit: 'cycles' },
    CHARGE_POWER: { address: 0x010E, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    PV2_VOLT: { address: 0x010F, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    PV2_CURR: { address: 0x0110, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    PV2_CHARGE_POWER: { address: 0x0111, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    BAT_BMS_VOLT: { address: 0x0112, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    BAT_BMS_CURR: { address: 0x0113, length: 1, scale: 0.1, type: 'int16', unit: 'A' },
    BAT_BMS_TEMP: { address: 0x0114, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    BAT_BMS_CHG_LIMIT_VOLT: { address: 0x0115, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    BAT_BMS_CHG_LIMIT_CURR: { address: 0x0116, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    BAT_BMS_DCHG_LIMIT_CURR: { address: 0x0117, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    BMS_ALARM_H: { address: 0x0118, length: 1, scale: 1, type: 'uint16', unit: '' },
    BMS_ALARM_L: { address: 0x0119, length: 1, scale: 1, type: 'uint16', unit: '' },
    BMS_PROTECT_H: { address: 0x011A, length: 1, scale: 1, type: 'uint16', unit: '' },
    BMS_PROTECT_L: { address: 0x011B, length: 1, scale: 1, type: 'uint16', unit: '' },
  },

  INVERTER_DATA: {
    CURR_ERR_REG: { address: 0x0200, length: 4, scale: 1, type: 'uint16', unit: '' },
    CURR_FCODE: { address: 0x0204, length: 4, scale: 1, type: 'uint16', unit: '' },
    SYS_DATETIME: { address: 0x020C, length: 3, scale: 1, type: 'uint16', unit: '' },
    MACHINE_STATE: { address: 0x0210, length: 1, scale: 1, type: 'uint16', unit: '' },
    PRIORITY_FLAG: { address: 0x0211, length: 1, scale: 1, type: 'uint16', unit: '' },
    BUS_VOLT_SUM: { address: 0x0212, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    GRID_VOLT_A: { address: 0x0213, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    GRID_CURR_A: { address: 0x0214, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    GRID_FREQ: { address: 0x0215, length: 1, scale: 0.01, type: 'uint16', unit: 'Hz' },
    INV_VOLT_A: { address: 0x0216, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    INV_CURR_A: { address: 0x0217, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    INV_FREQ: { address: 0x0218, length: 1, scale: 0.01, type: 'uint16', unit: 'Hz' },
    LOAD_CURR_A: { address: 0x0219, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    LOAD_PF: { address: 0x021A, length: 1, scale: 0.01, type: 'int16', unit: '' },
    LOAD_ACTIVE_POWER_A: { address: 0x021B, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    LOAD_APPARENT_POWER_A: { address: 0x021C, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    LINE_CHG_CURR: { address: 0x021E, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    LOAD_RATIO_A: { address: 0x021F, length: 1, scale: 1, type: 'uint16', unit: '%' },
    TEMPER_A: { address: 0x0220, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    TEMPER_B: { address: 0x0221, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    TEMPER_C: { address: 0x0222, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    TEMPER_D: { address: 0x0223, length: 1, scale: 0.1, type: 'int16', unit: '°C' },
    IBUCK1: { address: 0x0224, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    P_BUS_VOLT: { address: 0x0228, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    N_BUS_VOLT: { address: 0x0229, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    GRID_VOLT_B: { address: 0x022A, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    GRID_VOLT_C: { address: 0x022B, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    INV_VOLT_B: { address: 0x022C, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    INV_VOLT_C: { address: 0x022D, length: 1, scale: 0.1, type: 'uint16', unit: 'V' },
    INV_CURR_B: { address: 0x022E, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    INV_CURR_C: { address: 0x022F, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    LOAD_CURR_B: { address: 0x0230, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    LOAD_CURR_C: { address: 0x0231, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    LOAD_ACTIVE_POWER_B: { address: 0x0232, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    LOAD_ACTIVE_POWER_C: { address: 0x0233, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    LOAD_REACTIVE_POWER_B: { address: 0x0234, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    LOAD_REACTIVE_POWER_C: { address: 0x0235, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    LOAD_RATIO_B: { address: 0x0236, length: 1, scale: 1, type: 'uint16', unit: '%' },
    LOAD_RATIO_C: { address: 0x0237, length: 1, scale: 1, type: 'uint16', unit: '%' },
    GRID_CURR_B: { address: 0x0238, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    GRID_CURR_C: { address: 0x0239, length: 1, scale: 0.1, type: 'uint16', unit: 'A' },
    GRID_ACTIVE_POWER_A: { address: 0x023A, length: 1, scale: 1, type: 'int16', unit: 'W' },
    GRID_ACTIVE_POWER_B: { address: 0x023B, length: 1, scale: 1, type: 'int16', unit: 'W' },
    GRID_ACTIVE_POWER_C: { address: 0x023C, length: 1, scale: 1, type: 'int16', unit: 'W' },
    GRID_APPARENT_POWER_A: { address: 0x023D, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    GRID_APPARENT_POWER_B: { address: 0x023E, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    GRID_APPARENT_POWER_C: { address: 0x023F, length: 1, scale: 1, type: 'uint16', unit: 'VA' },
    HOME_LOAD_ACTIVE_POWER_A: { address: 0x0240, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    HOME_LOAD_ACTIVE_POWER_B: { address: 0x0241, length: 1, scale: 1, type: 'uint16', unit: 'W' },
    HOME_LOAD_ACTIVE_POWER_C: { address: 0x0242, length: 1, scale: 1, type: 'uint16', unit: 'W' },
  },

  ENERGY_STATS: {
    GENERAT_ENERGY_TO_GRID_TODAY: { address: 0xF02C, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    BAT_CHG_AH_TODAY: { address: 0xF02D, length: 1, scale: 1, type: 'uint16', unit: 'Ah' },
    BAT_DISCHG_AH_TODAY: { address: 0xF02E, length: 1, scale: 1, type: 'uint16', unit: 'Ah' },
    GENERAT_ENERGY_TODAY: { address: 0xF02F, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    USED_ENERGY_TODAY: { address: 0xF030, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    WORK_DAYS_TOTAL: { address: 0xF031, length: 1, scale: 1, type: 'uint16', unit: 'days' },
    GRID_ENERGY_TOTAL: { address: 0xF032, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
    BAT_CHG_AH_TOTAL: { address: 0xF034, length: 2, scale: 1, type: 'uint32', unit: 'Ah' },
    BAT_DISCHG_AH_TOTAL: { address: 0xF036, length: 2, scale: 1, type: 'uint32', unit: 'Ah' },
    GENERAT_ENERGY_TOTAL: { address: 0xF038, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
    USED_ENERGY_TOTAL: { address: 0xF03A, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
    LINE_CHG_ENERGY_TDAY: { address: 0xF03C, length: 1, scale: 1, type: 'uint16', unit: 'Ah' },
    LOAD_CONSUM_LINE_TDAY: { address: 0xF03D, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    INV_WORK_TIME_TODAY: { address: 0xF03E, length: 1, scale: 1, type: 'uint16', unit: 'min' },
    LINE_WORK_TIME_TODAY: { address: 0xF03F, length: 1, scale: 1, type: 'uint16', unit: 'min' },
    LINE_CHG_ENERGY_TOTAL: { address: 0xF046, length: 2, scale: 1, type: 'uint32', unit: 'Ah' },
    LOAD_CONSUM_LINE_TOTAL: { address: 0xF048, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
    INV_WORK_TIME_TOTAL: { address: 0xF04A, length: 1, scale: 1, type: 'uint16', unit: 'h' },
    LINE_WORK_TIME_TOTAL: { address: 0xF04B, length: 1, scale: 1, type: 'uint16', unit: 'h' },
    BAT_CHG_KWH_TODAY: { address: 0xF04D, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    BAT_DISCHG_KWH_TODAY: { address: 0xF04E, length: 1, scale: 0.1, type: 'uint16', unit: 'kWh' },
    BAT_CHG_KWH_TOTAL: { address: 0xF04F, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
    BAT_DISCHG_KWH_TOTAL: { address: 0xF051, length: 2, scale: 0.1, type: 'uint32', unit: 'kWh' },
  }
};

export const REGISTER_GROUPS = {
  SYSTEM_STATUS: [
    { name: 'MACHINE_STATE', address: 0x0210, count: 1 },
    { name: 'CURR_FCODE', address: 0x0204, count: 4 },
  ],
  
  BATTERY: [
    { name: 'BATTERY_BASIC_1', address: 0x0100, count: 8 },
    { name: 'BATTERY_BASIC_2', address: 0x0108, count: 7 },
    { name: 'BATTERY_BMS', address: 0x0112, count: 10 },
  ],
  
  AC_GRID_INV_LOAD: [
    { name: 'AC_DATA_BASIC_1', address: 0x0213, count: 8 },
    { name: 'AC_DATA_BASIC_2', address: 0x021B, count: 5 },
    { name: 'AC_DATA_TEMPS', address: 0x0220, count: 5 },
    { name: 'AC_DATA_PHASE_B', address: 0x022A, count: 8 },
    { name: 'AC_DATA_LOAD', address: 0x0232, count: 10 },
  ],
  
  ENERGY: [
    { name: 'ENERGY_TODAY', address: 0xF02C, count: 6 },
    { name: 'ENERGY_TOTALS_1', address: 0xF032, count: 10 },
    { name: 'ENERGY_TOTALS_2', address: 0xF03C, count: 4 },
    { name: 'ENERGY_TOTALS_3', address: 0xF046, count: 6 },
    { name: 'ENERGY_KWH_TODAY', address: 0xF04D, count: 2 },
    { name: 'ENERGY_KWH_TOTAL', address: 0xF04F, count: 4 },
  ]
};

// Configuration registers (R/W) grouped by category
//
// ⚠️ IMPORTANT: After modifying these register definitions, run:
//    node sync-registers.js
// This will update the frontend (public/index.html) to match these definitions.
// Verify sync with: node verify-registers-sync.js
//
export const CONFIG_REGISTERS = {
  BASIC: [
    { id: '01', address: 0xE204, name: 'AC Output Mode', key: 'outputPriority', scale: 1, unit: '', min: 0, max: 3, description: 'Output priority mode',
      options: [
        { value: 0, label: 'UTI (Utility First)' },
        { value: 1, label: 'SBU (Solar-Battery-Utility)' },
        { value: 2, label: 'SOL (Solar First)' },
        { value: 3, label: 'SUB (Solar-Utility-Battery)' }
      ]
    },
    { id: '38', address: 0xE208, name: 'AC Output Voltage', key: 'outputVolt', scale: 0.1, unit: 'V', min: 100, max: 127, description: 'AC output voltage',
      options: [
        { value: 1000, label: '100 VAC' },
        { value: 1050, label: '105 VAC' },
        { value: 1100, label: '110 VAC' },
        { value: 1200, label: '120 VAC' },
        { value: 1270, label: '127 VAC' }
      ]
    },
    { id: '02', address: 0xE209, name: 'AC Input Frequency', key: 'outputFreq', scale: 0.01, unit: 'Hz', min: 50, max: 60, description: '50Hz or 60Hz',
      options: [
        { value: 5000, label: '50.0 Hz' },
        { value: 6000, label: '60.0 Hz' }
      ]
    },
    { id: '03', address: 0xE20B, name: 'AC Input Voltage Range', key: 'acVoltRange', scale: 1, unit: '', min: 0, max: 1, description: 'Input voltage range',
      options: [
        { value: 0, label: 'APL (Wide: 85-140V)' },
        { value: 1, label: 'UPS (Narrow: 90-140V)' }
      ]
    },
    { id: '22', address: 0xE20C, name: 'Energy-Saving Mode', key: 'powerSaving', scale: 1, unit: '', min: 0, max: 1, description: 'Auto-off below 50W',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '25', address: 0xE210, name: 'Buzzer Alarm', key: 'alarmEn', scale: 1, unit: '', min: 0, max: 1, description: 'Audible alerts',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '26', address: 0xE211, name: 'Mode Switch Prompt', key: 'alarmSrcLoss', scale: 1, unit: '', min: 0, max: 1, description: 'Beep on source change',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '27', address: 0xE212, name: 'Bypass on Overload', key: 'bypOnOL', scale: 1, unit: '', min: 0, max: 1, description: 'Auto-switch to bypass',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '23', address: 0xE20D, name: 'Overload Auto Restart', key: 'autoRestartOL', scale: 1, unit: '', min: 0, max: 1, description: 'Auto-recover after 3min',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '24', address: 0xE20E, name: 'Over-temp Auto Restart', key: 'autoRestartOT', scale: 1, unit: '', min: 0, max: 1, description: 'Auto-recover from over-temp',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '—', address: 0xE213, name: 'Record Fault History', key: 'recordFaults', scale: 1, unit: '', min: 0, max: 1, description: 'Log fault events',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '—', address: 0x020C, name: 'Inverter Clock', key: 'systemClock', scale: 1, unit: '', type: 'clock', description: 'RTC date/time', readOnly: false, special: true },
  ],
  
  BATTERY: [
    { id: '—', address: 0xE002, name: 'Battery Capacity', key: 'batCap', scale: 1, unit: 'Ah', min: 0, max: 400, description: 'From BMS', readOnly: true },
    { id: '—', address: 0xE003, name: 'System Voltage', key: 'batVoltage', scale: 1, unit: 'V', min: 12, max: 96, description: 'System voltage', readOnly: true,
      options: [
        { value: 12, label: '12V' },
        { value: 24, label: '24V' },
        { value: 36, label: '36V' },
        { value: 48, label: '48V' }
      ]
    },
    { id: '08', address: 0xE004, name: 'Battery Type', key: 'batType', scale: 1, unit: '', min: 0, max: 14, description: 'Battery chemistry',
      options: [
        { value: 0, label: 'USER (User-defined)' },
        { value: 1, label: 'SLD (Sealed Lead-Acid)' },
        { value: 2, label: 'FLD (Flooded Lead-Acid)' },
        { value: 3, label: 'GEL (Gel Lead-Acid)' },
        { value: 4, label: 'L14 (LFP 14S)' },
        { value: 5, label: 'L15 (LFP 15S)' },
        { value: 6, label: 'L16 (LFP 16S)' },
        { value: 13, label: 'N13 (Ternary 13S)' },
        { value: 14, label: 'N14 (Ternary 14S)' },
        { value: 15, label: 'NOb (No Battery)' }
      ]
    },
    { id: '32', address: 0xE215, name: 'BMS Communication', key: 'bmsComm', scale: 1, unit: '', min: 0, max: 2, description: 'BMS protocol type',
      options: [
        { value: 0, label: 'DIS (Disabled)' },
        { value: 1, label: '485 (RS485-BMS)' },
        { value: 2, label: 'CAN (CAN-BMS)' }
      ]
    },
    { id: '33', address: 0xE21B, name: 'BMS Protocol', key: 'bmsProtocol', scale: 1, unit: '', min: 0, max: 30, description: 'Manufacturer protocol',
      options: [
        { value: 0, label: 'SGP (SUNGOLDPOWER)' },
        { value: 1, label: 'PAC (PACE)' },
        { value: 2, label: 'RDA (Ruida)' },
        { value: 3, label: 'AOG (Aoguan)' },
        { value: 4, label: 'OLT (Oliter)' },
        { value: 5, label: 'HWD (Sunwoda)' },
        { value: 6, label: 'DAQ (Daqin)' },
        { value: 7, label: 'WOW (SNPOWER)' },
        { value: 8, label: 'PYL (Pylontech)' },
        { value: 9, label: 'UOL (Vilion)' }
      ]
    },
    { id: '—', address: 0xE214, name: 'Stop on BMS Error', key: 'bmsErrStop', scale: 1, unit: '', min: 0, max: 1, description: 'Halt on BMS fault',
      options: [
        { value: 0, label: 'Disabled' },
        { value: 1, label: 'Enabled' }
      ]
    },
    { id: '—', address: 0xE005, name: 'Over-Voltage Disconnect', key: 'batOverVolt', scale: 0.4, unit: 'V', min: 48, max: 62, description: 'Battery over-voltage protection' },
    { id: '14', address: 0xE00C, name: 'Under-Voltage Alarm', key: 'underVolt', scale: 0.4, unit: 'V', min: 40, max: 52, description: 'Low voltage alarm threshold' },
    { id: '12', address: 0xE00D, name: 'Over-Discharge Voltage', key: 'overDischgVolt', scale: 0.4, unit: 'V', min: 40, max: 48, description: 'Delayed load cutoff voltage' },
    { id: '15', address: 0xE00E, name: 'Discharge Limit Voltage', key: 'dischgLimit', scale: 0.4, unit: 'V', min: 40, max: 52, description: 'Immediate load cutoff voltage' },
    { id: '35', address: 0xE00B, name: 'Under-Voltage Recovery', key: 'overDischgBack', scale: 0.4, unit: 'V', min: 44, max: 54.4, description: 'Resume load after cutoff' },
    { id: '59', address: 0xE00F, name: 'Discharge Cutoff SoC', key: 'stopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Min SoC (BMS only)' },
    { id: '58', address: 0xE01E, name: 'Low SoC Alarm', key: 'socLowAlarm', scale: 1, unit: '%', min: 0, max: 100, description: 'SoC alarm (BMS only)' },
    { id: '—', address: 0xE021, name: 'Max Discharge Current', key: 'maxDischgCurr', scale: 1, unit: 'A', min: 0, max: 200, description: 'Peak discharge current' },
    { id: '13', address: 0xE010, name: 'Over-Discharge Delay', key: 'overDischgDelay', scale: 1, unit: 's', min: 0, max: 120, description: 'Delay before cutoff' },
  ],
  
  CHARGING: [
    { id: '—', address: 0xE001, name: 'PV Charge Current', key: 'pvChgCurr', scale: 0.1, unit: 'A', min: 0, max: 150, description: 'Max current from solar' },
    { id: '07', address: 0xE20A, name: 'Battery Charge Current', key: 'maxChgCurr', scale: 0.1, unit: 'A', min: 0, max: 140, description: 'Total max battery charge current' },
    { id: '28', address: 0xE205, name: 'Grid Charge Current', key: 'acChgLimit', scale: 0.1, unit: 'A', min: 0, max: 80, description: 'Max current from AC/grid' },
    { id: '06', address: 0xE20F, name: 'Battery Charge Mode', key: 'chgSourcePriority', scale: 1, unit: '', min: 0, max: 3, description: 'Charge source priority',
      options: [
        { value: 0, label: 'PV Priority (Grid charges when PV fails)' },
        { value: 1, label: 'Grid Priority (PV charges when Grid fails)' },
        { value: 2, label: 'SNU (Hybrid: PV + Grid, PV priority)' },
        { value: 3, label: 'OSO (PV Only, No Grid Charge)' }
      ]
    },
    { id: '39', address: 0xE025, name: 'Charge Limit (BMS Mode)', key: 'bmsChgMode', scale: 1, unit: '', min: 0, max: 2, description: 'Charge current limit source',
      options: [
        { value: 0, label: 'LCSET (Use Setting #07)' },
        { value: 1, label: 'LCBMS (Use BMS Max)' },
        { value: 2, label: 'LCINV (Use Inverter Logic)' }
      ]
    },
    { id: '09', address: 0xE006, name: 'Boost Charge Voltage', key: 'chgCutoffVolt', scale: 0.4, unit: 'V', min: 48, max: 58.4, description: 'Bulk charge voltage' },
    { id: '17', address: 0xE007, name: 'Equalize Voltage', key: 'equalizVolt', scale: 0.4, unit: 'V', min: 48, max: 58, description: 'Equalization voltage (lead-acid only)' },
    { id: '11', address: 0xE009, name: 'Float Voltage', key: 'floatVolt', scale: 0.4, unit: 'V', min: 48, max: 58.4, description: 'Float/maintain voltage' },
    { id: '37', address: 0xE00A, name: 'Recharge Voltage', key: 'boostBackVolt', scale: 0.4, unit: 'V', min: 44, max: 54, description: 'Resume charge when below' },
    { id: '18', address: 0xE011, name: 'Equalize Duration', key: 'equalizTime', scale: 1, unit: 'min', min: 0, max: 900, description: 'Equalization time' },
    { id: '10', address: 0xE012, name: 'Boost Charge Duration', key: 'boostTime', scale: 1, unit: 'min', min: 10, max: 900, description: 'Boost charge time' },
    { id: '20', address: 0xE013, name: 'Equalize Interval', key: 'equalizInterval', scale: 1, unit: 'days', min: 0, max: 30, description: 'Days between equalizations' },
    { id: '16', address: 0xE206, name: 'Equalize Enable', key: 'equalizEn', scale: 1, unit: '', min: 0, max: 1, description: 'Allow equalization',
      options: [
        { value: 0, label: 'DIS (Disabled)' },
        { value: 1, label: 'ENA (Enabled)' }
      ]
    },
    { id: '57', address: 0xE01C, name: 'Charge Stop Current', key: 'stopChgCurr', scale: 0.1, unit: 'A', min: 0, max: 10, description: 'End charge when below (LiFePO4)' },
    { id: '60', address: 0xE01D, name: 'Charge Cutoff SoC', key: 'stopChgSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop charging at SoC (BMS)' },
  ],
  
  SOLAR: [
    { id: '—', address: 0xE039, name: 'PV Power Priority', key: 'pvPriority', scale: 1, unit: '', min: 0, max: 2, description: 'PV power usage priority',
      options: [
        { value: 0, label: 'Charge Battery First' },
        { value: 1, label: 'Power Load First' },
        { value: 2, label: 'Balanced' }
      ]
    },
  ],
  
  SBU_MODE: [
    { id: '04', address: 0xE01B, name: 'Battery to Mains Voltage', key: 'batSwitchDcVolt', scale: 0.4, unit: 'V', min: 40, max: 52, description: 'Switch to AC when battery below' },
    { id: '05', address: 0xE022, name: 'Mains to Battery Voltage', key: 'batSwitchInvVolt', scale: 0.4, unit: 'V', min: 48, max: 60, description: 'Switch to inverter when battery above' },
    { id: '61', address: 0xE01F, name: 'Switch to Mains SoC', key: 'socSwToLine', scale: 1, unit: '%', min: 0, max: 100, description: 'Use AC when SoC below (BMS)' },
    { id: '62', address: 0xE020, name: 'Switch to Inverter SoC', key: 'socSwToBatt', scale: 1, unit: '%', min: 1, max: 100, description: 'Use inverter when SoC above (BMS)' },
  ],
  
  TIMING_CHARGE: [
    { id: '46', address: 0xE02C, name: 'Enable Timed Charge', key: 'timedChgEn', scale: 1, unit: '', min: 0, max: 1, description: 'Time-based AC charging',
      options: [
        { value: 0, label: 'DIS (Disabled)' },
        { value: 1, label: 'ENA (Enabled)' }
      ]
    },
    { id: '40', address: 0xE026, name: 'Period 1 Start', key: 'chgStart1', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM (e.g. 512=02:00)' },
    { id: '41', address: 0xE027, name: 'Period 1 End', key: 'chgEnd1', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE03B, name: 'Period 1 Stop SoC', key: 'chg1StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC reaches' },
    { id: '—', address: 0xE04A, name: 'Period 1 Max Power', key: 'chg1MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Charge power limit' },
    { id: '42', address: 0xE028, name: 'Period 2 Start', key: 'chgStart2', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '43', address: 0xE029, name: 'Period 2 End', key: 'chgEnd2', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE03C, name: 'Period 2 Stop SoC', key: 'chg2StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC reaches' },
    { id: '—', address: 0xE04B, name: 'Period 2 Max Power', key: 'chg2MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Charge power limit' },
    { id: '44', address: 0xE02A, name: 'Period 3 Start', key: 'chgStart3', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '45', address: 0xE02B, name: 'Period 3 End', key: 'chgEnd3', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE03D, name: 'Period 3 Stop SoC', key: 'chg3StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC reaches' },
    { id: '—', address: 0xE04C, name: 'Period 3 Max Power', key: 'chg3MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Charge power limit' },
    { id: '—', address: 0xE04D, name: 'Charge Source Bitmap', key: 'timedChgSrc', scale: 1, unit: '', min: 0, max: 7, description: 'Bitmap: AC/Gen per period' },
  ],
  
  TIMING_DISCHARGE: [
    { id: '53', address: 0xE033, name: 'Enable Timed Discharge', key: 'timedDischgEn', scale: 1, unit: '', min: 0, max: 1, description: 'Time-based battery discharge',
      options: [
        { value: 0, label: 'DIS (Disabled)' },
        { value: 1, label: 'ENA (Enabled)' }
      ]
    },
    { id: '47', address: 0xE02D, name: 'Period 1 Start', key: 'dischgStart1', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '48', address: 0xE02E, name: 'Period 1 End', key: 'dischgEnd1', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE03E, name: 'Period 1 Stop SoC', key: 'dischg1StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC drops to' },
    { id: '—', address: 0xE047, name: 'Period 1 Max Power', key: 'dischg1MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Discharge power limit' },
    { id: '49', address: 0xE02F, name: 'Period 2 Start', key: 'dischgStart2', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '50', address: 0xE030, name: 'Period 2 End', key: 'dischgEnd2', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE03F, name: 'Period 2 Stop SoC', key: 'dischg2StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC drops to' },
    { id: '—', address: 0xE048, name: 'Period 2 Max Power', key: 'dischg2MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Discharge power limit' },
    { id: '51', address: 0xE031, name: 'Period 3 Start', key: 'dischgStart3', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '52', address: 0xE032, name: 'Period 3 End', key: 'dischgEnd3', scale: 1, unit: '', min: 0, max: 5947, description: 'HH*256+MM' },
    { id: '—', address: 0xE040, name: 'Period 3 Stop SoC', key: 'dischg3StopSoc', scale: 1, unit: '%', min: 0, max: 100, description: 'Stop when SoC drops to' },
    { id: '—', address: 0xE049, name: 'Period 3 Max Power', key: 'dischg3MaxPwr', scale: 1, unit: 'W', min: 0, max: 12000, description: 'Discharge power limit' },
  ],
  
  GRID: [
    { id: '34', address: 0xE037, name: 'Limit Power to CT', key: 'gridMode', scale: 1, unit: '', min: 0, max: 2, description: 'Grid-tie operating mode',
      options: [
        { value: 0, label: 'DIS (Off-Grid)' },
        { value: 1, label: 'Home Load (Solar to Home)' }
      ]
    },
    { id: '56', address: 0xE038, name: 'Leakage Current Protection', key: 'leakageDetect', scale: 1, unit: '', min: 0, max: 1, description: 'Ground fault detection',
      options: [
        { value: 0, label: 'DIS (Disabled)' },
        { value: 1, label: 'ENA (Enabled)' }
      ]
    },
    { id: '67', address: 0xE21D, name: 'Power Sales Setting', key: 'maxLinePwr', scale: 1, unit: 'W', min: 0, max: 65535, description: 'Grid export limit' },
  ],
  
  GENERATOR: [
    { id: '—', address: 0xE21A, name: 'Generator Charging', key: 'genChgDisable', scale: 1, unit: '', min: 0, max: 1, description: 'Allow generator charging',
      options: [
        { value: 0, label: 'Enabled' },
        { value: 1, label: 'Disabled' }
      ]
    },
    { id: '—', address: 0xE21F, name: 'Generator Work Mode', key: 'genWorkMode', scale: 1, unit: '', min: 0, max: 1, description: 'Operation mode' },
    { id: '73', address: 0xE220, name: 'Max Charge Current by Generator', key: 'genChgCurr', scale: 0.1, unit: 'A', min: 0, max: 100, description: 'Max current from generator' },
    { id: '74', address: 0xE221, name: 'Generator Input Power', key: 'genRatePwr', scale: 1, unit: 'W', min: 0, max: 65535, description: 'Generator rated capacity' },
  ]
};
