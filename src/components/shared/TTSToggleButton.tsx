import React, { useState, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRover } from '../../context/RoverContext';
import VoiceSettingsModal from '../common/VoiceSettingsModal';

const TTS_STORAGE_KEY = 'tts_enabled';

interface TTSToggleButtonProps {
  onStatusChange?: (enabled: boolean) => void;
}

/**
 * TTS Voice Control Toggle Button
 *
 * Opens VoiceSettingsModal for language selection and TTS control
 * State is persisted to AsyncStorage and restored on app start
 *
 * Features:
 * - Opens modal with language selection (Tamil, English, Hindi)
 * - Enable/disable TTS with API calls to /api/tts/control
 * - Fetch current status from /api/tts/status on mount
 * - Persist user preference to AsyncStorage
 * - Loading state during API request
 * - Error handling with Alert notifications
 * - Visual feedback with color changes and icons
 */
export const TTSToggleButton: React.FC<TTSToggleButtonProps> = ({ onStatusChange }) => {
  const { services } = useRover();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Load initial state from AsyncStorage and sync with backend
  useEffect(() => {
    const initializeTTSState = async () => {
      try {
        // Try to get saved preference from AsyncStorage
        const savedState = await AsyncStorage.getItem(TTS_STORAGE_KEY);
        
        if (savedState !== null) {
          setEnabled(savedState === 'true');
        } else {
          // No saved state, fetch from backend
          await fetchTTSStatusFromBackend();
        }
      } catch (error) {
        console.error('[TTSToggleButton] Failed to load initial state:', error);
        // Default to enabled if error occurs
        setEnabled(true);
      }
    };

    initializeTTSState();
  }, []);

  const fetchTTSStatusFromBackend = async () => {
    try {
      if (!services) return;
      
      const response = await services.getTTSStatus?.();
      
      if (response && response.success !== false) {
        setEnabled(response.enabled === true);
        await AsyncStorage.setItem(TTS_STORAGE_KEY, (response.enabled === true).toString());
      }
    } catch (error) {
      console.error('[TTSToggleButton] Failed to fetch TTS status:', error);
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleTTSStatusChange = (newEnabled: boolean) => {
    setEnabled(newEnabled);
    onStatusChange?.(newEnabled);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: enabled
              ? 'rgba(16, 185, 129, 0.15)'
              : 'rgba(107, 114, 128, 0.15)',
            borderColor: enabled
              ? 'rgba(16, 185, 129, 0.4)'
              : 'rgba(107, 114, 128, 0.3)',
            opacity: loading ? 0.6 : 1,
          },
        ]}
        onPress={handleOpenModal}
        disabled={loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator
            size={20}
            color={enabled ? '#10B981' : '#6B7280'}
          />
        ) : (
          <MaterialIcons
            name={enabled ? 'volume-up' : 'volume-off'}
            size={20}
            color={enabled ? '#10B981' : '#6B7280'}
          />
        )}
      </TouchableOpacity>

      <VoiceSettingsModal
        visible={showModal}
        onClose={handleCloseModal}
        onTTSStatusChange={handleTTSStatusChange}
      />
    </>
  );
};

const styles = {
  button: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginLeft: 8,
  },
};

export default TTSToggleButton;
