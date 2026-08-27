import { toRtkUiState, rtkUiStateLabel } from '../px4RtkUiStateAdapter';
import { toNetworkData } from '../px4NetworkAdapter';
import type { RtkStatusResponse } from '../../types/rtk';

const rtk = (
  over: {
    manager?: RtkStatusResponse['status']['runtime']['manager'] extends infer M
      ? M extends { state: infer S }
        ? S
        : never
      : never;
    desired?: 'STOPPED' | 'RUNNING';
    healthy?: boolean;
    fixType?: number;
  } = {},
): RtkStatusResponse => ({
  status: {
    persisted: {
      active_profile_id: 1,
      desired_state: over.desired ?? (over.manager && over.manager !== 'STOPPED' ? 'RUNNING' : 'STOPPED'),
      revision: 1,
      updated_at_epoch: 1,
    },
    active_profile: null,
    runtime: {
      supervisor: {
        running: true,
        shutdown_requested: false,
        mavros_ready: true,
        last_error_code: null,
      },
      manager: {
        desired_state: over.desired ?? 'RUNNING',
        state: over.manager ?? 'STOPPED',
        mavros_ready: true,
        active_run_id: null,
        child_started: false,
        child_ready: false,
        next_restart_at_monotonic_sec: null,
        consecutive_failures: 0,
        restart_count_in_window: 0,
        error_reason: over.manager === 'ERROR' ? 'AUTH_FAILED' : null,
      },
      process: null,
      last_worker_status: null,
      last_process_returncode: null,
      last_protocol_fault_run_id: null,
    },
    correction_stream: {
      state: over.healthy ? 'HEALTHY' : 'UNHEALTHY',
      connected: Boolean(over.healthy),
      healthy: Boolean(over.healthy),
      correction_age_sec: over.healthy ? 0.2 : null,
      socket_bytes_received: 0,
      valid_frames: 0,
      published_frames: 0,
      crc_failures: 0,
      invalid_headers: 0,
      resync_bytes_discarded: 0,
      partial_frame_timeouts: 0,
      oversize_drops: 0,
      publish_errors: 0,
      mavros_ready: true,
      mavros_rtcm_subscribers: 0,
      worker_mavros_subscribers: -1,
      max_mavros_rtcm_frame_bytes: 720,
      gga: {
        enabled: false,
        state: 'DISABLED',
        source_age_sec: null,
        last_sent_age_sec: null,
        sent_total: 0,
        send_errors: 0,
      },
    },
    gnss_solution: {
      fix_type: over.fixType ?? 0,
      fix_name: 'NO_GPS',
      rtk_float: over.fixType === 5,
      rtk_fixed: over.fixType === 6,
      satellites_visible: 0,
      horizontal_accuracy_m: null,
      vertical_accuracy_m: null,
      hdop: null,
      vdop: null,
    },
  },
});

describe('toRtkUiState', () => {
  it('returns off when not running', () => {
    expect(toRtkUiState(rtk({ manager: 'STOPPED', desired: 'STOPPED' }))).toBe('off');
  });

  it('returns off for null/undefined input', () => {
    expect(toRtkUiState(null)).toBe('off');
    expect(toRtkUiState(undefined)).toBe('off');
  });

  it('returns error when running but unhealthy', () => {
    expect(
      toRtkUiState(rtk({ manager: 'RUNNING', desired: 'RUNNING', healthy: false, fixType: 6 })),
    ).toBe('error');
  });

  it('returns rtk_fixed only for healthy corrections + fix 6', () => {
    expect(
      toRtkUiState(rtk({ manager: 'RUNNING', desired: 'RUNNING', healthy: true, fixType: 6 })),
    ).toBe('rtk_fixed');
    expect(
      toRtkUiState(rtk({ manager: 'RUNNING', desired: 'RUNNING', healthy: true, fixType: 3 })),
    ).not.toBe('rtk_fixed');
  });

  it('returns rtk_float for healthy corrections + fix 5', () => {
    expect(
      toRtkUiState(rtk({ manager: 'RUNNING', desired: 'RUNNING', healthy: true, fixType: 5 })),
    ).toBe('rtk_float');
  });

  it('returns streaming when stream is healthy but no RTK fix', () => {
    expect(
      toRtkUiState(rtk({ manager: 'RUNNING', desired: 'RUNNING', healthy: true, fixType: 4 })),
    ).toBe('streaming');
  });

  it('returns starting when the manager is starting', () => {
    expect(toRtkUiState(rtk({ manager: 'STARTING', desired: 'RUNNING' }))).toBe('starting');
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
