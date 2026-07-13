# DYX-GCS-Mobile

Expo React Native mobile application for DYX rover ground control.

## Technology

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript strict mode
- Android primary target
- iOS and Web development support
- React Context state management
- REST and Socket.IO backend communication

## Current Migration

This frontend was originally built for the legacy NRP_ROS backend.

It is being migrated to the current 4WD_SERVER backend:

`/Users/dyx_a1/Vetri/4WD_SERVER`

The current backend uses:

- PX4 OFFBOARD control
- ROS 2
- MAVROS
- RPP path tracking
- Staged mission loading
- Local operator authentication
- Continuous, Dash, and Point mission modes
- Spray controller safety gates
- RTK through NTRIP or LoRa
- Virtual Joystick V2

## Mission Modes

### Continuous

The rover follows the complete path and sprays inside marked path regions.

### Dash

The rover follows the complete path and applies a distance-based ON/OFF spray pattern.

### Point

The rover travels point by point and performs a stationary spray dwell.

Point execution supports:

- Automatic advance
- Manual operator continue

## Mission Workflow

1. Import or create a path.
2. Configure the mission and spray mode.
3. Align or place the path.
4. Plan and stage the mission.
5. Load the staged mission.
6. Start the mission.
7. Monitor telemetry and mission state.
8. Stop, abort, complete, or clear the mission.

## Backend Integration

The frontend must use the current 4WD_SERVER API and Socket.IO contracts.

Important backend areas include:

- Authentication
- Mission planning and staging
- Mission load and start
- Mission stop, abort, and clear
- Point mission controls
- Telemetry
- Spray status
- RTK status
- Joystick control
- Emergency stop

Do not reuse legacy ArduRover assumptions such as:

- AUTO/HOLD mission execution
- Pixhawk waypoint mission upload
- Direct servo PWM mission control
- Global legacy mission-mode configuration
- Time-based Dash as the current Dash implementation

## Safety Rules

- Never display success before backend confirmation.
- Keep Emergency Stop available during rover operation.
- Do not fake arm, mission, spray, RTK, or joystick state.
- Disable repeated control actions while a request is pending.
- Show backend error messages clearly.
- Treat commanded spray state and confirmed spray state separately.
- Use measured rover speed for operator display when available.
- Do not silently fall back from staged mission loading.

## Development

```bash
npm install
npx expo start --clear
```

### Type check

```bash
npx tsc --noEmit
```

### Tests

```bash
npm test
```

### Android

```bash
npm run android
```

### iOS

```bash
npm run ios
```

### Web

```bash
npm run web
```

## Important

Before implementing frontend migration, audit the actual repository structure and verify:

- Existing screens
- Context providers
- Hooks
- Services
- REST endpoints
- Socket.IO events
- Navigation
- Authentication storage
- Mission state handling
- Telemetry state handling

Do not create new architecture based only on this README.