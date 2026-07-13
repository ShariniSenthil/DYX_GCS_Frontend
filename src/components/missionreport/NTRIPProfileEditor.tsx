/**
 * NTRIP Profile Editor Screen
 * Add new or edit existing NTRIP profile credentials
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { NTRIPProfile, NTRIPProfileCreate } from '../../types/ntrip';
import * as NTRIPStorage from '../../services/ntripProfileStorage';

interface Props {
  profile?: NTRIPProfile | null; // If provided, edit mode; otherwise, create mode
  onSave: (profile: NTRIPProfile) => void;
  onCancel: () => void;
}

export const NTRIPProfileEditor: React.FC<Props> = ({ profile, onSave, onCancel }) => {
  const isEditMode = !!profile;
  
  const [formData, setFormData] = useState<NTRIPProfileCreate>({
    name: profile?.name || '',
    casterAddress: profile?.casterAddress || '',
    port: profile?.port || '2101',
    mountpoint: profile?.mountpoint || '',
    username: profile?.username || '',
    password: profile?.password || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof NTRIPProfileCreate, string>>>({});

  const handleInputChange = (field: keyof NTRIPProfileCreate, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof NTRIPProfileCreate, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Profile name is required';
    }

    if (!formData.casterAddress.trim()) {
      newErrors.casterAddress = 'Caster address is required';
    }

    if (!formData.port.trim()) {
      newErrors.port = 'Port is required';
    } else if (!/^\d+$/.test(formData.port) || parseInt(formData.port) < 1 || parseInt(formData.port) > 65535) {
      newErrors.port = 'Port must be a number between 1 and 65535';
    }

    if (!formData.mountpoint.trim()) {
      newErrors.mountpoint = 'Mountpoint is required';
    }

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    setIsSaving(true);

    try {
      let savedProfile: NTRIPProfile;

      if (isEditMode && profile) {
        // Update existing profile
        const updated = await NTRIPStorage.updateProfile(profile.id, formData);
        if (!updated) {
          throw new Error('Failed to update profile');
        }
        savedProfile = updated;
      } else {
        // Create new profile
        savedProfile = await NTRIPStorage.createProfile(formData);
      }

      Alert.alert(
        'Success',
        isEditMode ? 'Profile updated successfully' : 'Profile created successfully',
        [{ text: 'OK', onPress: () => onSave(savedProfile) }]
      );
    } catch (error) {
      console.error('[NTRIPProfileEditor] Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditMode ? 'Edit Profile' : 'New NTRIP Profile'}
          </Text>
          <Text style={styles.subtitle}>
            {isEditMode ? 'Update profile credentials' : 'Add a new NTRIP caster profile'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Profile Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Profile Name *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="e.g., Emlid Caster - Main"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.name}
              onChangeText={(value) => handleInputChange('name', value)}
              autoCapitalize="words"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          {/* Caster Address */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Caster Address *</Text>
            <TextInput
              style={[styles.input, errors.casterAddress && styles.inputError]}
              placeholder="e.g., caster.emlid.com"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.casterAddress}
              onChangeText={(value) => handleInputChange('casterAddress', value)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.casterAddress && <Text style={styles.errorText}>{errors.casterAddress}</Text>}
          </View>

          {/* Port */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Port *</Text>
            <TextInput
              style={[styles.input, errors.port && styles.inputError]}
              placeholder="2101"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.port}
              onChangeText={(value) => handleInputChange('port', value)}
              keyboardType="numeric"
            />
            {errors.port && <Text style={styles.errorText}>{errors.port}</Text>}
          </View>

          {/* Mountpoint */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Mountpoint *</Text>
            <TextInput
              style={[styles.input, errors.mountpoint && styles.inputError]}
              placeholder="e.g., MP23960"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.mountpoint}
              onChangeText={(value) => handleInputChange('mountpoint', value)}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {errors.mountpoint && <Text style={styles.errorText}>{errors.mountpoint}</Text>}
          </View>

          {/* Username */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Username *</Text>
            <TextInput
              style={[styles.input, errors.username && styles.inputError]}
              placeholder="Your NTRIP username"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.username}
              onChangeText={(value) => handleInputChange('username', value)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
          </View>

          {/* Password */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password *</Text>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              placeholder="Your NTRIP password"
              placeholderTextColor={colors.textSecondary + '80'}
              value={formData.password}
              onChangeText={(value) => handleInputChange('password', value)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoText}>
              All fields are required. Credentials are stored locally on your device.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.cancelButton, isSaving && styles.buttonDisabled]}
          onPress={onCancel}
          disabled={isSaving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditMode ? 'Update Profile' : 'Create Profile'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
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
  form: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.accent + '20',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
