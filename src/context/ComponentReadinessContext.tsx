/**
 * Component Readiness Context
 * 
 * Global system to track initialization and readiness of all critical components
 * Prevents crashes from premature user actions during component initialization
 * 
 * Inspired by game loading screens (Free Fire, PUBG) - shows status of each system
 * as it initializes and prevents user actions until everything is ready
 */

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Component status states
export type ComponentStatus = 
  | 'initializing'  // Component is starting up
  | 'ready'         // Component is fully ready
  | 'error'         // Component failed to initialize
  | 'reconnecting'; // Component is reconnecting

// Individual component info
export interface ComponentInfo {
  id: string;
  name: string;
  status: ComponentStatus;
  progress?: number; // 0-100 percentage
  message?: string;  // Status message
  error?: string;    // Error details if status is 'error'
  critical?: boolean; // If true, app cannot proceed until this is ready
  timestamp: number;
}

// Critical system categories
export type SystemCategory = 
  | 'network'      // WebSocket, HTTP connections
  | 'telemetry'    // Rover data streaming
  | 'navigation'   // React Navigation
  | 'mission'      // Mission loading and state
  | 'map'          // Map rendering
  | 'ui';          // UI component mounting

interface ComponentReadinessContextValue {
  // Component registration and status
  components: Record<string, ComponentInfo>;
  registerComponent: (id: string, name: string, category: SystemCategory, critical?: boolean) => void;
  unregisterComponent: (id: string) => void;
  updateComponentStatus: (id: string, status: ComponentStatus, progress?: number, message?: string, error?: string) => void;
  
  // Readiness checks
  isSystemReady: () => boolean; // Are all critical components ready?
  isCategoryReady: (category: SystemCategory) => boolean;
  getComponentStatus: (id: string) => ComponentInfo | undefined;
  getCategoryComponents: (category: SystemCategory) => ComponentInfo[];
  
  // Overall system state
  overallProgress: number; // 0-100
  isAppReady: boolean;
  readinessMessage: string;
  
  // App state management
  isAppInForeground: boolean;
  isResuming: boolean; // True when app is coming back from background
  
  // Reset and re-initialization
  resetAllComponents: () => void;
  triggerReinitialization: () => void;
}

const ComponentReadinessContext = createContext<ComponentReadinessContextValue | null>(null);

interface ComponentReadinessProviderProps {
  children: ReactNode;
  /** Minimum time (ms) to show loading screen, prevents flashing */
  minLoadingTime?: number;
}

