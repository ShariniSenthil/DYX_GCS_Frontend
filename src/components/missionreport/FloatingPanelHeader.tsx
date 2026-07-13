import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  title: string;
  onClose?: () => void;
  dragGesture?: any;
  isDraggingActive?: boolean;
}

export const FloatingPanelHeader: React.FC<Props> = ({ title, onClose, dragGesture }) => (
  <GestureDetector gesture={dragGesture}>
    <View style={styles.header}>
      <View style={styles.left}>
        <MaterialCommunityIcons name="dots-grid" size={16} color="#475569" />
        <Text style={styles.title}>{title}</Text>
      </View>
      {onClose && (
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <MaterialCommunityIcons name="close" size={14} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </View>
  </GestureDetector>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#08101a',
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(103,232,249,0.1)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { color: '#E5F1FF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
