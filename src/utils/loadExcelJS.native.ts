/**
 * Mobile reports already use CSV. Keep ExcelJS and its browser compatibility
 * dependencies out of the native bundle, including when navigator is absent.
 */
export const loadExcelJS = async (): Promise<never> => {
  throw new Error('Native mission reports use CSV export.');
};
