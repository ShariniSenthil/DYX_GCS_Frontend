// ============================================================
// CADCommandBar — AutoCAD-style command input bar
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

interface CADCommandBarProps {
  prompt: string;
  onSubmit: (text: string) => void;
  onEscape: () => void;
}

export const CADCommandBar: React.FC<CADCommandBarProps> = ({ prompt, onSubmit, onEscape }) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setText('');
  }, [prompt]);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.promptRow}>
        <Text style={styles.promptText}>{prompt}</Text>
        <TouchableOpacity onPress={onEscape} style={styles.escapeBtn}>
          <Text style={styles.escapeText}>ESC</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.inputRow}>
        <Text style={styles.inputPrefix}>{'>'}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          placeholder="Type coordinate, distance, or command..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panelBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  promptText: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    flex: 1,
  },
  escapeBtn: {
    backgroundColor: colors.redBtn + '80',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  escapeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputPrefix: {
    color: colors.greenBtn,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.inputBg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
