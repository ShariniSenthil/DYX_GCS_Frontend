/**
 * Export Helpers for Mission Report
 * Generates Excel (.xlsx) and PDF files for mobile devices
 */

// Avoid importing exceljs at module scope in React Native to prevent bundle/runtime issues.
// We'll attempt a dynamic import when needed and fall back to CSV in native environments.

export interface ExportData {
  'S/N': number;
  'ROW': string;
  'BLOCK': string;
  'PILE': string | number;
  'Latitude': number;
  'Longitude': number;
  'Altitude': number;
  'Status': string;
  'Timestamp': string;
  'Remark': string;
}

export interface MissionStats {
  totalPoints: number;
  completedPoints: number;
  pendingPoints: number;
  errorPoints: number;
  successRate: string;
  missionDuration: string;
  errorLocations: string[];
}

/**
 * Generate Excel (.xlsx) file with professional formatting
 * @returns ArrayBuffer that can be written to file system
 */
export const generateExcel = async (
  data: ExportData[],
  stats: MissionStats,
  missionMode: string | null
): Promise<ArrayBuffer> => {
  // Detect React Native environment (no DOM/window or navigator.product === 'ReactNative')
  const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

  if (isReactNative) {
    // Fallback: generate CSV content instead of Excel (xlsx) in React Native
    // This avoids exceljs dependency which is Node.js/Browser oriented
    const headers = ['S/N','ROW','BLOCK','PILE','Latitude','Longitude','Altitude','Status','Timestamp','Remark'];
    const rows = data.map(row => [
      row['S/N'],
      row.ROW,
      row.BLOCK,
      row.PILE,
      row.Latitude,
      row.Longitude,
      row.Altitude,
      row.Status,
      row.Timestamp,
      row.Remark,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    // Convert CSV string to ArrayBuffer
    const utf8 = new TextEncoder ? new TextEncoder().encode(csv) : Uint8Array.from(csv.split('').map(c => c.charCodeAt(0)));
    return utf8.buffer as ArrayBuffer;
  }

  // Web/Node: try dynamic import of exceljs
  let ExcelJS: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
  } catch (err) {
    // If exceljs cannot be imported, fall back to CSV
    const headers = ['S/N','ROW','BLOCK','PILE','Latitude','Longitude','Altitude','Status','Timestamp','Remark'];
    const rows = data.map(row => [
      row['S/N'],
      row.ROW,
      row.BLOCK,
      row.PILE,
      row.Latitude,
      row.Longitude,
      row.Altitude,
      row.Status,
      row.Timestamp,
      row.Remark,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const utf8 = new TextEncoder ? new TextEncoder().encode(csv) : Uint8Array.from(csv.split('').map(c => c.charCodeAt(0)));
    return utf8.buffer as ArrayBuffer;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Mission Report');

  let currentRow = 1;

  // Header - Mission Report Title (navy blue background)
  worksheet.mergeCells(`A${currentRow}:J${currentRow + 1}`);
  const titleCell = worksheet.getCell(`A${currentRow}`);
  titleCell.value = 'WAY TO MARK - MISSION REPORT';
  titleCell.font = { size: 30, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF001F3F' } // navy blue
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 25;
  worksheet.getRow(currentRow + 1).height = 25;
  currentRow += 2;

  // Date and Mode
  currentRow++;
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const dateCell = worksheet.getCell(`A${currentRow}`);
  const dateStr = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  dateCell.value = `Generated: ${dateStr} | Mode: ${missionMode?.toUpperCase() ?? 'UNKNOWN'}`;
  dateCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 18;
  currentRow += 2;

  // Mission Summary Header
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const summaryHeaderCell = worksheet.getCell(`A${currentRow}`);
  summaryHeaderCell.value = 'MISSION SUMMARY';
  summaryHeaderCell.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } };
  summaryHeaderCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF9FAFB' }
  };
  summaryHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summaryHeaderCell.border = {
    top: { style: 'medium' },
    left: { style: 'medium' },
    right: { style: 'medium' },
    bottom: { style: 'thin' }
  };
  worksheet.getRow(currentRow).height = 22;
  currentRow++;

  // Summary Content
  const summaryData = [
    { label: 'Total Waypoints:', value: stats.totalPoints.toString(), color: 'FF000000' },
    { label: 'Completed:', value: stats.completedPoints.toString(), color: 'FF10B981' },
    { label: 'Pending:', value: stats.pendingPoints.toString(), color: 'FFF59E0B' },
    { label: 'Error Count:', value: stats.errorPoints.toString(), color: 'FFEF4444' },
    { label: 'Success Rate:', value: `${stats.successRate}%`, color: 'FF10B981' },
    { label: 'Mission Timing:', value: stats.missionDuration, color: 'FF000000' },
  ];

  summaryData.forEach((item, idx) => {
    // Label in columns A-D
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
    const labelCell = worksheet.getCell(`A${currentRow}`);
    labelCell.value = item.label;
    labelCell.font = { bold: true, size: 10 };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    labelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FAFB' }
    };

    // Apply borders to all cells in label merge
    for (let col = 1; col <= 4; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        left: col === 1 ? { style: 'medium' } : { style: 'thin' },
        right: col === 4 ? { style: 'thin' } : undefined,
        top: { style: 'thin' },
        bottom: idx === summaryData.length - 1 ? { style: 'medium' } : { style: 'thin' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }
      };
    }

    // Value in columns E-J
    worksheet.mergeCells(`E${currentRow}:J${currentRow}`);
    const valueCell = worksheet.getCell(`E${currentRow}`);
    valueCell.value = item.value;
    valueCell.font = { size: 10, color: { argb: item.color }, bold: item.color !== 'FF000000' };
    valueCell.alignment = { horizontal: 'left', vertical: 'middle' };
    valueCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF9FAFB' }
    };

    // Apply borders to all cells in value merge
    for (let col = 5; col <= 10; col++) {
      const cell = worksheet.getCell(currentRow, col);
      cell.border = {
        left: col === 5 ? { style: 'thin' } : undefined,
        right: col === 10 ? { style: 'medium' } : { style: 'thin' },
        top: { style: 'thin' },
        bottom: idx === summaryData.length - 1 ? { style: 'medium' } : { style: 'thin' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }
      };
    }

    worksheet.getRow(currentRow).height = 20;
    currentRow++;
  });

  // Error Locations
  if (stats.errorLocations.length > 0) {
    currentRow++;
    worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
    const errorHeaderCell = worksheet.getCell(`A${currentRow}`);
    errorHeaderCell.value = 'Error Locations:';
    errorHeaderCell.font = { bold: true, size: 10, color: { argb: 'FFEF4444' } };
    errorHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(currentRow).height = 16;
    currentRow++;

    stats.errorLocations.forEach(loc => {
      worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
      const errorCell = worksheet.getCell(`A${currentRow}`);
      errorCell.value = `  • ${loc}`;
      errorCell.font = { size: 9, color: { argb: 'FF6B7280' } };
      errorCell.alignment = { horizontal: 'left', vertical: 'middle' };
      worksheet.getRow(currentRow).height = 15;
      currentRow++;
    });
  }

  // Watermark row
  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const watermarkCell = worksheet.getCell(`A${currentRow}`);
  watermarkCell.value = 'Way 2 Mark';
  watermarkCell.font = { size: 46, bold: true, color: { argb: '30808080' } };
  watermarkCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 50;
  currentRow += 2;

  // Waypoints Table Header
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const tableHeaderCell = worksheet.getCell(`A${currentRow}`);
  tableHeaderCell.value = 'MISSION WAYPOINTS LOG';
  tableHeaderCell.font = { size: 12, bold: true, color: { argb: 'FF1F2937' } };
  tableHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(currentRow).height = 20;
  currentRow += 2;

  // Table column headers
  const headerRow = worksheet.getRow(currentRow);
  const headers = ['S/N', 'ROW', 'BLOCK', 'PILE', 'Latitude', 'Longitude', 'Altitude', 'Status', 'Timestamp', 'Remark'];
  const columnWidths = [8, 10, 10, 10, 12, 12, 10, 12, 15, 20];

  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D3748' }
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getColumn(idx + 1).width = columnWidths[idx];
  });
  headerRow.height = 20;
  currentRow++;

  // Add data rows
  data.forEach((row, index) => {
    const dataRow = worksheet.getRow(currentRow);
    const values = [
      row['S/N'],
      row.ROW,
      row.BLOCK,
      row.PILE,
      row.Latitude,
      row.Longitude,
      row.Altitude,
      row.Status,
      row.Timestamp,
      row.Remark
    ];

    values.forEach((value, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      cell.value = value;

      const fillColor = index % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillColor }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Status column special styling
      if (colIdx === 7) {
        if (row.Status === 'Completed' || row.Status === 'Marked') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF10B981' }
          };
          cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        } else if (row.Status === 'Reached') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF59E0B' }
          };
          cell.font = { color: { argb: 'FF000000' } };
        } else if (row.Status === 'Skipped') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEF4444' }
          };
          cell.font = { color: { argb: 'FFFFFFFF' } };
        } else if (row.Status === 'Pending') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF94A3B8' }
          };
          cell.font = { color: { argb: 'FFFFFFFF' } };
        }
      }
    });

    currentRow++;
  });

  // Footer
  currentRow += 2;
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  const footerCell = worksheet.getCell(`A${currentRow}`);
  footerCell.value = `NFROS - Mission Report | Total: ${stats.totalPoints} | Completed: ${stats.completedPoints} | Success: ${stats.successRate}%`;
  footerCell.font = { size: 9, color: { argb: 'FFFFFFFF' }, bold: true };
  footerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF001F3F' } // navy blue
  };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Generate and return buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Generate HTML content for PDF conversion
 * This HTML will be converted to PDF using react-native-html-to-pdf
 */
