import AsyncStorage from '@react-native-async-storage/async-storage';
import { SolarTemplate } from '../utils/solarTableGenerator';

const KEY_PREFIX = 'solar_tpl_';
const INDEX_KEY = 'solar_tpl_index';

const isValidTemplate = (obj: unknown): obj is SolarTemplate =>
  obj !== null &&
  typeof obj === 'object' &&
  typeof (obj as Record<string, unknown>).id === 'string' &&
  typeof (obj as Record<string, unknown>).name === 'string' &&
  typeof (obj as Record<string, unknown>).params === 'object';

export const TemplateStorage = {
  async saveTemplate(template: SolarTemplate): Promise<void> {
    try {
      // Update the index first
      const index = await TemplateStorage._loadIndex();
      if (!index.includes(template.id)) {
        index.push(template.id);
        await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      }
      // Then save the template data
      await AsyncStorage.setItem(
        KEY_PREFIX + template.id,
        JSON.stringify(template),
      );
    } catch (e) {
      console.error('[TemplateStorage] saveTemplate failed:', e);
      throw new Error('Failed to save template. Storage may be full.');
    }
  },

  async loadAllTemplates(): Promise<SolarTemplate[]> {
    try {
      const ids = await TemplateStorage._loadIndex();
      const templates: SolarTemplate[] = [];

      for (const id of ids) {
        const raw = await AsyncStorage.getItem(KEY_PREFIX + id);
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (isValidTemplate(parsed)) {
              templates.push(parsed);
            } else {
              console.warn('[TemplateStorage] Skipping corrupted template:', id);
            }
          } catch {
            // Skip malformed JSON entries
          }
        }
      }

      // Sort by createdAt descending (newest first)
      templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return templates;
    } catch (e) {
      console.warn('[TemplateStorage] loadAllTemplates failed:', e);
      return [];
    }
  },

  async deleteTemplate(id: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEY_PREFIX + id);

      const existingIds = await TemplateStorage._loadIndex();
      const updatedIds = existingIds.filter((existing) => existing !== id);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(updatedIds));
    } catch (e) {
      console.error('[TemplateStorage] deleteTemplate failed:', e);
      throw new Error('Failed to delete template.');
    }
  },

  async getTemplate(id: string): Promise<SolarTemplate | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY_PREFIX + id);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isValidTemplate(parsed) ? parsed : null;
    } catch (e) {
      console.warn('[TemplateStorage] getTemplate failed:', e);
      return null;
    }
  },

  async _loadIndex(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  },
};