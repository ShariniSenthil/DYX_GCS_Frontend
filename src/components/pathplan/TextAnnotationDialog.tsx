import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors } from '../../theme/colors';

interface TextAnnotationDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (text: string, alignment: 'left' | 'center' | 'right', letterWidth: number, letterHeight: number, letterSpacing: number) => void;
  defaultCenter?: { lat: number; lng: number };
}

export const TextAnnotationDialog: React.FC<TextAnnotationDialogProps> = ({
  visible,
  onClose,
  onConfirm,
  defaultCenter,
}) => {
  const [text, setText] = useState('');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [letterWidth, setLetterWidth] = useState(5); // meters
  const [letterHeight, setLetterHeight] = useState(8); // meters
  const [letterSpacing, setLetterSpacing] = useState(2); // meters

  const handleConfirm = () => {
    if (!text.trim()) {
      return;
    }

    onConfirm(text.trim(), alignment, letterWidth, letterHeight, letterSpacing);
    
    // Reset state
    setText('');
    setAlignment('center');
    setLetterWidth(5);
    setLetterHeight(8);
    setLetterSpacing(2);
    onClose();
  };

  const handleCancel = () => {
    setText('');
    setAlignment('center');
    setLetterWidth(5);
    setLetterHeight(8);
    setLetterSpacing(2);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>📝</Text>
            <Text style={styles.headerTitle}>TEXT ANNOTATION</Text>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Text Input */}
            <View style={styles.section}>
              <Text style={styles.label}>Enter Text</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { textAlign: alignment },
                ]}
                value={text}
                onChangeText={setText}
                placeholder="Type your text here..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                autoFocus
              />
            </View>

            {/* Text Alignment */}
            <View style={styles.section}>
              <Text style={styles.label}>Text Alignment</Text>
              <View style={styles.alignmentButtons}>
                <TouchableOpacity
                  style={[
                    styles.alignBtn,
                    alignment === 'left' && styles.alignBtnActive,
                  ]}
                  onPress={() => setAlignment('left')}
                >
                  <Text style={styles.alignIcon}>⬅️</Text>
                  <Text style={styles.alignLabel}>Left</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.alignBtn,
                    alignment === 'center' && styles.alignBtnActive,
                  ]}
                  onPress={() => setAlignment('center')}
                >
                  <Text style={styles.alignIcon}>↕️</Text>
                  <Text style={styles.alignLabel}>Center</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.alignBtn,
                    alignment === 'right' && styles.alignBtnActive,
                  ]}
                  onPress={() => setAlignment('right')}
                >
                  <Text style={styles.alignIcon}>➡️</Text>
                  <Text style={styles.alignLabel}>Right</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Letter Dimensions */}
            <View style={styles.section}>
              <Text style={styles.label}>Letter Width: {letterWidth}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterWidth(Math.max(1, letterWidth - 1))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.dimValue}>
                  <Text style={styles.dimValueText}>{letterWidth}m</Text>
                </View>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterWidth(Math.min(50, letterWidth + 1))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Letter Height: {letterHeight}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterHeight(Math.max(1, letterHeight - 1))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.dimValue}>
                  <Text style={styles.dimValueText}>{letterHeight}m</Text>
                </View>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterHeight(Math.min(50, letterHeight + 1))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Letter Spacing: {letterSpacing}m</Text>
              <View style={styles.dimensionRow}>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterSpacing(Math.max(0, letterSpacing - 0.5))}
                >
                  <Text style={styles.dimBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.dimValue}>
                  <Text style={styles.dimValueText}>{letterSpacing}m</Text>
                </View>
                <TouchableOpacity
                  style={styles.dimBtn}
                  onPress={() => setLetterSpacing(Math.min(20, letterSpacing + 0.5))}
                >
                  <Text style={styles.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Preview */}
            <View style={styles.section}>
              <Text style={styles.label}>Preview</Text>
              <View style={styles.previewBox}>
                <Text
                  style={[
                    styles.previewFullText,
                    { textAlign: alignment },
                  ]}
                >
                  {text || 'Your text will appear here'}
                </Text>
                <Text style={styles.dimensionInfo}>
                  {text.length} char(s) × {letterWidth}m wide × {letterHeight}m tall
                </Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Text will be converted to marking points path on the map
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.confirmBtn,
                !text.trim() && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!text.trim()}
            >
              <Text style={styles.confirmBtnText}>✓ Create Text Path</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.panelBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textAlign: 'center',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  alignmentButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  alignBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  alignBtnActive: {
    backgroundColor: 'rgba(103, 232, 249, 0.15)',
    borderColor: colors.accent,
  },
  alignIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  alignLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dimensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dimBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  dimValue: {
    flex: 1,
    height: 40,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  previewBox: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    minHeight: 80,
    justifyContent: 'center',
  },
  previewFullText: {
    color: colors.text,
    marginBottom: 8,
  },
  dimensionInfo: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
  },
  infoText: {
    fontSize: 11,
    color: colors.accent,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmBtn: {
    backgroundColor: colors.greenBtn,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.inputBg,
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
});