export function ComponentReadinessProvider({ 
  children, 
  minLoadingTime = 1000 
}: ComponentReadinessProviderProps): React.ReactElement {
  const [components, setComponents] = useState<Record<string, ComponentInfo>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, SystemCategory>>({});
  const [isAppReady, setIsAppReady] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [readinessMessage, setReadinessMessage] = useState('Initializing application...');
  const [isAppInForeground, setIsAppInForeground] = useState(true);
  const [isResuming, setIsResuming] = useState(false);
  
  const loadingStartTime = useRef<number>(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const reinitTrigger = useRef<number>(0);

  // Register a component
  const registerComponent = useCallback((
    id: string, 
    name: string, 
    category: SystemCategory, 
    critical: boolean = false
  ) => {
    // Only log and reset status if not already registered
    setComponents(prev => {
      if (!prev[id]) {
        console.log(`[ComponentReadiness] 📝 Registering: ${name} (${id}) [${category}]${critical ? ' [CRITICAL]' : ''}`);
        return {
          ...prev,
          [id]: {
            id,
            name,
            status: 'initializing',
            progress: 0,
            critical,
            timestamp: Date.now()
          }
        };
      }
      // Component already registered - keep existing status
      return prev;
    });
    
    setCategoryMap(prev => ({
      ...prev,
      [id]: category
    }));
  }, []);

  // Unregister a component
  const unregisterComponent = useCallback((id: string) => {
    // Silent unregister - reduces log noise
    setComponents(prev => {
      const newComponents = { ...prev };
      delete newComponents[id];
      return newComponents;
    });
    setCategoryMap(prev => {
      const newMap = { ...prev };
      delete newMap[id];
      return newMap;
    });
  }, []);

  // Update component status
  const updateComponentStatus = useCallback((
    id: string,
    status: ComponentStatus,
    progress?: number,
    message?: string,
    error?: string
  ) => {
    setComponents(prev => {
      const component = prev[id];
      if (!component) {
        console.warn(`[ComponentReadiness] ⚠️ Cannot update unknown component: ${id}`);
        return prev;
      }

      // Only log state changes, not repeated ready states
      const isStateChange = component.status !== status;
      const isError = status === 'error';
      
      if (isStateChange || isError) {
        const statusIcon = 
          status === 'ready' ? '✅' :
          status === 'error' ? '❌' :
          status === 'reconnecting' ? '🔄' : '⏳';
        
        console.log(
          `[ComponentReadiness] ${statusIcon} ${component.name}: ${status}` +
          (progress !== undefined ? ` (${progress}%)` : '') +
          (message ? ` - ${message}` : '') +
          (error ? ` ERROR: ${error}` : '')
        );
      }

      return {
        ...prev,
        [id]: {
          ...component,
          status,
          progress: progress !== undefined ? progress : component.progress,
          message,
          error,
          timestamp: Date.now()
        }
      };
    });
  }, []);

  // Get component by ID
  const getComponentStatus = useCallback((id: string): ComponentInfo | undefined => {
    return components[id];
  }, [components]);

  // Get all components in a category
  const getCategoryComponents = useCallback((category: SystemCategory): ComponentInfo[] => {
    return Object.entries(categoryMap)
      .filter(([_, cat]) => cat === category)
      .map(([id]) => components[id])
      .filter(Boolean);
  }, [components, categoryMap]);

  // Check if a category is ready
  const isCategoryReady = useCallback((category: SystemCategory): boolean => {
    const categoryComponents = getCategoryComponents(category);
    if (categoryComponents.length === 0) return true; // No components = ready
    return categoryComponents.every(c => c.status === 'ready');
  }, [getCategoryComponents]);

  // Check if all critical components are ready
  const isSystemReady = useCallback((): boolean => {
    const criticalComponents = Object.values(components).filter(c => c.critical);
    if (criticalComponents.length === 0) {
      console.log('[ComponentReadiness] ⚠️ No critical components registered');
      return true;
    }
    
    const allReady = criticalComponents.every(c => c.status === 'ready');
    const hasErrors = criticalComponents.some(c => c.status === 'error');
    
    if (hasErrors) {
      console.error('[ComponentReadiness] ❌ Critical component errors detected');
      return false;
    }
    
    return allReady;
  }, [components]);

  // Reset all components to initializing state
  const resetAllComponents = useCallback(() => {
    console.log('[ComponentReadiness] 🔄 Resetting all components');
    setComponents(prev => {
      const reset: Record<string, ComponentInfo> = {};
      Object.entries(prev).forEach(([id, component]) => {
        reset[id] = {
          ...component,
          status: 'initializing',
          progress: 0,
          message: undefined,
          error: undefined,
          timestamp: Date.now()
        };
      });
      return reset;
    });
    loadingStartTime.current = Date.now();
    setIsAppReady(false);
  }, []);

  // Trigger re-initialization (used when app comes back from background)
  const triggerReinitialization = useCallback(() => {
    console.log('[ComponentReadiness] 🔄 Triggering re-initialization');
    reinitTrigger.current++;
    resetAllComponents();
  }, [resetAllComponents]);

  // Calculate overall progress and readiness
  useEffect(() => {
    const allComponents = Object.values(components);
    if (allComponents.length === 0) {
      setOverallProgress(0);
      setReadinessMessage('Initializing application...');
      return;
    }

    // Calculate progress
    const totalProgress = allComponents.reduce((sum, c) => sum + (c.progress || 0), 0);
    const avgProgress = totalProgress / allComponents.length;
    setOverallProgress(Math.round(avgProgress));

    // Determine readiness message
    const initializingComponents = allComponents.filter(c => c.status === 'initializing');
    const errorComponents = allComponents.filter(c => c.status === 'error');
    const reconnectingComponents = allComponents.filter(c => c.status === 'reconnecting');

    if (errorComponents.length > 0) {
      const errorNames = errorComponents.map(c => c.name).join(', ');
      setReadinessMessage(`Error: ${errorNames}`);
    } else if (reconnectingComponents.length > 0) {
      const reconnectNames = reconnectingComponents.map(c => c.name).join(', ');
      setReadinessMessage(`Reconnecting: ${reconnectNames}`);
    } else if (initializingComponents.length > 0) {
      const initName = initializingComponents[0]?.name || 'components';
      setReadinessMessage(`Loading ${initName}...`);
    } else {
      setReadinessMessage('Ready');
    }

    // Check if app is ready
    const systemReady = isSystemReady();
    const minTimeElapsed = (Date.now() - loadingStartTime.current) >= minLoadingTime;
    
    if (systemReady && minTimeElapsed && !isAppReady) {
      console.log('[ComponentReadiness] 🎉 All systems ready!');
      setIsAppReady(true);
    } else if (!systemReady && isAppReady) {
      console.log('[ComponentReadiness] ⚠️ System no longer ready, showing loading screen');
      setIsAppReady(false);
    }
  }, [components, isSystemReady, minLoadingTime, isAppReady]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    let backgroundTimestamp: number | null = null;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const wasInBackground = appStateRef.current.match(/inactive|background/);
      const isNowActive = nextAppState === 'active';

      console.log(`[ComponentReadiness] 📱 App state changed: ${appStateRef.current} → ${nextAppState}`);

      if (wasInBackground && isNowActive) {
        // App coming back from background
        const backgroundDuration = backgroundTimestamp ? Date.now() - backgroundTimestamp : 0;
        console.log(`[ComponentReadiness] ✅ App resuming from background (duration: ${backgroundDuration}ms) - keeping existing state`);
        
        setIsAppInForeground(true);
        
        // Don't trigger re-initialization automatically
        // Components will handle their own reconnection logic if needed
        // This prevents unnecessary loading screens when returning from background
        
        backgroundTimestamp = null;
      } else if (nextAppState.match(/inactive|background/)) {
        // App going to background
        console.log('[ComponentReadiness] 💤 App going to background');
        backgroundTimestamp = Date.now();
        setIsAppInForeground(false);
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const contextValue: ComponentReadinessContextValue = {
    components,
    registerComponent,
    unregisterComponent,
    updateComponentStatus,
    isSystemReady,
    isCategoryReady,
    getComponentStatus,
    getCategoryComponents,
    overallProgress,
    isAppReady,
    readinessMessage,
    isAppInForeground,
    isResuming,
    resetAllComponents,
    triggerReinitialization,
  };

  return (
    <ComponentReadinessContext.Provider value={contextValue}>
      {children}
    </ComponentReadinessContext.Provider>
  );
}

/**
 * Hook: useComponentReadiness
 * 
 * Access component readiness system throughout the app
 * Must be used within <ComponentReadinessProvider>
 */
export function useComponentReadiness(): ComponentReadinessContextValue {
  const ctx = useContext(ComponentReadinessContext);
  if (!ctx) {
    throw new Error('useComponentReadiness must be used within a ComponentReadinessProvider');
  }
  return ctx;
}
