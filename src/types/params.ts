/**
 * MAVLink Parameter Control Type Definitions
 *
 * Used for ArduRover parameter read/write operations via the Param Browser UI.
 * These types match the backend API contract defined in BACKEND_IMPLEMENTATION_GUIDE.md
 */

/**
 * ArduRover parameter with metadata
 */
export interface RoverParam {
  name: string;
  value: number;
  type: 'INT32' | 'FLOAT' | 'UINT8' | 'INT16' | 'UINT16' | 'UINT32' | string;
  group?: string;         // e.g. "NAVL1", "ATC_STR", "ATC_SPEED"
  default_value?: number;
  min?: number;
  max?: number;
  increment?: number;
  units?: string;
  description?: string;
}

/**
 * Response from GET /api/params
 */
export interface ParamListResponse {
  success: boolean;
  params: RoverParam[];
  total: number;
  error?: string;
}

/**
 * Response from GET /api/params/{name}
 */
export interface ParamGetResponse {
  success: boolean;
  param: RoverParam | null;
  error?: string;
}

/**
 * Response from POST /api/params/{name}
 */
export interface ParamSetResponse {
  success: boolean;
  message: string;
  param?: RoverParam | null;
  error?: string;
}

/**
 * Response from GET /api/params/groups
 */
export interface ParamGroupsResponse {
  success: boolean;
  groups: string[];
  error?: string;
}

/**
 * Response from GET /api/params/download
 */
export interface ParamDownloadResponse {
  success: boolean;
  filename: string;
  content: string;
  total: number;
  error?: string;
}

/**
 * Response from POST /api/params/upload
 */
export interface ParamUploadResponse {
  success: boolean;
  dry_run: boolean;
  summary: {
    total_in_file: number;
    matched: number;
    changed: number;
    skipped: number;
    not_found: number;
    failed: number;
  };
  changes: Array<{
    name: string;
    old_value: number;
    new_value: number;
    status: 'applied' | 'failed' | 'skipped';
  }>;
  not_found: string[];
  failed: string[];
  reboot_required: boolean;
  error?: string;
}

/**
 * Param preset for saving/loading configurations
 * Stored in AsyncStorage under '@param_presets' key
 */
export interface ParamPreset {
  id: string;
  name: string;
  description?: string;
  params: Record<string, number>;  // { PARAM_NAME: value }
  createdAt: string;
  updatedAt: string;
}
