/** Web/Node spreadsheet exports; Metro selects the native sibling on mobile. */
export const loadExcelJS = async (): Promise<typeof import('exceljs')> => {
  const excel = await import('exceljs');
  return excel.default || excel;
};
