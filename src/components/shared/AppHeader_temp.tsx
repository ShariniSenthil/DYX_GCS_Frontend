import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../theme/colors';

interface Props {
  activeTab: 'Dashboard' | 'Marking Plan' | 'Mission Progress';
  onTabChange: (tab: 'Dashboard' | 'Marking Plan' | 'Mission Progress') => void;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  onReconnect: () => void;
  onFullscreen: () => void;
}

export const AppHeader: React.FC<Props> = ({
  activeTab,
  onTabChange,
  connectionStatus,
  onReconnect,
  onFullscreen,
}) => {
  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return { label: 'Connected', color: colors.success, animate: false };
      case 'connecting':
        return { label: 'Connecting…', color: colors.warning, animate: true };
      case 'disconnected':
        return { label: 'Disconnected', color: '#64748B', animate: false };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <View style={styles.header}>
      {/* Left: Logo and Title */}
      <View style={styles.leftSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>🔧</Text>
        </View>
        <View>
          <Text style={styles.title}>DYX Autonomous</Text>
          <Text style={styles.subtitle}>Way To Mark</Text>
        </View>
      </View>

      {/* Center: Tab Navigation */}
      <View style={styles.centerSection}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'Dashboard' && styles.tabActive]}
            onPress={() => onTabChange('Dashboard')}
          >
            <Text style={[styles.tabText, activeTab === 'Dashboard' && styles.tabTextActive]}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'Marking Plan' && styles.tabActive]}
            onPress={() => onTabChange('Marking Plan')}
          >
            <Text style={[styles.tabText, activeTab === 'Marking Plan' && styles.tabTextActive]}>
              Marking Plan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'Mission Progress' && styles.tabActive]}
            onPress={() => onTabChange('Mission Progress')}
          >
            <Text style={[styles.tabText, activeTab === 'Mission Progress' && styles.tabTextActive]}>
              Mission Progress
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Right: Status and Controls */}
      <View style={styles.rightSection}>
        {/* Connection Status */}
        <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
          <Text style={styles.statusText}>{statusConfig.label}</Text>
        </View>

        {/* Reconnect Button */}
        <TouchableOpacity style={styles.reconnectButton} onPress={onReconnect}>
          <Text style={styles.reconnectIcon}>🔌</Text>
          <Text style={styles.reconnectText}>Reconnect</Text>
        </TouchableOpacity>

        {/* Fullscreen Button */}
        <TouchableOpacity style={styles.fullscreenButton} onPress={onFullscreen}>
          <Text style={styles.fullscreenIcon}>⛶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 60,
    backgroundColor: '#002244',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(103, 232, 249, 0.3)',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoContainer: {
    width: 40,
    height: 40,
    backgroundColor: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoIcon: {
    fontSize: 20,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  centerSection: {
    flex: 2,
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#002244',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.3)',
    padding: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: 'linear-gradient(90deg, #06B6D4 0%, #3B82F6 100%)',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: colors.text,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '500',
  },
  reconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  reconnectIcon: {
    fontSize: 12,
  },
  reconnectText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  fullscreenButton: {
    padding: 8,
  },
  fullscreenIcon: {
    fontSize: 18,
    color: '#67E8F9',
  },
});