export const generatePDFHTML = (
  data: ExportData[],
  stats: MissionStats,
  missionMode: string | null
): string => {
  const dateStr = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const tableRows = data
    .map(
      (row, idx) => `
    <tr style="${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
      <td style="padding: 8px; text-align: center; font-weight: bold; border: 1px solid #f0f0f0;">${row['S/N']}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.ROW}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.BLOCK}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.PILE}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.Latitude}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.Longitude}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.Altitude}</td>
      <td style="padding: 8px; text-align: center; font-weight: bold; border: 1px solid #f0f0f0; color: ${getStatusColor(row.Status)};">${row.Status}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.Timestamp === '-' ? '—' : row.Timestamp}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #f0f0f0;">${row.Remark === '-' ? '—' : row.Remark}</td>
    </tr>
  `
    )
    .join('');

  const errorLocationsList =
    stats.errorLocations.length > 0
      ? `
    <div style="margin: 20px 0; padding: 15px; background-color: #fee; border-left: 4px solid #dc2626; border-radius: 4px;">
      <h3 style="margin: 0 0 10px 0; color: #dc2626; font-size: 14px;">⚠ Error Locations:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #666;">
        ${stats.errorLocations.map(loc => `<li>${loc}</li>`).join('')}
      </ul>
    </div>
  `
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mission Report - ${dateStr}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #fff;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
    }
    .header {
      background-color: #001F3F;
      color: white;
      padding: 30px;
      text-align: center;
      margin: 0 0 30px 0;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 12px;
      opacity: 0.9;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background-color: #f7f7f7;
      border: 1px solid #dcdcdc;
      border-radius: 8px;
      padding: 15px;
    }
    .summary-card h3 {
      margin: 0 0 8px 0;
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
      font-weight: 600;
    }
    .summary-card p {
      margin: 0;
      font-size: 20px;
      font-weight: bold;
      color: #1a1a1a;
    }
    .summary-card.success p { color: #22863a; }
    .summary-card.warning p { color: #f59e0b; }
    .summary-card.error p { color: #dc2626; }
    h2 {
      font-size: 18px;
      color: #1a1a1a;
      margin: 30px 0 15px 0;
      border-left: 4px solid #001F3F;
      padding-left: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    th {
      background-color: #001F3F;
      color: white;
      padding: 10px 8px;
      text-align: center;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      border: 1px solid #001F3F;
    }
    td {
      border: 1px solid #f0f0f0;
      padding: 8px;
      text-align: center;
      color: #333;
    }
    .footer {
      background-color: #001F3F;
      color: white;
      padding: 15px;
      text-align: center;
      margin: 30px 0 0 0;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>WAY TO MARK   — MISSION REPORT</h1>
      <p>Generated: ${dateStr} | Mode: ${missionMode?.toUpperCase() ?? 'UNKNOWN'}</p>
    </div>

    <h2>📊 MISSION SUMMARY</h2>
    <div class="summary">
      <div class="summary-card">
        <h3>Total Waypoints</h3>
        <p>${stats.totalPoints}</p>
      </div>
      <div class="summary-card success">
        <h3>Completed</h3>
        <p>${stats.completedPoints}</p>
      </div>
      <div class="summary-card warning">
        <h3>Pending</h3>
        <p>${stats.pendingPoints}</p>
      </div>
      <div class="summary-card error">
        <h3>Errors</h3>
        <p>${stats.errorPoints}</p>
      </div>
      <div class="summary-card success">
        <h3>Success Rate</h3>
        <p>${stats.successRate}%</p>
      </div>
      <div class="summary-card">
        <h3>Mission Duration</h3>
        <p style="font-size: 14px;">${stats.missionDuration}</p>
      </div>
    </div>

    ${errorLocationsList}

    <h2>✦ MISSION WAYPOINTS LOG</h2>
    <table>
      <thead>
        <tr>
          <th>S/N</th>
          <th>Row</th>
          <th>Block</th>
          <th>Pile</th>
          <th>Latitude</th>
          <th>Longitude</th>
          <th>Altitude</th>
          <th>Status</th>
          <th>Timestamp</th>
          <th>Remark</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="footer">
      Generated Automatically by  DYX Agent — Total: ${stats.totalPoints} | Completed: ${stats.completedPoints} | Success: ${stats.successRate}%
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Get color for status display
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'Completed':
    case 'Marked':
      return '#22863a'; // green
    case 'Reached':
      return '#f59e0b'; // amber
    case 'Skipped':
      return '#dc2626'; // red
    case 'Pending':
    default:
      return '#6b7280'; // gray
  }
}
