/**
 * Component Readiness Hooks
 * 
 * Reusable hooks to automatically register components and track their initialization
 * Makes it easy to integrate readiness tracking into any component
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useComponentReadiness, ComponentStatus, SystemCategory } from '../context/ComponentReadinessContext';

/**
 * Hook to register a component and manage its lifecycle
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { setReady, setError, setProgress } = useComponentLifecycle(
 *     'my-component',
 *     'My Component',
 *     'ui',
 *     true // critical
 *   );
 * 
 *   useEffect(() => {
 *     async function init() {
 *       setProgress(30, 'Loading data...');
 *       await loadData();
 *       setProgress(60, 'Rendering...');
 *       await render();
 *       setReady('Component ready');
 *     }
 *     init();
 *   }, []);
 * }
 * ```
 */
export function useComponentLifecycle(
  componentId: string,
  componentName: string,
  category: SystemCategory,
  critical: boolean = false
) {
  const {
    registerComponent,
    unregisterComponent,
    updateComponentStatus,
    isAppInForeground,
    isResuming
  } = useComponentReadiness();

  const mountedRef = useRef(false);

  // Register on mount
  useEffect(() => {
    mountedRef.current = true;
    registerComponent(componentId, componentName, category, critical);

    return () => {
      mountedRef.current = false;
      unregisterComponent(componentId);
    };
  }, [componentId, componentName, category, critical, registerComponent, unregisterComponent]);

  // Auto re-initialize when app resumes
  useEffect(() => {
    if (isResuming && mountedRef.current) {
      // Only log on resume, not every render
      updateComponentStatus(componentId, 'initializing', 0, 'Re-initializing...');
    }
  }, [isResuming, componentId, updateComponentStatus]);

  const setStatus = useCallback((
    status: ComponentStatus,
    progress?: number,
    message?: string,
    error?: string
  ) => {
    if (mountedRef.current) {
      updateComponentStatus(componentId, status, progress, message, error);
    }
  }, [componentId, updateComponentStatus]);

  // ✅ CRITICAL: Guard previous status to prevent cascading state updates
  // This prevents render loops when multiple hooks call setStatus in quick succession
  const previousStatusRef = useRef<{ status: ComponentStatus; message?: string }>({ status: 'initializing' });

  const setStatusGuarded = useCallback((
    status: ComponentStatus,
    progress?: number,
    message?: string,
    error?: string
  ) => {
    // Only update if status or message actually changed
    const prev = previousStatusRef.current;
    if (prev.status === status && prev.message === message) {
      return; // No change, skip update
    }
    previousStatusRef.current = { status, message };
    setStatus(status, progress, message, error);
  }, [setStatus]);

  const setReady = useCallback((message?: string) => {
    setStatusGuarded('ready', 100, message);
  }, [setStatusGuarded]);

  const setError = useCallback((error: string) => {
    setStatusGuarded('error', undefined, undefined, error);
  }, [setStatusGuarded]);

  const setProgress = useCallback((progress: number, message?: string) => {
    setStatusGuarded('initializing', progress, message);
  }, [setStatusGuarded]);

  const setReconnecting = useCallback((message?: string) => {
    setStatusGuarded('reconnecting', undefined, message);
  }, [setStatusGuarded]);

  return {
    setStatus,
    setReady,
    setError,
    setProgress,
    setReconnecting,
    isAppInForeground,
    isResuming
  };
}

/**
 * Hook for async initialization with automatic status tracking
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isReady, error } = useAsyncComponentInit(
 *     'my-component',
 *     'My Component',
 *     'ui',
 *     async (setProgress) => {
 *       setProgress(30, 'Loading...');
 *       await loadData();
 *       setProgress(70, 'Processing...');
 *       await process();
 *       // Auto sets to ready when done
 *     },
 *     true // critical
 *   );
 * 
 *   if (error) return <ErrorView error={error} />;
 *   if (!isReady) return null;
 *   return <MyContent />;
 * }
 * ```
 */
