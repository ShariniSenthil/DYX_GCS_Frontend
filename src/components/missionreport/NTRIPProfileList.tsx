/**
 * NTRIP Profile List Screen
 * Shows saved profiles with connect and edit options
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../theme/colors';
import { NTRIPProfile } from '../../types/ntrip';
import * as NTRIPStorage from '../../services/ntripProfileStorage';

interface Props {
  onSelectProfile: (profile: NTRIPProfile) => void;
  onAddNew: () => void;
  onEditProfile: (profile: NTRIPProfile) => void;
  isConnecting?: boolean;
  activeProfileId?: string | null;
  isStreamRunning?: boolean;
}

export const NTRIPProfileList: React.FC<Props> = ({
  onSelectProfile,
  onAddNew,
  onEditProfile,
  isConnecting = false,
  activeProfileId = null,
  isStreamRunning = false,
}) => {
  const [profiles, setProfiles] = useState<NTRIPProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const loadedProfiles = await NTRIPStorage.getAllProfiles();
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('[NTRIPProfileList] Error loading profiles:', error);
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (profile: NTRIPProfile) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete "${profile.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(profile.id);
              await NTRIPStorage.deleteProfile(profile.id);
              await loadProfiles();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete profile');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading profiles...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>NTRIP Profiles</Text>
        <Text style={styles.subtitle}>
          {profiles.length} saved {profiles.length === 1 ? 'profile' : 'profiles'}
        </Text>
      </View>

      {/* Profile List */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {profiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyText}>No profiles saved</Text>
            <Text style={styles.emptySubtext}>
              Add your first NTRIP profile to get started
            </Text>
          </View>
        ) : (
          profiles.map((profile) => (
            <View key={profile.id} style={styles.profileCard}>
              {/* Profile Info */}
              <View style={styles.profileHeader}>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  <Text style={styles.profileDetail}>
                    {profile.casterAddress}:{profile.port}
                  </Text>
                  <Text style={styles.profileDetail}>
                    Mount: {profile.mountpoint}
                  </Text>
                </View>
                
                {/* Active Indicator */}
                {activeProfileId === profile.id && (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Active</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.profileActions}>
                <TouchableOpacity
                  style={[
                    styles.connectButton,
                    (isConnecting || deletingId === profile.id) && styles.buttonDisabled,
                    isStreamRunning && activeProfileId === profile.id && styles.connectButtonActive,
                  ]}
                  onPress={() => onSelectProfile(profile)}
                  disabled={isConnecting || deletingId === profile.id}
                >
                  {isConnecting && activeProfileId === profile.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.connectButtonText}>
                      {isStreamRunning && activeProfileId === profile.id ? 'Connected' : 'Connect'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.editButton,
                    (isConnecting || deletingId === profile.id) && styles.buttonDisabled,
                  ]}
                  onPress={() => onEditProfile(profile)}
                  disabled={isConnecting || deletingId === profile.id}
                >
                  {deletingId === profile.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={styles.editButtonText}>✏️ Edit</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.deleteButton,
                    (isConnecting || deletingId === profile.id) && styles.buttonDisabled,
                  ]}
                  onPress={() => handleDelete(profile)}
                  disabled={isConnecting || deletingId === profile.id}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add New Button */}
      <TouchableOpacity
        style={[styles.addButton, isConnecting && styles.buttonDisabled]}
        onPress={onAddNew}
        disabled={isConnecting}
      >
        <Text style={styles.addButtonIcon}>+</Text>
        <Text style={styles.addButtonText}>Add New Profile</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  profileCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
  },
  profileDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  activeText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  profileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  connectButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  connectButtonActive: {
    backgroundColor: colors.success,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  editButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: colors.danger + '20',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'solid',
  },
  addButtonIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
