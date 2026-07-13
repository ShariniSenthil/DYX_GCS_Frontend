import { toRtkUiState, rtkUiStateLabel } from '../px4RtkUiStateAdapter';
import { toNetworkData } from '../px4NetworkAdapter';
import type { RtkStatusResponse } from '../../services/rtkService';

const rtk = (over: Partial<RtkStatusResponse> = {}): RtkStatusResponse =>
  ({
    mode: 'ntrip',
    running: false,
    healthy: true,
    ...over,
  }) as RtkStatusResponse;

describe('toRtkUiState', () => {
  it('returns off when not running', () => {
    expect(toRtkUiState(rtk({ running: false }))).toBe('off');
  });

  it('returns off for null/undefined input', () => {
    expect(toRtkUiState(null)).toBe('off');
    expect(toRtkUiState(undefined)).toBe('off');
  });

  it('returns error when running but unhealthy with an error', () => {
    expect(
      toRtkUiState(rtk({ running: true, healthy: false, last_error: 'boom' })),
    ).toBe('error');
  });

  it('returns rtk_fixed for gps_fix_type >= 6', () => {
    expect(toRtkUiState(rtk({ running: true, gps_fix_type: 6 }))).toBe('rtk_fixed');
    expect(toRtkUiState(rtk({ running: true, fix_type: 7 }))).toBe('rtk_fixed');
  });

  it('returns rtk_float for gps_fix_type === 5', () => {
    expect(toRtkUiState(rtk({ running: true, gps_fix_type: 5 }))).toBe('rtk_float');
  });

  it('returns streaming when stream is healthy but no RTK fix', () => {
    expect(
      toRtkUiState(rtk({ running: true, stream_healthy: true, gps_fix_type: 4 })),
    ).toBe('streaming');
  });

  it('returns starting when running with no healthy stream yet', () => {
    expect(toRtkUiState(rtk({ running: true, stream_healthy: false }))).toBe('starting');
  });

  it('rtkUiStateLabel maps every state', () => {
    expect(rtkUiStateLabel('rtk_fixed')).toBe('RTK Fixed');
    expect(rtkUiStateLabel(undefined)).toBe('Off');
  });
});

describe('toNetworkData (default-route comparison)', () => {
  it('prefers the Wi-Fi interface that matches the default route', () => {
    const out = toNetworkData({
      default_routes: [{ interface: 'wlan1' }],
      interfaces: [
        { name: 'wlan0', operstate: 'up' },
        { name: 'wlan1', operstate: 'up' },
      ],
      wifi: {
        available: true,
        interfaces: [
          { interface: 'wlan0', connected: true, signal_dbm: -45 },
          { interface: 'wlan1', connected: true, signal_dbm: -67 },
        ],
      },
    });
    // wlan1 is the default route — must NOT pick wlan0 (the first connected).
    expect(out.connection_type).toBe('wifi');
    expect(out.interface).toBe('wlan1');
    expect(out.wifi_rssi).toBe(-67);
  });

  it('classifies a non-Wi-Fi default route as ethernet', () => {
    const out = toNetworkData({
      default_routes: [{ interface: 'eth0' }],
      interfaces: [
        { name: 'eth0', operstate: 'up' },
        { name: 'wlan0', operstate: 'up' },
      ],
      wifi: {
        available: true,
        interfaces: [{ interface: 'wlan0', connected: true, signal_dbm: -50 }],
      },
    });
    // Default route is eth0 — must not report Wi-Fi even though wlan0 is connected.
    expect(out.connection_type).toBe('ethernet');
    expect(out.wifi_connected).toBe(false);
    expect(out.interface).toBe('eth0');
  });

  it('falls back to any connected Wi-Fi when no default route is reported', () => {
    const out = toNetworkData({
      interfaces: [{ name: 'wlan0', operstate: 'up' }],
      wifi: {
        available: true,
        interfaces: [{ interface: 'wlan0', connected: true, signal_dbm: -55 }],
      },
    });
    expect(out.connection_type).toBe('wifi');
    expect(out.wifi_signal_strength).toBe(3);
  });

  it('reports none when nothing is connected', () => {
    const out = toNetworkData({
      interfaces: [{ name: 'lo', operstate: 'up' }],
      wifi: { available: false, interfaces: [] },
    });
    expect(out.connection_type).toBe('none');
  });

  it('preserves previous lora_connected flag', () => {
    const out = toNetworkData(
      {
        default_routes: [{ interface: 'wlan0' }],
        interfaces: [{ name: 'wlan0', operstate: 'up' }],
        wifi: { available: true, interfaces: [{ interface: 'wlan0', connected: true, signal_dbm: -40 }] },
      },
      { ...({} as any), lora_connected: true },
    );
    expect(out.lora_connected).toBe(true);
  });
});
