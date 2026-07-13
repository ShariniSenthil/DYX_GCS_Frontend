/**
 * Robot Settings Type Definitions
 *
 * Universal param configuration — no robot type toggle.
 * Each category has a list of ArduRover params with full metadata
 * (min, max, increment, type, enum values, units, description).
 *
 * The UI reads current values from rover via getParam(),
 * shows them alongside DYX defaults, and writes changes via setParam().
 */

export type ConfigCategory = 'GPS_CONFIG' | 'SERIAL_CONFIG' | 'MOTOR_DRIVE' | 'WP_NAVIGATION';

/**
 * Individual parameter definition with full metadata
 */
export interface ParamDef {
  name: string;
  defaultValue: number;       // DYX recommended default
  unit: string;
  description: string;
  min: number;
  max: number;
  increment: number;          // Step size for increment/decrement
  paramType: 'FLOAT' | 'INT'; // Determines keyboard & rounding
  enumValues?: Record<number, string>; // For enum-type params (GPS_TYPE, SERIAL1_PROTOCOL, etc.)
  rebootRequired?: boolean;   // If true, show reboot warning after change
}

/**
 * Category metadata for UI display
 */
export interface CategoryInfo {
  id: ConfigCategory;
  title: string;
  subtitle: string;
  iconName: string;
  params: ParamDef[];
}

/**
 * All 4 category definitions with full param metadata
 *
 * Sources:
 * - ArduRover 4.5.6 firmware (AP_GPS, AP_SerialManager, AR_Motors, AR_WPNav)
 * - RESEARCH_param_metadata.md (exact defaults, min/max from C++ source)
 * - DYX field-tested values as defaults
 */
