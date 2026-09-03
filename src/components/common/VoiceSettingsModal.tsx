import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme/colors';
import { useRover } from '../../context/RoverContext';

const TTS_LANGUAGE_STORAGE_KEY = 'tts_language';

export type VoiceSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  onTTSStatusChange?: (enabled: boolean) => void;
};

const languages = [
  { id: 'ta', label: 'தமிழ்' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
];

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({ visible, onClose, onTTSStatusChange }) => {
  const { services, ttsLanguage, setTTSLanguage } = useRover();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Use global language state from context
  const selectedLang = ttsLanguage;

  useEffect(() => {
    console.log('🎤 VoiceSettingsModal visible:', visible);
  }, [visible]);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        setLoading(true);
        const res: any = await services.getTTSStatus();
        if (!mounted) return;
        setEnabled(Boolean(res?.enabled));
      } catch (err) {
        console.error('[VoiceSettingsModal] Failed to get TTS status', err);
        if (mounted) setEnabled(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (visible) fetchStatus();
    return () => { mounted = false; };
  }, [visible, services]);

  const handleEnable = async (on: boolean) => {
    try {
      setLoading(true);
      const res: any = await services.controlTTS(on);
      const newEnabled = Boolean(res?.enabled ?? on);
      setEnabled(newEnabled);

      // Notify parent component about TTS status change
      onTTSStatusChange?.(newEnabled);
    } catch (err) {
      console.error('[VoiceSettingsModal] controlTTS failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLanguage = async (id: string) => {
    try {
      console.log('[VoiceSettingsModal] Language selected:', id);

      // Update global language state (also persists to AsyncStorage)
      await setTTSLanguage(id);

      // Call backend API to set language (when endpoint is ready)
      setLoading(true);
      try {
        const response = await services.setTTSLanguage(id);
        if (response?.success) {
          console.log('[VoiceSettingsModal] Language successfully set on backend:', id);
        } else {
          console.error('[VoiceSettingsModal] Backend returned error:', response?.error);
        }
      } catch (apiError) {
        console.error('[VoiceSettingsModal] Failed to set language on backend:', apiError);
        // Continue even if backend call fails - language is already saved locally
      } finally {
        setLoading(false);
      }

    } catch (error) {
      console.error('[VoiceSettingsModal] Failed to save language preference:', error);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Voice Settings</Text>

          <Text style={styles.sectionTitle}>Language</Text>
          <View style={styles.langRow}>
            {languages.map(l => (
              <TouchableOpacity
                key={l.id}
                style={[styles.langBtn, selectedLang === l.id && styles.langBtnActive]}
                onPress={() => handleSelectLanguage(l.id)}
              >
                <Text style={[styles.langText, selectedLang === l.id && styles.langTextActive]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Text-to-Speech</Text>
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, enabled ? styles.btnDisabled : styles.btnPrimary]}
              onPress={() => handleEnable(true)}
              disabled={loading || enabled === true}
            >
              <Text style={styles.controlText}>Enable</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, enabled === false ? styles.btnDisabled : styles.btnDanger]}
              onPress={() => handleEnable(false)}
              disabled={loading || enabled === false}
            >
              <Text style={styles.controlText}>Disable</Text>
            </TouchableOpacity>
          </View>

          {loading && <ActivityIndicator style={{ marginTop: 12 }} />}

          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 8 },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  langBtn: { flex: 1, paddingVertical: 12, marginHorizontal: 6, borderRadius: 8, backgroundColor: '#123047', alignItems: 'center' },
  langBtnActive: { backgroundColor: colors.greenBtn || '#10B981' },
  langText: { color: '#cfefff', fontWeight: '600' },
  langTextActive: { color: '#fff' },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  controlBtn: { flex: 1, paddingVertical: 12, marginHorizontal: 6, borderRadius: 8, alignItems: 'center' },
  controlText: { color: '#fff', fontWeight: '700' },
  btnPrimary: { backgroundColor: colors.greenBtn || '#10B981' },
  btnDanger: { backgroundColor: colors.danger || '#ef4444' },
  btnDisabled: { backgroundColor: '#475569', opacity: 0.6 },
  footerRow: { marginTop: 14, alignItems: 'center' },
  closeBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#0c242f', borderRadius: 8 },
  closeText: { color: '#fff', fontWeight: '700' },
});

export default VoiceSettingsModal;
