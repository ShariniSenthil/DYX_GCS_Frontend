/**
 * Persistent Storage Service
 *
 * Provides robust, crash-resistant storage for mission data and app state
 * Similar to AAA game save systems - data persists across crashes and restarts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Waypoint } from '../components/missionreport/types';
import type { WaypointUiStatus } from '../types/missionWaypointStatus';

// Storage keys
const STORAGE_KEYS = {
  MISSION_WAYPOINTS: '@mission/waypoints',
  MISSION_STATUS_MAP: '@mission/status_map',
  MISSION_METADATA: '@mission/metadata',
  MISSION_START_TIME: '@mission/start_time',
  MISSION_END_TIME: '@mission/end_time',
  MISSION_ACTIVE: '@mission/is_active',
  MISSION_MODE: '@mission/mode',
  PATHPLAN_HOME_POSITION: '@pathplan/home_position',
  PATHPLAN_DRAW_SETTINGS: '@pathplan/draw_settings',
  PATHPLAN_DRAWING_MODE: '@pathplan/drawing_mode',
  PATHPLAN_ACTIVE_TOOL: '@pathplan/active_tool',
  PATHPLAN_MAP_VISUALIZATION: '@pathplan/map_visualization',
  APP_STATE: '@app/state',
  LAST_SAVE_TIMESTAMP: '@app/last_save',
  CRASH_RECOVERY_DATA: '@crash/recovery',
  ACTIVE_TAB: '@app/active_tab',
  // UI State persistence
  MISSION_REPORT_UI_STATE: '@mission_report/ui_state',
  PATHPLAN_UI_STATE: '@pathplan/ui_state',
  DASHBOARD_UI_STATE: '@dashboard/ui_state',
  // Skip audit history
  MISSION_SKIP_AUDIT: '@mission/skip_audit',
  // Verified mission (4-wheel) — survives cold restarts
  VERIFIED_MISSION_ID:   '@mission/verified_id',
  VERIFIED_MISSION_NAME: '@mission/verified_name',
} as const;

export interface MissionMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  totalWaypoints: number;
  completedWaypoints: number;
  missionMode: string | null;
  isActive: boolean;
}

export interface WaypointStatusMap {
  [waypointSn: number]: {
    reached?: boolean;
    marked?: boolean;
    status?: WaypointUiStatus;
    timestamp?: string;
    pile?: string | number;
    rowNo?: string | number;
    remark?: string;
  };
}

export interface AppState {
  lastActiveScreen: string;
  lastSaveTimestamp: number;
  isRecovering: boolean;
}

export interface CrashRecoveryData {
  timestamp: number;
  screen: string;
  operation: string;
  waypoints?: Waypoint[];
  statusMap?: WaypointStatusMap;
  metadata?: MissionMetadata;
}

class PersistentStorageService {
  private saveQueue: Map<string, any> = new Map();
  private isSaving: boolean = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private waypointDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWaypoints: Waypoint[] | null = null;
  private waypointWritePromise: Promise<void> = Promise.resolve();
  private static WAYPOINT_DEBOUNCE_MS = 800;

  // In-memory cache for frequently-read mission data
  // Avoids disk reads on tab switches after first load
  private memoryCache: Map<string, any> = new Map();
  private missionReportCacheValid: boolean = false;

  /** Invalidate the mission report cache when data changes */
  private invalidateMissionReportCache(): void {
    this.missionReportCacheValid = false;
    this.memoryCache.delete('missionReportData');
  }

  /**
   * Save waypoints to persistent storage
   * Debounced: coalesces rapid updates (drag, bulk add) into a single disk write.
   * Call flushWaypointSave() to force immediate write (e.g., on unmount/tab switch).
   */
  saveWaypoints(waypoints: Waypoint[]): void {
    if (!waypoints || !Array.isArray(waypoints)) {
      console.warn('[Storage] Skipping save - waypoints is invalid:', waypoints);
      return;
    }

    // Store the latest waypoints in memory — always the most recent version
    this.pendingWaypoints = waypoints;

    // Clear any existing debounce timer
    if (this.waypointDebounceTimer) {
      clearTimeout(this.waypointDebounceTimer);
    }

    // Schedule a coalesced write
    this.waypointDebounceTimer = setTimeout(() => {
      this.flushWaypointSave();
    }, PersistentStorageService.WAYPOINT_DEBOUNCE_MS);
  }

  /**
   * Force immediate write of any pending waypoints.
   * Call on screen unmount / tab switch / app backgrounding to prevent data loss.
   */
  async flushWaypointSave(): Promise<void> {
    if (this.waypointDebounceTimer) {
      clearTimeout(this.waypointDebounceTimer);
      this.waypointDebounceTimer = null;
    }

    if (this.pendingWaypoints === null) {
      await this.waypointWritePromise;
      return;
    }

    const waypoints = this.pendingWaypoints;
    this.pendingWaypoints = null;

    // Fire-and-forget — don't block the caller
    this.waypointWritePromise = this.waypointWritePromise
      .catch(() => undefined)
      .then(() => this.writeWaypointsToDisk(waypoints));
    await this.waypointWritePromise;
  }

  private async writeWaypointsToDisk(waypoints: Waypoint[]): Promise<void> {
    try {
      const data = JSON.stringify(waypoints);
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_WAYPOINTS, data);
      await this.updateLastSaveTimestamp();
      console.log(`[Storage] ✅ Saved ${waypoints.length} waypoints to persistent storage`);
    } catch (error) {
      console.error('[Storage] ❌ Failed to save waypoints:', error);
    }
  }

  /**
   * Load waypoints from persistent storage
   */
  async loadWaypoints(): Promise<Waypoint[] | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_WAYPOINTS);
      if (!data) {
        console.log('[Storage] No saved waypoints found');
        return null;
      }
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        console.warn('[Storage] Saved waypoints were not an array');
        return null;
      }
      const waypoints = parsed
        .map((raw: any, index: number) => {
          const lat = Number(raw?.lat ?? raw?.latitude);
          const lon = Number(raw?.lon ?? raw?.lng ?? raw?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }
          return {
            ...raw,
            sn: typeof raw?.sn === 'number' && Number.isFinite(raw.sn) ? raw.sn : index + 1,
            lat,
            lon,
            lng: lon,
          } as Waypoint;
        })
        .filter((wp: Waypoint | null): wp is Waypoint => wp != null);
      console.log(`[Storage] 📂 Loaded ${waypoints.length} waypoints from persistent storage`);
      return waypoints;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load waypoints:', error);
      return null;
    }
  }

  /**
   * Save waypoint status map
   */
  async saveStatusMap(statusMap: WaypointStatusMap): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      const data = JSON.stringify(statusMap);
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_STATUS_MAP, data);
      await this.updateLastSaveTimestamp();
      console.log(`[Storage] ✅ Saved status map with ${Object.keys(statusMap).length} entries`);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save status map:', error);
      return false;
    }
  }

  /**
   * Load waypoint status map
   */
  async loadStatusMap(): Promise<WaypointStatusMap | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_STATUS_MAP);
      if (!data) {
        console.log('[Storage] No saved status map found');
        return null;
      }
      const statusMap = JSON.parse(data) as WaypointStatusMap;
      console.log(`[Storage] 📂 Loaded status map with ${Object.keys(statusMap).length} entries`);
      return statusMap;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load status map:', error);
      return null;
    }
  }

  /**
   * Save mission metadata
   */
  async saveMissionMetadata(metadata: MissionMetadata): Promise<boolean> {
    try {
      const data = JSON.stringify(metadata);
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_METADATA, data);
      await this.updateLastSaveTimestamp();
      console.log('[Storage] ✅ Saved mission metadata');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save mission metadata:', error);
      return false;
    }
  }

  /**
   * Load mission metadata
   */
  async loadMissionMetadata(): Promise<MissionMetadata | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_METADATA);
      if (!data) {
        console.log('[Storage] No saved mission metadata found');
        return null;
      }
      const metadata = JSON.parse(data) as MissionMetadata;
      console.log('[Storage] 📂 Loaded mission metadata');
      return metadata;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load mission metadata:', error);
      return null;
    }
  }

  /**
   * Save mission start time
   */
  async saveMissionStartTime(startTime: Date | null): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      if (startTime) {
        await AsyncStorage.setItem(STORAGE_KEYS.MISSION_START_TIME, startTime.toISOString());
        console.log('[Storage] ✅ Saved mission start time:', startTime.toISOString());
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.MISSION_START_TIME);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save mission start time:', error);
      return false;
    }
  }

  /**
   * Load mission start time
   */
  async loadMissionStartTime(): Promise<Date | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_START_TIME);
      if (!data) return null;
      const startTime = new Date(data);
      console.log('[Storage] 📂 Loaded mission start time:', startTime.toISOString());
      return startTime;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load mission start time:', error);
      return null;
    }
  }

  /**
   * Save mission end time
   */
  async saveMissionEndTime(endTime: Date | null): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      if (endTime) {
        await AsyncStorage.setItem(STORAGE_KEYS.MISSION_END_TIME, endTime.toISOString());
        console.log('[Storage] ✅ Saved mission end time:', endTime.toISOString());
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.MISSION_END_TIME);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save mission end time:', error);
      return false;
    }
  }

  /**
   * Save a skip audit record (append-only)
   */
  async saveSkipAuditRecord(record: any): Promise<boolean> {
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_SKIP_AUDIT);
      const arr = existing ? JSON.parse(existing) as any[] : [];
      arr.push(record);
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_SKIP_AUDIT, JSON.stringify(arr));
      await this.updateLastSaveTimestamp();
      console.log('[Storage] ✅ Saved skip audit record', record?.id);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save skip audit record:', error);
      return false;
    }
  }

  /**
   * Load skip audit history
   */
  async loadSkipAudit(): Promise<any[] | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_SKIP_AUDIT);
      if (!data) return null;
      const arr = JSON.parse(data) as any[];
      console.log('[Storage] 📂 Loaded skip audit history with', arr.length, 'records');
      return arr;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load skip audit history:', error);
      return null;
    }
  }

  /**
   * Mark an existing skip audit record as undone
   */
  async markSkipAuditUndone(recordId: string): Promise<boolean> {
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_SKIP_AUDIT);
      if (!existing) return false;
      const arr = JSON.parse(existing) as any[];
      const idx = arr.findIndex(r => r && r.id === recordId);
      if (idx === -1) return false;
      arr[idx].undone = true;
      arr[idx].undoneAt = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_SKIP_AUDIT, JSON.stringify(arr));
      await this.updateLastSaveTimestamp();
      console.log('[Storage] ✅ Marked skip audit undone', recordId);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to mark skip audit undone:', error);
      return false;
    }
  }

  /**
   * Load mission end time
   */
  async loadMissionEndTime(): Promise<Date | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_END_TIME);
      if (!data) return null;
      const endTime = new Date(data);
      console.log('[Storage] 📂 Loaded mission end time:', endTime.toISOString());
      return endTime;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load mission end time:', error);
      return null;
    }
  }

  /**
   * Save mission active state
   */
  async saveMissionActive(isActive: boolean): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_ACTIVE, JSON.stringify(isActive));
      console.log('[Storage] ✅ Saved mission active state:', isActive);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save mission active state:', error);
      return false;
    }
  }

  /**
   * Load mission active state
   */
  async loadMissionActive(): Promise<boolean> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_ACTIVE);
      if (!data) return false;
      return JSON.parse(data) as boolean;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load mission active state:', error);
      return false;
    }
  }

  /**
   * Save mission mode
   */
  async saveMissionMode(mode: string | null): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      if (mode) {
        await AsyncStorage.setItem(STORAGE_KEYS.MISSION_MODE, mode);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.MISSION_MODE);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save mission mode:', error);
      return false;
    }
  }

  /**
   * Load mission mode
   */
  async loadMissionMode(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.MISSION_MODE);
    } catch (error) {
      console.error('[Storage] ❌ Failed to load mission mode:', error);
      return null;
    }
  }

  /**
   * Clear all mission data (user-initiated clear)
   */
  async clearMissionData(): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_WAYPOINTS),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_STATUS_MAP),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_METADATA),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_START_TIME),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_END_TIME),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_ACTIVE),
        AsyncStorage.removeItem(STORAGE_KEYS.MISSION_MODE),
      ]);
      console.log('[Storage] 🗑️ Cleared all mission data');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear mission data:', error);
      return false;
    }
  }

  /**
   * Clear all app data (cache clear)
   */
  async clearAllData(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      console.log('[Storage] 🗑️ Cleared all app data');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear all data:', error);
      return false;
    }
  }

  /**
   * Batch save operation - saves multiple items atomically
   * More efficient and safer than multiple saves
   */
  async batchSaveMissionState(
    waypoints: Waypoint[],
    statusMap: WaypointStatusMap,
    metadata?: MissionMetadata,
    startTime?: Date | null,
    endTime?: Date | null,
    isActive?: boolean,
    missionMode?: string | null
  ): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      const operations: Array<[string, string]> = [
        [STORAGE_KEYS.MISSION_WAYPOINTS, JSON.stringify(waypoints)],
        [STORAGE_KEYS.MISSION_STATUS_MAP, JSON.stringify(statusMap)],
      ];

      if (metadata) {
        operations.push([STORAGE_KEYS.MISSION_METADATA, JSON.stringify(metadata)]);
      }

      if (startTime) {
        operations.push([STORAGE_KEYS.MISSION_START_TIME, startTime.toISOString()]);
      }

      if (endTime) {
        operations.push([STORAGE_KEYS.MISSION_END_TIME, endTime.toISOString()]);
      }

      if (isActive !== undefined) {
        operations.push([STORAGE_KEYS.MISSION_ACTIVE, JSON.stringify(isActive)]);
      }

      if (missionMode !== undefined && missionMode !== null) {
        operations.push([STORAGE_KEYS.MISSION_MODE, missionMode]);
      }

      await AsyncStorage.multiSet(operations);
      await this.updateLastSaveTimestamp();

      console.log(`[Storage] 💾 Batch saved mission state: ${waypoints.length} waypoints, ${Object.keys(statusMap).length} statuses`);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to batch save mission state:', error);
      return false;
    }
  }

  /**
   * Update last save timestamp
   */
  private async updateLastSaveTimestamp(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SAVE_TIMESTAMP, Date.now().toString());
    } catch (error) {
      console.error('[Storage] ❌ Failed to update last save timestamp:', error);
    }
  }

  /**
   * Get last save timestamp
   */
  async getLastSaveTimestamp(): Promise<number | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SAVE_TIMESTAMP);
      return data ? parseInt(data, 10) : null;
    } catch (error) {
      console.error('[Storage] ❌ Failed to get last save timestamp:', error);
      return null;
    }
  }

  /**
   * Check if mission data exists
   */
  async hasMissionData(): Promise<boolean> {
    try {
      const waypoints = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_WAYPOINTS);
      return waypoints !== null;
    } catch (error) {
      console.error('[Storage] ❌ Failed to check for mission data:', error);
      return false;
    }
  }

  /**
   * Batch load all mission report data in a single AsyncStorage call.
   * Much faster than 6 separate getItem calls (~100ms vs ~600ms).
   * Uses in-memory cache so subsequent tab switches return instantly.
   */
  async loadAllMissionReportData(): Promise<{
    statusMap: WaypointStatusMap | null;
    startTime: Date | null;
    endTime: Date | null;
    isActive: boolean;
    mode: string | null;
    uiState: {
      currentIndex?: number | null;
      mode?: 'AUTO' | 'MANUAL' | 'CONTINUOUS' | 'DASH';
      isRobotStatusVisible?: boolean;
      isMissionProgressVisible?: boolean;
      isDistanceToTargetVisible?: boolean;
      isAccuracyMonitorVisible?: boolean;
      isSystemStatusVisible?: boolean;
      isMissionControlsVisible?: boolean;
      isBottomTableVisible?: boolean;
      isBottomTableExpanded?: boolean;
      /** @deprecated legacy — migrated to split panels on load */
      isLeftPanelVisible?: boolean;
      /** @deprecated legacy — migrated to split panels on load */
      isRightPanelVisible?: boolean;
    } | null;
  } | null> {
    try {
      // Return from memory cache if valid (instant, no disk I/O)
      if (this.missionReportCacheValid && this.memoryCache.has('missionReportData')) {
        console.log('[Storage] 📂 Mission report data from memory cache (0ms)');
        return this.memoryCache.get('missionReportData');
      }

      const keys = [
        STORAGE_KEYS.MISSION_STATUS_MAP,
        STORAGE_KEYS.MISSION_START_TIME,
        STORAGE_KEYS.MISSION_END_TIME,
        STORAGE_KEYS.MISSION_ACTIVE,
        STORAGE_KEYS.MISSION_MODE,
        STORAGE_KEYS.MISSION_REPORT_UI_STATE,
      ];

      const results = await AsyncStorage.multiGet(keys);

      const data = {
        statusMap: null as WaypointStatusMap | null,
        startTime: null as Date | null,
        endTime: null as Date | null,
        isActive: false,
        mode: null as string | null,
        uiState: null as {
          currentIndex?: number | null;
          mode?: "AUTO" | "MANUAL" | "CONTINUOUS" | "DASH";

          isRobotStatusVisible?: boolean;
          isMissionProgressVisible?: boolean;
          isDistanceToTargetVisible?: boolean;
          isAccuracyMonitorVisible?: boolean;
          isSystemStatusVisible?: boolean;
          isMissionControlsVisible?: boolean;
          isBottomTableVisible?: boolean;
          isBottomTableExpanded?: boolean;

          /** @deprecated legacy — migrated to split panels on load */
          isLeftPanelVisible?: boolean;

          /** @deprecated legacy — migrated to split panels on load */
          isRightPanelVisible?: boolean;
        } | null,
      };

      for (const [key, value] of results) {
        if (!value) continue;

        switch (key) {
          case STORAGE_KEYS.MISSION_STATUS_MAP:
            data.statusMap = JSON.parse(value) as WaypointStatusMap;
            break;
          case STORAGE_KEYS.MISSION_START_TIME:
            data.startTime = new Date(value);
            break;
          case STORAGE_KEYS.MISSION_END_TIME:
            data.endTime = new Date(value);
            break;
          case STORAGE_KEYS.MISSION_ACTIVE:
            data.isActive = JSON.parse(value) as boolean;
            break;
          case STORAGE_KEYS.MISSION_MODE:
            data.mode = value;
            break;
          case STORAGE_KEYS.MISSION_REPORT_UI_STATE:
            data.uiState = JSON.parse(value);
            break;
        }
      }

      // Cache in memory for subsequent reads
      this.memoryCache.set('missionReportData', data);
      this.missionReportCacheValid = true;

      console.log('[Storage] 📂 Batch loaded mission report data from disk');
      return data;
    } catch (error) {
      console.error('[Storage] ❌ Failed to batch load mission report data:', error);
      return null;
    }
  }

  // ==================== PathPlan State Persistence ====================

  /**
   * Save home position
   */
  async saveHomePosition(position: { lat: number; lng: number } | null): Promise<boolean> {
    try {
      if (position) {
        await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_HOME_POSITION, JSON.stringify(position));
        console.log('[Storage] ✅ Saved home position:', position);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_HOME_POSITION);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save home position:', error);
      return false;
    }
  }

  /**
   * Load home position
   */
  async loadHomePosition(): Promise<{ lat: number; lng: number } | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_HOME_POSITION);
      if (!data) return null;
      const position = JSON.parse(data) as { lat: number; lng: number };
      console.log('[Storage] 📂 Loaded home position:', position);
      return position;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load home position:', error);
      return null;
    }
  }

  /**
   * Save drawing settings
   */
  async saveDrawSettings(settings: any | null): Promise<boolean> {
    try {
      if (settings) {
        await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_DRAW_SETTINGS, JSON.stringify(settings));
        console.log('[Storage] ✅ Saved draw settings');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_DRAW_SETTINGS);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save draw settings:', error);
      return false;
    }
  }

  /**
   * Load drawing settings
   */
  async loadDrawSettings(): Promise<any | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_DRAW_SETTINGS);
      if (!data) return null;
      const settings = JSON.parse(data);
      console.log('[Storage] 📂 Loaded draw settings');
      return settings;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load draw settings:', error);
      return null;
    }
  }

  /**
   * Save drawing mode state
   */
  async saveDrawingMode(isDrawingMode: boolean): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_DRAWING_MODE, JSON.stringify(isDrawingMode));
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save drawing mode:', error);
      return false;
    }
  }

  /**
   * Load drawing mode state
   */
  async loadDrawingMode(): Promise<boolean> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_DRAWING_MODE);
      if (!data) return false;
      return JSON.parse(data) as boolean;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load drawing mode:', error);
      return false;
    }
  }

  /**
   * Save active drawing tool
   */
  async saveActiveTool(tool: string | null): Promise<boolean> {
    try {
      if (tool) {
        await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_ACTIVE_TOOL, tool);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_ACTIVE_TOOL);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save active tool:', error);
      return false;
    }
  }

  /**
   * Load active drawing tool
   */
  async loadActiveTool(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_ACTIVE_TOOL);
    } catch (error) {
      console.error('[Storage] ❌ Failed to load active tool:', error);
      return null;
    }
  }

  /**
   * Clear all PathPlan state
   */
  async clearPathPlanState(): Promise<boolean> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_HOME_POSITION),
        AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_DRAW_SETTINGS),
        AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_DRAWING_MODE),
        AsyncStorage.removeItem(STORAGE_KEYS.PATHPLAN_ACTIVE_TOOL),
      ]);
      console.log('[Storage] 🗑️ Cleared PathPlan state');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear PathPlan state:', error);
      return false;
    }
  }

  /**
   * Save crash recovery data
   */
  async saveCrashRecoveryData(data: any): Promise<boolean> {
    try {
      const jsonData = JSON.stringify(data);
      await AsyncStorage.setItem(STORAGE_KEYS.CRASH_RECOVERY_DATA, jsonData);
      console.log('[Storage] 💾 Saved crash recovery data');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save crash recovery data:', error);
      return false;
    }
  }

  /**
   * Load crash recovery data
   */
  async loadCrashRecoveryData(): Promise<any | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CRASH_RECOVERY_DATA);
      if (!data) {
        return null;
      }
      const recoveryData = JSON.parse(data);
      console.log('[Storage] 📂 Loaded crash recovery data');
      return recoveryData;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load crash recovery data:', error);
      return null;
    }
  }

  /**
   * Clear crash recovery data
   */
  async clearCrashRecoveryData(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.CRASH_RECOVERY_DATA);
      console.log('[Storage] 🗑️ Cleared crash recovery data');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear crash recovery data:', error);
      return false;
    }
  }

  /**
   * Save crash logs
   */
  async saveCrashLogs(logs: any[]): Promise<boolean> {
    try {
      const jsonData = JSON.stringify(logs);
      await AsyncStorage.setItem('@crash/logs', jsonData);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save crash logs:', error);
      return false;
    }
  }

  /**
   * Load crash logs
   */
  async loadCrashLogs(): Promise<any[] | null> {
    try {
      const data = await AsyncStorage.getItem('@crash/logs');
      if (!data) {
        return null;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('[Storage] ❌ Failed to load crash logs:', error);
      return null;
    }
  }

  /**
   * Clear crash logs
   */
  async clearCrashLogs(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem('@crash/logs');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear crash logs:', error);
      return false;
    }
  }

  /**
   * Save last active tab for app state restoration
   */
  async saveActiveTab(tab: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tab);
      console.log('[Storage] ✅ Saved active tab:', tab);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save active tab:', error);
      return false;
    }
  }

  /**
   * Load last active tab
   */
  async loadActiveTab(): Promise<string | null> {
    try {
      const tab = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
      if (tab) {
        console.log('[Storage] 📂 Loaded active tab:', tab);
      }
      return tab;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load active tab:', error);
      return null;
    }
  }

  /**
   * Save Mission Report screen UI state
   */
  async saveMissionReportUIState(state: {
    currentIndex?: number | null;
    mode?: 'AUTO' | 'MANUAL' | 'CONTINUOUS' | 'DASH';
    isRobotStatusVisible?: boolean;
    isMissionProgressVisible?: boolean;
    isDistanceToTargetVisible?: boolean;
    isAccuracyMonitorVisible?: boolean;
    isSystemStatusVisible?: boolean;
    isMissionControlsVisible?: boolean;
    isBottomTableVisible?: boolean;
    isBottomTableExpanded?: boolean;
    /** @deprecated legacy — migrated to split panels on load */
    isLeftPanelVisible?: boolean;
    /** @deprecated legacy — migrated to split panels on load */
    isRightPanelVisible?: boolean;
  }): Promise<boolean> {
    this.invalidateMissionReportCache();
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.MISSION_REPORT_UI_STATE, JSON.stringify(state));
      console.log('[Storage] ✅ Saved Mission Report UI state');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save Mission Report UI state:', error);
      return false;
    }
  }

  /**
   * Load Mission Report screen UI state
   */
  async loadMissionReportUIState(): Promise<{
    currentIndex?: number | null;
    mode?: 'AUTO' | 'MANUAL' | 'CONTINUOUS' | 'DASH';
    isRobotStatusVisible?: boolean;
    isMissionProgressVisible?: boolean;
    isDistanceToTargetVisible?: boolean;
    isAccuracyMonitorVisible?: boolean;
    isSystemStatusVisible?: boolean;
    isMissionControlsVisible?: boolean;
    isBottomTableVisible?: boolean;
    isBottomTableExpanded?: boolean;
    /** @deprecated legacy — migrated to split panels on load */
    isLeftPanelVisible?: boolean;
    /** @deprecated legacy — migrated to split panels on load */
    isRightPanelVisible?: boolean;
  } | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.MISSION_REPORT_UI_STATE);
      if (data) {
        const state = JSON.parse(data);
        console.log('[Storage] 📂 Loaded Mission Report UI state');
        return state;
      }
      return null;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load Mission Report UI state:', error);
      return null;
    }
  }

  /**
   * Save PathPlan screen UI state
   */
  async savePathPlanUIState(state: {
    selectedWaypoint?: number | null;
    mapCenter?: { lat: number; lon: number };
    mapZoom?: number;
    isDrawingToolsCollapsed?: boolean;
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_UI_STATE, JSON.stringify(state));
      console.log('[Storage] ✅ Saved PathPlan UI state');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save PathPlan UI state:', error);
      return false;
    }
  }

  /**
   * Load PathPlan screen UI state
   */
  async loadPathPlanUIState(): Promise<{
    selectedWaypoint?: number | null;
    mapCenter?: { lat: number; lon: number };
    mapZoom?: number;
    isDrawingToolsCollapsed?: boolean;
  } | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_UI_STATE);
      if (data) {
        const state = JSON.parse(data);
        console.log('[Storage] 📂 Loaded PathPlan UI state');
        return state;
      }
      return null;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load PathPlan UI state:', error);
      return null;
    }
  }

  /**
   * Save map visualization settings (distance labels, angle labels, snap feature, etc.)
   */
  async saveMapVisualization(settings: {
    distanceLabel: boolean;
    angleLabel: boolean;
    snapFeature: boolean;
    roverIcon: boolean;
    waypointPreview: boolean;
  }): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PATHPLAN_MAP_VISUALIZATION, JSON.stringify(settings));
      console.log('[Storage] ✅ Saved map visualization settings');
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save map visualization settings:', error);
      return false;
    }
  }

  /**
   * Load map visualization settings
   */
  async loadMapVisualization(): Promise<{
    distanceLabel: boolean;
    angleLabel: boolean;
    snapFeature: boolean;
    roverIcon: boolean;
    waypointPreview: boolean;
  } | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PATHPLAN_MAP_VISUALIZATION);
      if (data) {
        const settings = JSON.parse(data);
        console.log('[Storage] 📂 Loaded map visualization settings');
        return settings;
      }
      return null;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load map visualization settings:', error);
      return null;
    }
  }

  // ==================== Verified Mission State ====================

  /** Save the server-assigned mission_id for the loaded verified mission. */
  async saveVerifiedMissionId(missionId: string | null): Promise<boolean> {
    try {
      if (missionId) {
        await AsyncStorage.setItem(STORAGE_KEYS.VERIFIED_MISSION_ID, missionId);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.VERIFIED_MISSION_ID);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save verified mission id:', error);
      return false;
    }
  }

  /** Load the saved verified mission_id (null if none). */
  async loadVerifiedMissionId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.VERIFIED_MISSION_ID);
    } catch (error) {
      console.error('[Storage] ❌ Failed to load verified mission id:', error);
      return null;
    }
  }

  /** Save the display name for the loaded verified mission. */
  async saveVerifiedMissionName(name: string | null): Promise<boolean> {
    try {
      if (name) {
        await AsyncStorage.setItem(STORAGE_KEYS.VERIFIED_MISSION_NAME, name);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.VERIFIED_MISSION_NAME);
      }
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save verified mission name:', error);
      return false;
    }
  }

  /** Load the saved verified mission name (null if none). */
  async loadVerifiedMissionName(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.VERIFIED_MISSION_NAME);
    } catch (error) {
      console.error('[Storage] ❌ Failed to load verified mission name:', error);
      return null;
    }
  }

  /** Clear both verified mission persistence keys atomically. */
  async clearVerifiedMissionState(): Promise<boolean> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.VERIFIED_MISSION_ID,
        STORAGE_KEYS.VERIFIED_MISSION_NAME,
      ]);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to clear verified mission state:', error);
      return false;
    }
  }
}

// Singleton instance
export const PersistentStorage = new PersistentStorageService();
export default PersistentStorage;