export function useAsyncComponentInit(
  componentId: string,
  componentName: string,
  category: SystemCategory,
  initFn: (setProgress: (progress: number, message?: string) => void) => Promise<void>,
  critical: boolean = false,
  dependencies: any[] = []
) {
  const lifecycle = useComponentLifecycle(componentId, componentName, category, critical);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    // Reset if dependencies change or app is resuming
    if (initRef.current && !lifecycle.isResuming) {
      return; // Already initialized and not resuming
    }

    initRef.current = true;
    setIsReady(false);
    setError(null);

    let mounted = true;

    async function init() {
      try {
        lifecycle.setProgress(0, 'Starting initialization...');
        
        await initFn(lifecycle.setProgress);
        
        if (mounted) {
          lifecycle.setReady('Initialization complete');
          setIsReady(true);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (mounted) {
          lifecycle.setError(errorMsg);
          setError(errorMsg);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
    // NOTE: Only depend on isResuming flag, not the entire lifecycle object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycle.isResuming, ...dependencies]);

  return {
    isReady,
    error,
    ...lifecycle
  };
}

/**
 * Hook to ensure a component doesn't allow user actions until it's ready
 * 
 * @example
 * ```tsx
 * function MissionControl() {
 *   const { isReady, preventAction } = useActionGuard('mission-control');
 * 
 *   const handleStartMission = preventAction(async () => {
 *     // This won't execute if component isn't ready
 *     await startMission();
 *   }, 'Cannot start mission while system is initializing');
 * 
 *   return (
 *     <Button 
 *       onPress={handleStartMission}
 *       disabled={!isReady}
 *     />
 *   );
 * }
 * ```
 */
export function useActionGuard(
  componentId: string,
  showAlert: boolean = true
) {
  const { getComponentStatus, isSystemReady } = useComponentReadiness();
  const hasWarnedRef = useRef(false);
  
  const isReady = useCallback(() => {
    const component = getComponentStatus(componentId);
    if (!component) {
      // Don't warn during initial render - component may be registering
      // Only warn if this persists and an action is actually attempted
      return false;
    }
    return component.status === 'ready' && isSystemReady();
  }, [componentId, getComponentStatus, isSystemReady]);

  const preventAction = useCallback(<T extends (...args: any[]) => any>(
    action: T,
    message: string = 'System is not ready yet'
  ) => {
    return async (...args: Parameters<T>) => {
      const component = getComponentStatus(componentId);
      
      // Only warn when action is actually attempted and component still not registered
      if (!component && !hasWarnedRef.current) {
        console.warn(`[ActionGuard] Component ${componentId} not registered`);
        hasWarnedRef.current = true;
      }
      
      if (!isReady()) {
        // Only log when action is actually prevented
        if (showAlert && typeof alert !== 'undefined') {
          // For React Native, you'd use Alert.alert
          const { Alert } = require('react-native');
          Alert.alert('System Not Ready', message);
        }
        return;
      }
      return action(...args);
    };
  }, [isReady, showAlert, componentId, getComponentStatus]);

  return {
    isReady: isReady(),
    isSystemReady: isSystemReady(),
    preventAction
  };
}

/**
 * Hook to track network/WebSocket connection readiness
 * Specifically for real-time connection status
 * 
 * @example
 * ```tsx
 * function TelemetryPanel() {
 *   useConnectionReadiness(
 *     'websocket',
 *     'WebSocket Connection',
 *     connected,
 *     reconnecting,
 *     true // critical
 *   );
 * }
 * ```
 */
export function useConnectionReadiness(
  connectionId: string,
  connectionName: string,
  isConnected: boolean,
  isReconnecting: boolean = false,
  critical: boolean = true
) {
  const lifecycle = useComponentLifecycle(connectionId, connectionName, 'network', critical);

  useEffect(() => {
    if (isConnected) {
      lifecycle.setReady('Connected');
    } else if (isReconnecting) {
      lifecycle.setReconnecting('Reconnecting...');
    } else {
      lifecycle.setProgress(0, 'Connecting...');
    }
    // NOTE: lifecycle functions are stable, don't need them in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isReconnecting]);

  return lifecycle;
}

/**
 * Hook to track screen/component mount readiness
 * Simple wrapper for common React Native screen patterns
 * 
 * @example
 * ```tsx
 * function MissionReportScreen() {
 *   const { isReady } = useScreenReadiness(
 *     'mission-report-screen',
 *     'Mission Report',
 *     async (setProgress) => {
 *       setProgress(25, 'Loading waypoints...');
 *       await loadWaypoints();
 *       setProgress(50, 'Initializing map...');
 *       await initMap();
 *       setProgress(75, 'Connecting telemetry...');
 *       await connectTelemetry();
 *     },
 *     true // critical
 *   );
 * 
 *   if (!isReady) return <ScreenLoader />;
 *   return <ScreenContent />;
 * }
 * ```
 */
export function useScreenReadiness(
  screenId: string,
  screenName: string,
  initFn: (setProgress: (progress: number, message?: string) => void) => Promise<void>,
  critical: boolean = false,
  dependencies: any[] = []
) {
  return useAsyncComponentInit(
    screenId,
    screenName,
    'ui',
    initFn,
    critical,
    dependencies
  );
}
