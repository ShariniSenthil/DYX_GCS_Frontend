/**
 * Maps GET /api/network (NetworkTelemetryResponse) → NetworkData for GCS UI.
 */

import type { NetworkData } from '../types/telemetry';

export interface Px4WifiLink {
  interface: string;
  connected?: boolean | null;
  ssid?: string | null;
  signal_dbm?: number | null;
}

export interface Px4NetworkTelemetry {
  interfaces?: Array<{ name: string; operstate?: string | null }>;
  default_routes?: Array<{ interface?: string | null }>;
  wifi?: {
    available?: boolean;
    interfaces?: Px4WifiLink[];
  };
}

const DEFAULT: NetworkData = {
  connection_type: 'none',
  wifi_signal_strength: 0,
  wifi_rssi: -100,
  interface: '',
  wifi_connected: false,
  lora_connected: false,
};

function rssiToBars(signalDbm: number): number {
  if (signalDbm >= -50) return 4;
  if (signalDbm >= -60) return 3;
  if (signalDbm >= -70) return 2;
  if (signalDbm >= -80) return 1;
  return 0;
}

function isEthernetInterface(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.startsWith('eth') ||
    n.startsWith('en') ||
    n.startsWith('usb') ||
    (!n.startsWith('wl') && !n.startsWith('lo') && !n.startsWith('docker') && !n.startsWith('br-'))
  );
}

/**
 * Resolve the primary default-route interface name.
 * Prefers a route whose interface is known to be `operstate === 'up'`; falls back
 * to the first declared default route when operstate is unavailable.
 */
function resolveDefaultRouteInterface(
  defaultRoutes: Array<{ interface?: string | null }>,
  interfaces: Array<{ name: string; operstate?: string | null }>,
): string | undefined {
  const names = defaultRoutes
    .map((r) => r.interface)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return undefined;

  const upFirst = names.find((n) =>
    interfaces.some((i) => i.name === n && i.operstate === 'up'),
  );
  return upFirst ?? names[0];
}

export function toNetworkData(
  payload: Px4NetworkTelemetry,
  prev: NetworkData = DEFAULT,
): NetworkData {
  const wifiIfaces = payload.wifi?.interfaces ?? [];
  const interfaces = payload.interfaces ?? [];
  const defaultRouteName = resolveDefaultRouteInterface(payload.default_routes ?? [], interfaces);

  // 1) Default route is known → classify by comparing it to the Wi-Fi list.
  //    Do NOT assume wifi.interfaces[0] is the active interface.
  if (defaultRouteName) {
    const wifiOnRoute = wifiIfaces.find(
      (i) => i.interface === defaultRouteName && i.connected === true,
    );
    if (wifiOnRoute) {
      const rssi = wifiOnRoute.signal_dbm ?? -100;
      return {
        connection_type: 'wifi',
        wifi_connected: true,
        wifi_rssi: rssi,
        wifi_signal_strength: rssiToBars(rssi),
        interface: wifiOnRoute.interface,
        lora_connected: prev.lora_connected,
      };
    }

    // Default route is not a connected Wi-Fi interface → treat as wired.
    return {
      connection_type: 'ethernet',
      wifi_connected: false,
      wifi_rssi: -100,
      wifi_signal_strength: 0,
      interface: defaultRouteName,
      lora_connected: prev.lora_connected,
    };
  }

  // 2) No default-route info — fall back to any connected Wi-Fi interface.
  const connectedWifi = wifiIfaces.find((i) => i.connected === true);
  if (connectedWifi) {
    const rssi = connectedWifi.signal_dbm ?? -100;
    return {
      connection_type: 'wifi',
      wifi_connected: true,
      wifi_rssi: rssi,
      wifi_signal_strength: rssiToBars(rssi),
      interface: connectedWifi.interface,
      lora_connected: prev.lora_connected,
    };
  }

  // 3) No Wi-Fi — look for any up Ethernet interface.
  const upIface = interfaces.find(
    (i) =>
      i.operstate === 'up' &&
      isEthernetInterface(i.name) &&
      !i.name.startsWith('lo'),
  );
  if (upIface) {
    return {
      connection_type: 'ethernet',
      wifi_connected: false,
      wifi_rssi: -100,
      wifi_signal_strength: 0,
      interface: upIface.name,
      lora_connected: prev.lora_connected,
    };
  }

  return {
    ...DEFAULT,
    lora_connected: prev.lora_connected,
  };
}