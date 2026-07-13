export type LoraRTKStatusState =
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'error'
  | 'disconnected'
  | 'status_update';

export interface LoraRTKStatus {
  status?: LoraRTKStatusState;
  message?: string;
  started_at?: string;
  messages_received?: number;
  bytes_received?: number;
  error_count?: number;
  is_connected?: boolean;
  is_running?: boolean;
  connection_time?: string;
  uptime_seconds?: number;
  source_active?: boolean;
  status_message?: string;
}

// NTRIP Caster Configuration
export interface NTRIPCasterInfo {
  host: string;
  port: number;
  mountpoint: string;
  user: string;
  password: string;
}

// NTRIP Start Request Parameters
export interface NTRIPStartParams {
  ntrip_url?: string;
  host?: string;
  port?: number;
  mountpoint?: string;
  user?: string;
  password?: string;
  [key: string]: unknown;
}

// NTRIP Start Response
export interface NTRIPStartResponse {
  success: boolean;
  message: string;
  source: 'NTRIP';
  caster?: NTRIPCasterInfo;
}

// NTRIP Stop Response
export interface NTRIPStopResponse {
  success: boolean;
  message: string;
  source: 'NTRIP';
}

// LoRa Start Response
export interface LoRaStartResponse {
  success: boolean;
  message: string;
  source: 'LoRa';
  status?: LoraRTKStatus;
}

// LoRa Stop Response
export interface LoRaStopResponse {
  success: boolean;
  message: string;
  source: 'LoRa';
}

// Unified RTK Status Response
export interface RTKStatusResponse {
  success: boolean;
  ntrip: {
    running: boolean;
    caster: NTRIPCasterInfo | null;
    total_bytes: number;
  };
  lora: {
    running: boolean;
    status: LoraRTKStatus | null;
  };
}

// Stop All RTK Streams Response
export interface RTKStopAllResponse {
  success: boolean;
  message: string;
}
