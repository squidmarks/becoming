import { REGISTERS, MACHINE_STATES, CHARGE_STATES, FAULT_CODES } from './registers.js';

export class InverterDataParser {
  constructor(modbusClient) {
    this.client = modbusClient;
  }

  parseSystemStatus(rawData) {
    const machineState = rawData.MACHINE_STATE?.data?.[0];
    const faultCodesRaw = rawData.CURR_FCODE?.data || [];
    const activeFaultCodes = faultCodesRaw.filter(code => code !== 0);

    return {
      state: machineState,
      stateText: MACHINE_STATES[machineState] || `Unknown (${machineState})`,
      faultCodes: activeFaultCodes,
      faults: activeFaultCodes.map(code => ({
        code: code,
        text: FAULT_CODES[code] || `Unknown Fault (${code})`
      }))
    };
  }

  parseBatteryData(rawData) {
    const basicData1 = rawData.BATTERY_BASIC_1?.data;
    const basicData2 = rawData.BATTERY_BASIC_2?.data;
    const bmsData = rawData.BATTERY_BMS?.data;
    
    if (!basicData1 || !basicData2) return null;

    const baseAddrBasic1 = 0x0100;
    const baseAddrBasic2 = 0x0108;
    const baseAddrBms = 0x0112;

    return {
      soc: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.BAT_SOC.address, REGISTERS.DC_DATA.BAT_SOC),
      voltage: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.BAT_VOLT.address, REGISTERS.DC_DATA.BAT_VOLT),
      current: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.CHARGE_CURR.address, REGISTERS.DC_DATA.CHARGE_CURR),
      temperature: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.DEVICE_BAT_TEMPER.address, REGISTERS.DC_DATA.DEVICE_BAT_TEMPER),
      soh: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.BAT_SOH.address, REGISTERS.DC_DATA.BAT_SOH),
      ratedCapacity: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.BAT_RATED_CAPACITY.address, REGISTERS.DC_DATA.BAT_RATED_CAPACITY),
      remainCapacity: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.BAT_REMAIN_CAPACITY.address, REGISTERS.DC_DATA.BAT_REMAIN_CAPACITY),
      pv1: {
        voltage: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.DC_DATA.PV1_VOLT.address, REGISTERS.DC_DATA.PV1_VOLT),
        current: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.PV1_CURR.address, REGISTERS.DC_DATA.PV1_CURR),
        power: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.PV1_CHARGE_POWER.address, REGISTERS.DC_DATA.PV1_CHARGE_POWER),
      },
      pvTotalPower: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.PV_TOTAL_POWER.address, REGISTERS.DC_DATA.PV_TOTAL_POWER),
      chargeState: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.CHARGE_STATE.address, REGISTERS.DC_DATA.CHARGE_STATE),
      chargeStateText: CHARGE_STATES[basicData2[3]] || `Unknown (${basicData2[3]})`,
      cycleCount: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.BATTERY_CYCLE_COUNT.address, REGISTERS.DC_DATA.BATTERY_CYCLE_COUNT),
      chargePower: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.CHARGE_POWER.address, REGISTERS.DC_DATA.CHARGE_POWER),
      pv2: {
        voltage: this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.DC_DATA.PV2_VOLT.address, REGISTERS.DC_DATA.PV2_VOLT),
        current: basicData2 ? basicData2[2] * 0.1 : null,
        power: basicData2 ? basicData2[3] : null,
      },
      bms: bmsData ? {
        voltage: this.client.extractRegisterValue(bmsData, baseAddrBms, REGISTERS.DC_DATA.BAT_BMS_VOLT.address, REGISTERS.DC_DATA.BAT_BMS_VOLT),
        current: this.client.extractRegisterValue(bmsData, baseAddrBms, REGISTERS.DC_DATA.BAT_BMS_CURR.address, REGISTERS.DC_DATA.BAT_BMS_CURR),
        temperature: this.client.extractRegisterValue(bmsData, baseAddrBms, REGISTERS.DC_DATA.BAT_BMS_TEMP.address, REGISTERS.DC_DATA.BAT_BMS_TEMP),
        chgLimitCurr: this.client.extractRegisterValue(bmsData, baseAddrBms, REGISTERS.DC_DATA.BAT_BMS_CHG_LIMIT_CURR.address, REGISTERS.DC_DATA.BAT_BMS_CHG_LIMIT_CURR),
        dchgLimitCurr: this.client.extractRegisterValue(bmsData, baseAddrBms, REGISTERS.DC_DATA.BAT_BMS_DCHG_LIMIT_CURR.address, REGISTERS.DC_DATA.BAT_BMS_DCHG_LIMIT_CURR),
        alarmH: bmsData[6],
        alarmL: bmsData[7],
        protectH: bmsData[8],
        protectL: bmsData[9]
      } : {},
    };
  }

  parseACData(rawData) {
    const basicData1 = rawData.AC_DATA_BASIC_1?.data;
    const basicData2 = rawData.AC_DATA_BASIC_2?.data;
    const tempsData = rawData.AC_DATA_TEMPS?.data;
    const phaseBData = rawData.AC_DATA_PHASE_B?.data;
    const loadData = rawData.AC_DATA_LOAD?.data;
    
    if (!basicData1) return null;

    const baseAddrBasic1 = 0x0213;
    const baseAddrBasic2 = 0x021B;
    const baseAddrTemps = 0x0220;
    const baseAddrPhaseB = 0x022A;
    const baseAddrLoad = 0x0232;

    return {
      grid: {
        l1: {
          voltage: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.GRID_VOLT_A.address, REGISTERS.INVERTER_DATA.GRID_VOLT_A),
          current: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.GRID_CURR_A.address, REGISTERS.INVERTER_DATA.GRID_CURR_A),
          activePower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.GRID_ACTIVE_POWER_A.address, REGISTERS.INVERTER_DATA.GRID_ACTIVE_POWER_A) : null,
          apparentPower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.GRID_APPARENT_POWER_A.address, REGISTERS.INVERTER_DATA.GRID_APPARENT_POWER_A) : null,
        },
        l2: {
          voltage: phaseBData ? this.client.extractRegisterValue(phaseBData, baseAddrPhaseB, REGISTERS.INVERTER_DATA.GRID_VOLT_B.address, REGISTERS.INVERTER_DATA.GRID_VOLT_B) : null,
          current: phaseBData ? phaseBData[6] * 0.1 : null,
          activePower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.GRID_ACTIVE_POWER_B.address, REGISTERS.INVERTER_DATA.GRID_ACTIVE_POWER_B) : null,
          apparentPower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.GRID_APPARENT_POWER_B.address, REGISTERS.INVERTER_DATA.GRID_APPARENT_POWER_B) : null,
        },
        frequency: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.GRID_FREQ.address, REGISTERS.INVERTER_DATA.GRID_FREQ),
      },
      inverter: {
        l1: {
          voltage: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.INV_VOLT_A.address, REGISTERS.INVERTER_DATA.INV_VOLT_A),
          current: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.INV_CURR_A.address, REGISTERS.INVERTER_DATA.INV_CURR_A),
        },
        l2: {
          voltage: phaseBData ? this.client.extractRegisterValue(phaseBData, baseAddrPhaseB, REGISTERS.INVERTER_DATA.INV_VOLT_B.address, REGISTERS.INVERTER_DATA.INV_VOLT_B) : null,
          current: phaseBData ? this.client.extractRegisterValue(phaseBData, baseAddrPhaseB, REGISTERS.INVERTER_DATA.INV_CURR_B.address, REGISTERS.INVERTER_DATA.INV_CURR_B) : null,
        },
        frequency: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.INV_FREQ.address, REGISTERS.INVERTER_DATA.INV_FREQ),
      },
      load: {
        l1: {
          current: this.client.extractRegisterValue(basicData1, baseAddrBasic1, REGISTERS.INVERTER_DATA.LOAD_CURR_A.address, REGISTERS.INVERTER_DATA.LOAD_CURR_A),
          activePower: basicData2 ? this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.INVERTER_DATA.LOAD_ACTIVE_POWER_A.address, REGISTERS.INVERTER_DATA.LOAD_ACTIVE_POWER_A) : null,
          apparentPower: basicData2 ? this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.INVERTER_DATA.LOAD_APPARENT_POWER_A.address, REGISTERS.INVERTER_DATA.LOAD_APPARENT_POWER_A) : null,
          ratio: basicData2 ? this.client.extractRegisterValue(basicData2, baseAddrBasic2, REGISTERS.INVERTER_DATA.LOAD_RATIO_A.address, REGISTERS.INVERTER_DATA.LOAD_RATIO_A) : null,
        },
        l2: {
          current: phaseBData ? phaseBData[6] * 0.1 : null,
          activePower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.LOAD_ACTIVE_POWER_B.address, REGISTERS.INVERTER_DATA.LOAD_ACTIVE_POWER_B) : null,
          apparentPower: loadData ? this.client.extractRegisterValue(loadData, baseAddrLoad, REGISTERS.INVERTER_DATA.LOAD_REACTIVE_POWER_B.address, REGISTERS.INVERTER_DATA.LOAD_REACTIVE_POWER_B) : null,
          ratio: phaseBData ? phaseBData[6] : null,
        },
        powerFactor: basicData2 ? basicData2[7] * 0.01 : null,
      },
      temperatures: {
        dcDc: tempsData ? this.client.extractRegisterValue(tempsData, baseAddrTemps, REGISTERS.INVERTER_DATA.TEMPER_A.address, REGISTERS.INVERTER_DATA.TEMPER_A) : null,
        dcAc: tempsData ? this.client.extractRegisterValue(tempsData, baseAddrTemps, REGISTERS.INVERTER_DATA.TEMPER_B.address, REGISTERS.INVERTER_DATA.TEMPER_B) : null,
        transformer: tempsData ? this.client.extractRegisterValue(tempsData, baseAddrTemps, REGISTERS.INVERTER_DATA.TEMPER_C.address, REGISTERS.INVERTER_DATA.TEMPER_C) : null,
        ambient: tempsData ? this.client.extractRegisterValue(tempsData, baseAddrTemps, REGISTERS.INVERTER_DATA.TEMPER_D.address, REGISTERS.INVERTER_DATA.TEMPER_D) : null,
      },
      lineChargeCurrent: basicData2 ? basicData2[3] * 0.1 : null,
      busVoltage: basicData1 ? basicData1[0] * 0.1 : null,
    };
  }

  parseEnergyData(rawData) {
    const todayData = rawData.ENERGY_TODAY?.data;
    const totals1 = rawData.ENERGY_TOTALS_1?.data;
    const totals2 = rawData.ENERGY_TOTALS_2?.data;
    const totals3 = rawData.ENERGY_TOTALS_3?.data;
    const kwhToday = rawData.ENERGY_KWH_TODAY?.data;
    const kwhTotal = rawData.ENERGY_KWH_TOTAL?.data;

    if (!todayData) return null;

    const baseAddrToday = 0xF02C;
    const baseAddrTotals1 = 0xF032;
    const baseAddrTotals2 = 0xF03C;
    const baseAddrTotals3 = 0xF046;
    const baseAddrKwhToday = 0xF04D;
    const baseAddrKwhTotal = 0xF04F;

    return {
      today: {
        pvGeneration: this.client.extractRegisterValue(todayData, baseAddrToday, REGISTERS.ENERGY_STATS.GENERAT_ENERGY_TODAY.address, REGISTERS.ENERGY_STATS.GENERAT_ENERGY_TODAY),
        batteryChargeAh: this.client.extractRegisterValue(todayData, baseAddrToday, REGISTERS.ENERGY_STATS.BAT_CHG_AH_TODAY.address, REGISTERS.ENERGY_STATS.BAT_CHG_AH_TODAY),
        batteryDischargeAh: this.client.extractRegisterValue(todayData, baseAddrToday, REGISTERS.ENERGY_STATS.BAT_DISCHG_AH_TODAY.address, REGISTERS.ENERGY_STATS.BAT_DISCHG_AH_TODAY),
        loadConsumption: this.client.extractRegisterValue(todayData, baseAddrToday, REGISTERS.ENERGY_STATS.USED_ENERGY_TODAY.address, REGISTERS.ENERGY_STATS.USED_ENERGY_TODAY),
        batteryChargeKwh: kwhToday ? this.client.extractRegisterValue(kwhToday, baseAddrKwhToday, REGISTERS.ENERGY_STATS.BAT_CHG_KWH_TODAY.address, REGISTERS.ENERGY_STATS.BAT_CHG_KWH_TODAY) : null,
        batteryDischargeKwh: kwhToday ? this.client.extractRegisterValue(kwhToday, baseAddrKwhToday, REGISTERS.ENERGY_STATS.BAT_DISCHG_KWH_TODAY.address, REGISTERS.ENERGY_STATS.BAT_DISCHG_KWH_TODAY) : null,
        lineChargeAh: totals2 ? this.client.extractRegisterValue(totals2, baseAddrTotals2, REGISTERS.ENERGY_STATS.LINE_CHG_ENERGY_TDAY.address, REGISTERS.ENERGY_STATS.LINE_CHG_ENERGY_TDAY) : null,
        invWorkTime: totals2 ? this.client.extractRegisterValue(totals2, baseAddrTotals2, REGISTERS.ENERGY_STATS.INV_WORK_TIME_TODAY.address, REGISTERS.ENERGY_STATS.INV_WORK_TIME_TODAY) : null,
        lineWorkTime: totals2 ? this.client.extractRegisterValue(totals2, baseAddrTotals2, REGISTERS.ENERGY_STATS.LINE_WORK_TIME_TODAY.address, REGISTERS.ENERGY_STATS.LINE_WORK_TIME_TODAY) : null,
      },
      total: {
        workDays: totals1 && totals1[0],
        pvGeneration: totals1 ? this.client.parse32BitValue(totals1, 0) * 0.1 : null,
        batteryChargeAh: totals1 ? this.client.parse32BitValue(totals1, 2) : null,
        batteryDischargeAh: totals1 ? this.client.parse32BitValue(totals1, 4) : null,
        loadConsumption: totals1 ? this.client.parse32BitValue(totals1, 6) * 0.1 : null,
        batteryChargeKwh: kwhTotal ? this.client.parse32BitValue(kwhTotal, 0) * 0.1 : null,
        batteryDischargeKwh: kwhTotal ? this.client.parse32BitValue(kwhTotal, 2) * 0.1 : null,
        lineChargeAh: totals3 ? this.client.parse32BitValue(totals3, 0) : null,
        invWorkTime: totals3 ? totals3[4] : null,
        lineWorkTime: totals3 ? totals3[5] : null,
      }
    };
  }
}
