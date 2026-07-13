// ============================================================
// DXF File Adapter
// ============================================================
//
// Wraps expo-document-picker and expo-file-system to provide
// a simple async interface for picking and reading .dxf files.
//
// Requirements: 1.1, 1.2, 1.3

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

/**
 * Open a document picker restricted to .dxf files and read the
 * selected file as UTF-8 text.
 *
 * @returns { name: string; text: string } on success
 * @returns null if the user cancels the picker
 * @throws Error with the file name if the file cannot be read
 */
export async function pickDxfFile(): Promise<{ name: string; text: string } | null> {
  // Open the document picker
  const result = await DocumentPicker.getDocumentAsync({
    // Primary MIME type for DXF files; fall back to all files so the
    // user can still navigate to .dxf files on platforms that don't
    // recognise the MIME type.
    type: ['application/dxf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  // User cancelled
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name ?? 'unknown.dxf';
  const uri = asset.uri;

  // Read the file as UTF-8 text
  let text: string;
  try {
    text = await FileSystem.readAsStringAsync(uri, {
      encoding: 'utf8',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file "${fileName}": ${message}`);
  }

  return { name: fileName, text };
}
