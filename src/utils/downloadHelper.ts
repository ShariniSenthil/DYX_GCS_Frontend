import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

// Constants for file handling safety
const MAX_FILE_SIZE_MB = 100; // Maximum file size to prevent memory issues
const SUPPORTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/csv',
  'application/json',
  'text/plain',
];

/**
 * Validates file before download to prevent crashes
 */
const validateFileForDownload = async (fileUri: string, filename: string, mimeType: string): Promise<void> => {
  try {
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(fileUri);

    if (!fileInfo.exists) {
      throw new Error('File does not exist or could not be accessed');
    }

    // Check file size
    if (fileInfo.size !== undefined) {
      const fileSizeInMB = fileInfo.size / (1024 * 1024);
      if (fileSizeInMB > MAX_FILE_SIZE_MB) {
        throw new Error(`File size (${fileSizeInMB.toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)`);
      }
      console.log(`[DownloadHelper] File size: ${fileSizeInMB.toFixed(2)}MB`);
    }

    // Validate filename
    if (!filename || filename.length === 0) {
      throw new Error('Invalid filename');
    }

    // Validate MIME type
    if (!mimeType || mimeType.length === 0) {
      console.warn('[DownloadHelper] MIME type not provided, using application/octet-stream');
    }

  } catch (error) {
    console.error('[DownloadHelper] File validation failed:', error);
    throw new Error(`File validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Downloads a file to device storage using Storage Access Framework (Android) or Share (iOS)
 * Enhanced with comprehensive crash protection and error recovery
 * On Android: Opens native file picker to let user choose save location
 * On iOS: Uses share dialog with "Save to Files" option
 * @param fileUri - The local file URI to download
 * @param filename - The filename to save as
 * @param mimeType - The MIME type of the file
 */
export const downloadFileToDevice = async (
  fileUri: string,
  filename: string,
  mimeType: string,
): Promise<boolean> => {
  try {
    console.log('[DownloadHelper] Starting save operation');
    console.log('[DownloadHelper] File:', filename);
    console.log('[DownloadHelper] URI:', fileUri);
    console.log('[DownloadHelper] Platform:', Platform.OS);
    console.log('[DownloadHelper] MIME type:', mimeType);

    // Validate inputs
    if (!fileUri || typeof fileUri !== 'string') {
      throw new Error('Invalid file URI provided');
    }

    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename provided');
    }

    // Validate file before proceeding
    await validateFileForDownload(fileUri, filename, mimeType);

    if (Platform.OS === 'android') {
      // Android: Use Storage Access Framework (native file picker)
      try {
        console.log('[DownloadHelper] Requesting directory permissions...');
        // Request permissions to create file in user-selected directory
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted) {
          console.log('[DownloadHelper] User denied directory access');
          Alert.alert(
            'Permission Denied',
            'Storage access is required to save files. You can still use the Share option to send the file to other apps.',
          );
          return false;
        }

        console.log('[DownloadHelper] Directory permission granted:', permissions.directoryUri);

        // Read the file content as base64 with error handling
        let fileContent: string;
        try {
          console.log('[DownloadHelper] Reading file content...');
          fileContent = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log('[DownloadHelper] File content read successfully, length:', fileContent.length);
        } catch (readError) {
          console.error('[DownloadHelper] Failed to read file:', readError);
          throw new Error(`Failed to read file: ${readError instanceof Error ? readError.message : String(readError)}`);
        }

        // Create the file in the selected directory
        let newFileUri: string;
        try {
          console.log('[DownloadHelper] Creating file in selected directory...');
          newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            mimeType
          );
          console.log('[DownloadHelper] File created:', newFileUri);
        } catch (createError) {
          console.error('[DownloadHelper] Failed to create file:', createError);
          throw new Error(`Failed to create file: ${createError instanceof Error ? createError.message : String(createError)}`);
        }

        // Write the content to the new file
        try {
          console.log('[DownloadHelper] Writing file content...');
          await FileSystem.writeAsStringAsync(newFileUri, fileContent, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log('[DownloadHelper] File written successfully');
        } catch (writeError) {
          console.error('[DownloadHelper] Failed to write file:', writeError);
          throw new Error(`Failed to write file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
        }

        console.log('[DownloadHelper] File saved successfully to device');

        Alert.alert(
          'File Saved',
          `✅ ${filename}\n\nFile saved successfully to your selected folder!`,
          [{ text: 'OK' }]
        );

        return true;
      } catch (androidError) {
        console.error('[DownloadHelper] Android SAF error:', androidError);

        // Check if user cancelled
        if (
          androidError instanceof Error &&
          (androidError.message.includes('cancel') ||
           androidError.message.includes('User rejected'))
        ) {
          console.log('[DownloadHelper] User cancelled file picker');
          return false;
        }

        // If SAF fails, fallback to share dialog
        console.log('[DownloadHelper] Falling back to share dialog due to SAF error');
        throw new Error('SAF_FALLBACK');
      }
    } else {
      // iOS: Use share dialog with "Save to Files" option
      try {
        console.log('[DownloadHelper] Checking share availability...');
        const canShare = await Sharing.isAvailableAsync();

        if (!canShare) {
          Alert.alert(
            'Sharing Not Available',
            'File sharing is not available on this device.',
          );
          return false;
        }

        console.log('[DownloadHelper] Opening share dialog...');
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Save ${filename}`,
          UTI: mimeType,
        });

        console.log('[DownloadHelper] Share dialog completed');
        // Note: We can't reliably detect if user saved or cancelled on iOS
        return true;
      } catch (iosError) {
        console.error('[DownloadHelper] iOS sharing error:', iosError);
        throw iosError;
      }
    }
  } catch (error) {
    console.error('[DownloadHelper] Download error:', error);

    // Handle specific error cases
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'SAF_FALLBACK') {
      // Try share dialog as fallback for Android
      try {
        console.log('[DownloadHelper] Attempting share dialog fallback...');
        const canShare = await Sharing.isAvailableAsync();

        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType,
            dialogTitle: `Save ${filename}`,
          });
          return true;
        }
      } catch (fallbackError) {
        console.error('[DownloadHelper] Fallback share also failed:', fallbackError);
      }
    }

    // Display user-friendly error message
    let userMessage = 'Could not save file to device.';

    if (errorMessage.includes('Permission')) {
      userMessage = 'Storage permission denied. Please grant storage access to save files.';
    } else if (errorMessage.includes('size')) {
      userMessage = errorMessage; // Use the specific size error message
    } else if (errorMessage.includes('File does not exist')) {
      userMessage = 'File could not be accessed. It may have been deleted or moved.';
    } else if (errorMessage.includes('validation')) {
      userMessage = errorMessage; // Use the specific validation error
    }

    Alert.alert(
      'Save Failed',
      `${userMessage}\n\nTechnical details: ${errorMessage}`,
      [{ text: 'OK' }]
    );

    return false;
  }
};

/**
 * Get appropriate MIME type for file extension
 */
export const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv';
    case 'dxf':
      return 'application/dxf';
    default:
      return 'application/octet-stream';
  }
};

/**
 * Saves text content as a DXF file to device storage
 * @param content - The DXF file content as text
 * @param filename - The filename to save as (should end in .dxf)
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const saveDxfFileToDevice = async (
  content: string,
  filename: string = 'drawing.dxf'
): Promise<boolean> => {
  try {
    console.log('[DownloadHelper] Saving DXF file:', filename);

    // Ensure filename has .dxf extension
    const finalFilename = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
    const mimeType = 'application/dxf';

    // Create a temporary file
    const tempFileUri = `${FileSystem.cacheDirectory}${finalFilename}`;

    try {
      console.log('[DownloadHelper] Writing temporary file:', tempFileUri);
      await FileSystem.writeAsStringAsync(tempFileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      console.log('[DownloadHelper] Temporary file created successfully');
    } catch (writeError) {
      console.error('[DownloadHelper] Failed to write temporary file:', writeError);
      throw new Error(`Failed to create temporary file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
    }

    // Use the downloadFileToDevice function to save it
    const success = await downloadFileToDevice(tempFileUri, finalFilename, mimeType);

    // Clean up temporary file
    try {
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
      console.log('[DownloadHelper] Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('[DownloadHelper] Failed to clean up temporary file:', cleanupError);
    }

    return success;
  } catch (error) {
    console.error('[DownloadHelper] DXF save error:', error);
    throw error;
  }
};