export const CATEGORIES: Record<ConfigCategory, CategoryInfo> = {
  GPS_CONFIG: {
    id: 'GPS_CONFIG',
    title: 'GPS Config',
    subtitle: 'Antenna offsets, GPS type, update rate',
    iconName: 'locate-outline',
    params: [
      {
        name: 'GPS_TYPE',
        defaultValue: 26,
        unit: '',
        description: 'GPS type (driver)',
        min: 0,
        max: 26,
        increment: 1,
        paramType: 'INT',
        rebootRequired: true,
        enumValues: {
          0: 'None',
          1: 'AUTO',
          2: 'uBlox',
          5: 'NMEA',
          9: 'DroneCAN',
          10: 'SBF',
          14: 'MAV',
          24: 'UnicoreNMEA',
          25: 'UnicoreMB-NMEA',
          26: 'SBF-DualAntenna',
        },
      },
      {
        name: 'GPS_RATE_MS',
        defaultValue: 100,
        unit: 'ms',
        description: 'GPS update rate',
        min: 50,
        max: 200,
        increment: 50,
        paramType: 'INT',
        enumValues: {
          100: '10 Hz',
          125: '8 Hz',
          200: '5 Hz',
        },
      },
      {
        name: 'GPS_INJECT_TO',
        defaultValue: 127,
        unit: '',
        description: 'RTK inject destination',
        min: 0,
        max: 127,
        increment: 1,
        paramType: 'INT',
        enumValues: {
          0: '1st GPS only',
          1: '2nd GPS only',
          127: 'All GPSes',
        },
      },
      {
        name: 'GPS_POS1_X',
        defaultValue: 0.05,
        unit: 'm',
        description: 'Antenna X offset (fwd +)',
        min: -5,
        max: 5,
        increment: 0.01,
        paramType: 'FLOAT',
      },
      {
        name: 'GPS_POS1_Z',
        defaultValue: -0.3,
        unit: 'm',
        description: 'Antenna Z offset (down +)',
        min: -5,
        max: 5,
        increment: 0.01,
        paramType: 'FLOAT',
      },
      {
        name: 'GPS_MB1_OFS_X',
        defaultValue: -0.73,
        unit: 'm',
        description: 'Moving base X offset',
        min: -5,
        max: 5,
        increment: 0.01,
        paramType: 'FLOAT',
      },
    ],
  },

  SERIAL_CONFIG: {
    id: 'SERIAL_CONFIG',
    title: 'Serial Config',
    subtitle: 'Baud rate, protocol selection',
    iconName: 'swap-horizontal-outline',
    params: [
      {
        name: 'SERIAL1_BAUD',
        defaultValue: 115,
        unit: 'kbaud',
        description: 'Telem1 baud rate',
        min: 1,
        max: 2000,
        increment: 1,
        paramType: 'INT',
        rebootRequired: true,
        enumValues: {
          9: '9600',
          19: '19200',
          38: '38400',
          57: '57600',
          111: '111100',
          115: '115200',
          230: '230400',
          460: '460800',
          921: '921600',
        },
      },
      {
        name: 'SERIAL1_PROTOCOL',
        defaultValue: 5,
        unit: '',
        description: 'Telem1 protocol',
        min: -1,
        max: 46,
        increment: 1,
        paramType: 'INT',
        rebootRequired: true,
        enumValues: {
          '-1': 'None',
          1: 'MAVLink1',
          2: 'MAVLink2',
          5: 'GPS',
          10: 'FrSky Passthru',
          28: 'Scripting',
        },
      },
    ],
  },

  MOTOR_DRIVE: {
    id: 'MOTOR_DRIVE',
    title: 'Motor Drive',
    subtitle: 'Throttle, turn radius, acceleration',
    iconName: 'speedometer-outline',
    params: [
      {
        name: 'MOT_THR_MIN',
        defaultValue: 0,
        unit: '%',
        description: 'Throttle minimum',
        min: 0,
        max: 20,
        increment: 1,
        paramType: 'INT',
      },
      {
        name: 'TURN_RADIUS',
        defaultValue: 0.9,
        unit: 'm',
        description: 'Turn radius at low speed',
        min: 0,
        max: 10,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'ATC_TURN_MAX_G',
        defaultValue: 0.3,
        unit: 'G',
        description: 'Max lateral acceleration',
        min: 0.1,
        max: 10,
        increment: 0.01,
        paramType: 'FLOAT',
      },
      {
        name: 'ACRO_TURN_RATE',
        defaultValue: 90,
        unit: 'deg/s',
        description: 'Acro mode turn rate',
        min: 0,
        max: 360,
        increment: 1,
        paramType: 'FLOAT',
      },
      {
        name: 'ATC_ACCEL_MAX',
        defaultValue: 1,
        unit: 'm/s²',
        description: 'Max acceleration',
        min: 0,
        max: 10,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'ATC_DECEL_MAX',
        defaultValue: 0.5,
        unit: 'm/s²',
        description: 'Max deceleration (0=use accel)',
        min: 0,
        max: 10,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'PSC_POS_P',
        defaultValue: 0.3,
        unit: '',
        description: 'Position P gain',
        min: 0.1,
        max: 2.0,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'PSC_VEL_P',
        defaultValue: 1.3,
        unit: '',
        description: 'Velocity P gain',
        min: 0.1,
        max: 6.0,
        increment: 0.1,
        paramType: 'FLOAT',
      },
    ],
  },

  WP_NAVIGATION: {
    id: 'WP_NAVIGATION',
    title: 'WP Navigation',
    subtitle: 'Speed, radius, pivot turn settings',
    iconName: 'navigate-outline',
    params: [
      {
        name: 'WP_SPEED',
        defaultValue: 1,
        unit: 'm/s',
        description: 'Waypoint speed',
        min: 0,
        max: 100,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'WP_RADIUS',
        defaultValue: 0.03,
        unit: 'm',
        description: 'Waypoint acceptance radius',
        min: 0,
        max: 100,
        increment: 0.01,
        paramType: 'FLOAT',
      },
      {
        name: 'WP_ACCEL',
        defaultValue: 1,
        unit: 'm/s²',
        description: 'WP acceleration (0=use ATC)',
        min: 0,
        max: 100,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'WP_JERK',
        defaultValue: 0.5,
        unit: 'm/s³',
        description: 'WP jerk (0=use accel)',
        min: 0,
        max: 100,
        increment: 0.1,
        paramType: 'FLOAT',
      },
      {
        name: 'WP_PIVOT_ANGLE',
        defaultValue: 60,
        unit: 'deg',
        description: 'Pivot turn angle threshold',
        min: 0,
        max: 360,
        increment: 1,
        paramType: 'INT',
      },
      {
        name: 'WP_PIVOT_RATE',
        defaultValue: 60,
        unit: 'deg/s',
        description: 'Pivot turn rate',
        min: 0,
        max: 360,
        increment: 1,
        paramType: 'INT',
      },
    ],
  },
};

/**
 * Get all category IDs
 */
export function getAllCategories(): ConfigCategory[] {
  return Object.keys(CATEGORIES) as ConfigCategory[];
}

/**
 * Get flat list of all param names across all categories
 */
export function getAllParamNames(): string[] {
  return Object.values(CATEGORIES).flatMap(c => c.params.map(p => p.name));
}
