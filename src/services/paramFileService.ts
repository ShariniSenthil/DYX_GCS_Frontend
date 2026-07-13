/**
 * Parameter File Service
 *
 * Handles saving vehicle parameters to .param files (Mission Planner format)
 * and loading .param files back to the vehicle.
 *
 * File format: PARAM_NAME,VALUE per line, # for comments, sorted alphabetically.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { downloadFileToDevice } from '../utils/downloadHelper';
import { ParamDownloadResponse, ParamUploadResponse } from '../types/params';

interface RoverServices {
  downloadParams: () => Promise<ParamDownloadResponse>;
  uploadParams: (content: string, dryRun: boolean) => Promise<ParamUploadResponse>;
}

/**
 * Save all vehicle parameters to a .param file on the device.
 * Fetches params from backend, writes to temp file, then opens native save dialog.
 */
export async function saveParamsToFile(services: RoverServices): Promise<boolean> {
  try {
    const result = await services.downloadParams();

    if (!result.success || !result.content) {
      Alert.alert('Download Failed', result.error || 'Failed to fetch parameters from vehicle.');
      return false;
    }

    const filename = result.filename || `rover_params_${Date.now()}.param`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, result.content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const saved = await downloadFileToDevice(fileUri, filename, 'text/plain');
    return saved;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    Alert.alert('Save Failed', `Could not save parameters:\n${msg}`);
    return false;
  }
}

/**
 * Pick a .param file from device, parse it, preview changes, then apply.
 * Returns true if params were successfully written.
 */
export async function loadParamsFromFile(services: RoverServices): Promise<boolean> {
  try {
    // 1. Pick file
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (picked.canceled || !picked.assets?.length) {
      return false; // user cancelled
    }

    const fileUri = picked.assets[0].uri;
    const content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (!content || content.trim().length === 0) {
      Alert.alert('Empty File', 'The selected file contains no parameter data.');
      return false;
    }

    // 2. Dry run — preview what will change
    const preview = await services.uploadParams(content, true);

    if (!preview.success) {
      Alert.alert('Parse Failed', preview.error || 'Could not parse the parameter file.');
      return false;
    }

    const { summary } = preview;

    if (summary.changed === 0) {
      Alert.alert('No Changes', `All ${summary.matched} parameters already match the vehicle.\n\n${summary.not_found} params in file not found on vehicle.`);
      return false;
    }

    // 3. Show confirmation
    const confirmed = await new Promise<boolean>((resolve) => {
      const changeList = preview.changes
        .filter(c => c.status === 'skipped') // in dry_run, changed ones are marked skipped
        .slice(0, 15)
        .map(c => `${c.name}: ${c.old_value} → ${c.new_value}`)
        .join('\n');

      const moreText = summary.changed > 15 ? `\n...and ${summary.changed - 15} more` : '';
      const notFoundText = summary.not_found > 0 ? `\n\n${summary.not_found} params not found on vehicle.` : '';

      Alert.alert(
        'Apply Parameters?',
        `${summary.changed} of ${summary.total_in_file} parameters will be changed:\n\n${changeList}${moreText}${notFoundText}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Apply', style: 'default', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });

    if (!confirmed) return false;

    // 4. Apply for real
    const result = await services.uploadParams(content, false);

    if (!result.success) {
      Alert.alert('Upload Failed', result.error || 'Failed to write parameters to vehicle.');
      return false;
    }

    const failCount = result.summary.failed;
    if (failCount > 0) {
      Alert.alert(
        'Partial Success',
        `${result.summary.changed - failCount} params applied successfully.\n${failCount} failed: ${result.failed.join(', ')}`,
      );
    } else {
      let msg = `${result.summary.changed} parameters applied successfully.`;
      if (result.reboot_required) {
        msg += '\n\nSome parameters require a reboot to take effect.';
      }
      Alert.alert('Parameters Applied', msg);
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('cancel') && !msg.toLowerCase().includes('cancelled')) {
      Alert.alert('Load Failed', `Could not load parameters:\n${msg}`);
    }
    return false;
  }
}
