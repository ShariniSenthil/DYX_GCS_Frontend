/**
 * ConnectionContext — Stable connection state (rarely changes)
 *
 * Reads from TelemetryContext but only exposes connection-related values.
 * Consumers using useConnection() will only re-render when connectionState,
 * services, or socket actually change — NOT on every 20Hz telemetry tick.
 *
 * This works because useMemo ensures the context value object reference
 * stays stable across telemetry updates (connectionState, services, and
 * socket change only on connect/disconnect events).
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { RoverServices } from '../hooks/useRoverTelemetry';
import { ConnectionState } from '../types/telemetry';
import type { Socket } from 'socket.io-client';
import { useTelemetry } from './TelemetryContext';

export interface ConnectionContextValue {
  connectionState: ConnectionState;
  services: RoverServices;
  socket: Socket | null;
  reconnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface ConnectionProviderProps {
  children: ReactNode;
}

export function ConnectionProvider({ children }: ConnectionProviderProps): React.ReactElement {
  const telemetry = useTelemetry();

  // Only re-create this value when connection-related fields change.
  // This ensures consumers only re-render on connect/disconnect,
  // NOT on every 20Hz telemetry update.
  const contextValue = useMemo<ConnectionContextValue>(() => ({
    connectionState: telemetry.connectionState,
    services: telemetry.services,
    socket: telemetry.socket,
    reconnect: telemetry.reconnect,
  }), [
    telemetry.connectionState,
    telemetry.services,
    telemetry.socket,
    telemetry.reconnect,
  ]);

  return React.createElement(
    ConnectionContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Hook: useConnection
 *
 * Access connection state without subscribing to 20Hz telemetry updates.
 * Components using this hook will only re-render on connect/disconnect events.
 */
export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return ctx;
}

export default ConnectionContext;