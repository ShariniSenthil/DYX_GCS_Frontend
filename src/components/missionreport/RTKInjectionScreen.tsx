import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { RoverServices } from '../../hooks/useRoverTelemetry';
import { NTRIPProfileList } from './NTRIPProfileList';
import { NTRIPProfileEditor } from './NTRIPProfileEditor';
import { NTRIPProfile } from '../../types/ntrip';
import { LoraRTKStatus } from '../../types/rtk';

interface Props {
  visible: boolean;
  onClose: () => void;
  services: RoverServices;
  isConnected: boolean;
}

type RTKSource = 'ntrip' | 'lora';
type ModalScreen = 'list' | 'editor';

export const RTKInjectionScreen: React.FC<Props> = ({ visible, onClose, services, isConnected }) => {
  const [rtkSource, setRtkSource] = useState<RTKSource>('ntrip');
  const [modalScreen, setModalScreen] = useState<ModalScreen>('list');
  const [selectedProfile, setSelectedProfile] = useState<NTRIPProfile | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isNtripRunning, setIsNtripRunning] = useState(false);
  const [ntripBytes, setNtripBytes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loraStatus, setLoraStatus] = useState<LoraRTKStatus>({
    status: 'disconnected',
    message: 'Idle',
    messages_received: 0,
    bytes_received: 0,
    error_count: 0,
    is_connected: false,
    is_running: false,
  });
  const [loraRunning, setLoraRunning] = useState(false);
  const [loraConnected, setLoraConnected] = useState(false);

  const stopMonitor = useCallback(() => {
    if (monitorRef.current) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  }, []);

  const startMonitor = useCallback(() => {
    if (monitorRef.current) return;
    monitorRef.current = setInterval(async () => {
      try {
        const status = await services.getRTKStatus();
        if (status.success) {
          const bytes = status.ntrip.total_bytes ?? 0;
          setNtripBytes(bytes);
          // Always sync running state from backend
          setIsNtripRunning(Boolean(status.ntrip.running));
          if (!status.ntrip.running) {
            stopMonitor();
          }
        }
      } catch (err) {
        console.error('[RTKInjection] RTK monitor error:', err);
      }
    }, 250);
  }, [services, stopMonitor]);

  useEffect(() => {
    if (!visible) {
      stopMonitor();
      return;
    }

    const checkStatus = async () => {
      try {
        const status = await services.getRTKStatus();
        if (status.success) {
          setIsNtripRunning(Boolean(status.ntrip.running));
          setNtripBytes(status.ntrip.total_bytes || 0);
          if (status.ntrip.running) {
            startMonitor();
          }
        }
      } catch (err) {
        console.error('[RTKInjection] Failed to load RTK status:', err);
      }
    };

    checkStatus();
  }, [services, startMonitor, stopMonitor, visible, rtkSource]);

  useEffect(() => {
    if (!visible) return;
    if (!services.onLoraRTKStatus) return;

    const unsubscribe = services.onLoraRTKStatus((payload) => {
      setLoraStatus((prev) => ({ ...prev, ...payload }));
      const connected = Boolean(payload.is_connected) || payload.status === 'connected' || payload.status === 'streaming';
      const running = Boolean(payload.is_running) || payload.status === 'streaming';
      setLoraConnected(connected);
      setLoraRunning(running);
    });

    // Get initial LoRa status when component becomes visible
    const initializeLoraStatus = async () => {
      try {
        const status = await services.getRTKStatus();
        if (status.success && status.lora.running) {
          setLoraRunning(true);
          setLoraConnected(Boolean(status.lora.status?.is_connected));
          if (status.lora.status) {
            setLoraStatus((prev) => ({ ...prev, ...status.lora.status }));
          }
        } else {
          setLoraRunning(false);
          setLoraConnected(false);
        }
      } catch (err) {
        console.error('[RTKInjection] Failed to get initial LoRa status:', err);
      }
    };

    initializeLoraStatus();
    services.getLoraRTKStatus?.();

    return unsubscribe;
  }, [services, visible]);

  useEffect(() => {
    return () => stopMonitor();
  }, [stopMonitor]);

  const handleSwitchSource = async (source: RTKSource) => {
    if (source === rtkSource) return;

    if (source === 'ntrip' && loraRunning) {
      await services.stopLoRaStream().catch(() => undefined);
      setLoraRunning(false);
    } else if (source === 'lora' && isNtripRunning) {
      await services.stopNTRIPStream().catch(() => undefined);
      setIsNtripRunning(false);
      stopMonitor();
    }

    setRtkSource(source);
  };

  const handleSelectProfile = async (profile: NTRIPProfile) => {
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      // Use new NTRIP endpoint with individual parameters
      const response = await services.startNTRIPStream({
        host: profile.casterAddress,
        port: parseInt(profile.port, 10),
        mountpoint: profile.mountpoint,
        user: profile.username,
        password: profile.password,
      });

      if (response.success) {
        setFeedback(response.message ?? 'RTK stream started successfully.');
        setIsNtripRunning(true);
        setActiveProfileId(profile.id);
        
        // Immediately start monitoring to sync state from backend
        startMonitor();
        
        setTimeout(async () => {
          try {
            const status = await services.getRTKStatus();
            if (status.success && status.ntrip.running) {
              // Stream confirmed running - monitor already started
              console.log('[RTKInjection] Stream verified running with', status.ntrip.total_bytes, 'bytes');
            } else {
              // Stream failed to start
              setError('Stream started but backend reported not running.');
              setIsNtripRunning(false);
              setActiveProfileId(null);
              stopMonitor();
            }
          } catch (err) {
            console.warn('[RTKInjection] Status verification failed:', err);
            // Monitor already running, keep it going
          }
        }, 1000);
      } else {
        setError(response.message ?? 'Failed to start RTK stream.');
        Alert.alert('Connection Failed', response.message ?? 'Failed to start RTK stream.');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start RTK stream.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNewProfile = () => {
    setSelectedProfile(null);
    setModalScreen('editor');
  };

  const handleEditProfile = (profile: NTRIPProfile) => {
    setSelectedProfile(profile);
    setModalScreen('editor');
  };

  const handleProfileSaved = (profile: NTRIPProfile) => {
    setSelectedProfile(null);
    setModalScreen('list');
    setActiveProfileId((prev) => prev ?? profile.id);
  };

  const handleCancelEdit = () => {
    setSelectedProfile(null);
    setModalScreen('list');
  };

  const handleStopNtrip = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await services.stopNTRIPStream();
      if (response.success) {
        setIsNtripRunning(false);
        setActiveProfileId(null);
        stopMonitor();
        setFeedback(response.message ?? 'NTRIP stream stopped successfully.');
      } else {
        setError(response.message ?? 'Failed to stop NTRIP stream.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop NTRIP stream.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartLora = async () => {
    setFeedback(null);
    setError(null);

    try {
      if (isNtripRunning) {
        await services.stopNTRIPStream();
        setIsNtripRunning(false);
        stopMonitor();
      }

      const response = await services.startLoRaStream();
      if (!response.success) {
        setError(response.message ?? 'Failed to start LoRa stream.');
        return;
      }

      setFeedback(response.message ?? 'LoRa stream started successfully.');
      setLoraRunning(true);

      // Update status from response if available
      if (response.status) {
        setLoraStatus((prev) => ({ ...prev, ...response.status }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start LoRa stream.');
    }
  };

  const handleStopLora = async () => {
    setFeedback(null);
    setError(null);

    try {
      const response = await services.stopLoRaStream();
      if (!response.success) {
        setError(response.message ?? 'Failed to stop LoRa stream.');
        return;
      }

      setFeedback(response.message ?? 'LoRa stream stopped successfully.');
      setLoraRunning(false);
      setLoraConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop LoRa stream.');
    }
  };

  const ntripHeader = (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>NTRIP Caster</Text>
      <View style={[styles.statusPill, isNtripRunning ? styles.pillSuccess : styles.pillDanger]}>
        <Text style={styles.pillText}>{isNtripRunning ? 'Streaming' : 'Stopped'}</Text>
      </View>
    </View>
  );

  const loraHeader = (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>LoRa USB Receiver</Text>
      <View style={[styles.statusPill, loraRunning ? styles.pillSuccess : styles.pillDanger]}>
        <Text style={styles.pillText}>{loraRunning ? 'Streaming' : 'Stopped'}</Text>
      </View>
    </View>
  );

  const renderNtrip = () => (
    <View style={styles.sectionCard}>
      {ntripHeader}
      {modalScreen === 'list' ? (
        <NTRIPProfileList
          onSelectProfile={handleSelectProfile}
          onAddNew={handleAddNewProfile}
          onEditProfile={handleEditProfile}
          isConnecting={isSubmitting}
          activeProfileId={activeProfileId}
          isStreamRunning={isNtripRunning}
        />
      ) : (
        <NTRIPProfileEditor
          profile={selectedProfile}
          onSave={handleProfileSaved}
          onCancel={handleCancelEdit}
        />
      )}

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Bytes</Text>
          <Text style={styles.summaryValue}>{(ntripBytes / 1024).toFixed(2)} KB</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Status</Text>
          <Text style={styles.summaryValue}>{isNtripRunning ? 'Running' : 'Stopped'}</Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, styles.buttonSpacing, !isNtripRunning && styles.buttonDisabled]}
          onPress={handleStopNtrip}
          disabled={!isNtripRunning || isSubmitting}
        >
          <Text style={styles.buttonText}>Stop Stream</Text>
        </TouchableOpacity>
      </View>

      {feedback && <Text style={styles.feedback}>{feedback}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  const renderLora = () => (
    <View style={styles.sectionCard}>
      {loraHeader}

      <View style={styles.loraStats}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Connection</Text>
          <Text style={styles.statValue}>{loraConnected ? 'Connected' : 'Not Connected'}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Messages</Text>
          <Text style={styles.statValue}>{loraStatus.messages_received ?? 0}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Bytes</Text>
          <Text style={styles.statValue}>{((loraStatus.bytes_received ?? 0) / 1024).toFixed(2)} KB</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Errors</Text>
          <Text style={styles.statValue}>{loraStatus.error_count ?? 0}</Text>
        </View>
      </View>

      <View style={styles.messageBox}>
        <Text style={styles.messageLabel}>Status</Text>
        <Text style={styles.messageValue}>{loraStatus.message || 'Waiting for status...'}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, styles.buttonSpacing, loraRunning && styles.buttonDisabled]}
          onPress={handleStartLora}
          disabled={loraRunning}
        >
          <Text style={styles.buttonText}>Start Stream</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, !loraRunning && styles.buttonDisabled]}
          onPress={handleStopLora}
          disabled={!loraRunning}
        >
          <Text style={styles.buttonText}>Stop Stream</Text>
        </TouchableOpacity>
      </View>

      {feedback && <Text style={styles.feedback}>{feedback}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>RTK INJECTION</Text>
          <View style={[styles.connectionDot, { backgroundColor: isConnected ? colors.success : colors.danger }]} />
        </View>

        <View style={styles.sourceToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, rtkSource === 'ntrip' && styles.toggleActive]}
            onPress={() => handleSwitchSource('ntrip')}
          >
            <Text style={[styles.toggleText, rtkSource === 'ntrip' && styles.toggleTextActive]}>NTRIP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, rtkSource === 'lora' && styles.toggleActive]}
            onPress={() => handleSwitchSource('lora')}
          >
            <Text style={[styles.toggleText, rtkSource === 'lora' && styles.toggleTextActive]}>LoRa</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 32 }}>
          {rtkSource === 'ntrip' ? renderNtrip() : renderLora()}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 20000,
    elevation: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '92%',
    height: '90%',
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    zIndex: 20001,
    elevation: 21,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.secondary,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: colors.text,
    fontSize: 18,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sourceToggle: {
    flexDirection: 'row',
    margin: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  toggleActive: {
    backgroundColor: colors.accent,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#0A1628',
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
  },
  sectionCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  pillSuccess: {
    backgroundColor: colors.success,
  },
  pillDanger: {
    backgroundColor: colors.danger,
  },
  pillText: {
    color: '#0A1628',
    fontWeight: '700',
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonSpacing: {
    marginRight: 10,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  feedback: {
    marginTop: 10,
    color: colors.success,
  },
  error: {
    marginTop: 10,
    color: colors.danger,
  },
  loraStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  statValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  messageBox: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  messageLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  messageValue: {
    color: colors.text,
    fontSize: 14,
  },
});
