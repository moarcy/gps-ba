import { DATE_FMT } from "./excel-utils.js";

export const TITLE_ROW = 1;
export const HEADER_ROW = 2;
export const DATA_START = 3;
export const DATA_COLUMNS = 13;

const CURRENCY_FMT = '"R$" #,##0.00';
const CURRENCY_COLS = [7, 9, 10, 11, 12, 13];
const DESPESAS_COLS = [9, 10, 11, 12];

const COLORS = {
  titleBg: "FF111827",
  titleText: "FFFFFFFF",
  headerMainBg: "FF4B5563",
  headerDespBg: "FFB91C1C",
  headerText: "FFFFFFFF",
  despesasText: "FFC00000",
  zebra: "FFF9FAFB",
  border: "FFD1D5DB",
  saldoText: "FF006100",
  saldoNegative: "FF9C0006",
  closingBg: "FFE5E7EB",
  closingText: "FF1F2937",
};

const COLUMN_WIDTHS = {
  1: 14,
  2: 13,
  3: 18,
  4: 26,
  5: 18,
  6: 13,
  7: 16,
  8: 24,
  9: 13,
  10: 13,
  11: 14,
  12: 14,
  13: 16,
};

const HEADERS = [
  "Data",
  "Loc 1",
  "Banco",
  "Assessoria",
  "Contato",
  "Placa",
  "Prêmio",
  "NF NR",
  "Apoio",
  "Loc II",
  "Guincho",
  "Imposto",
  "Saldo",
];

function thinBorder(color = COLORS.border) {
  const side = { style: "thin", color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

function mergeRow(worksheet, row, colStart, colEnd) {
  worksheet.mergeCells(row, colStart, row, colEnd);
}

function clearSheetMerges(worksheet) {
  const merges = [...(worksheet.model.merges || [])];
  for (const range of merges) {
    worksheet.unMergeCells(range);
  }
}

export function trimRowsAfter(worksheet, lastRow) {
  while (worksheet.rowCount > lastRow) {
    worksheet.spliceRows(lastRow + 1, 1);
  }
}

function paintCell(cell, { bg, text, size = 11, bold = false }) {
  cell.font = {
    name: "Aptos Narrow",
    size,
    bold,
    color: { argb: text },
  };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.border = thinBorder("FF9CA3AF");
}

export function buildControleSheetLayout(worksheet) {
  clearSheetMerges(worksheet);

  const removeCount = Math.max(worksheet.rowCount, 400) - DATA_START + 1;
  if (removeCount > 0) {
    worksheet.spliceRows(DATA_START, removeCount);
  }

  if (worksheet._rows) {
    worksheet._rows.length = HEADER_ROW;
  }

  // Linha 1 — título (única linha extra)
  mergeRow(worksheet, TITLE_ROW, 1, DATA_COLUMNS);
  const titleCell = worksheet.getCell(TITLE_ROW, 1);
  titleCell.value = "CONTROLE DE DILIGÊNCIAS  ·  GPS BA  ·  veículos";
  paintCell(titleCell, { bg: COLORS.titleBg, text: COLORS.titleText, size: 14, bold: true });
  worksheet.getRow(TITLE_ROW).height = 30;

  // Linha 2 — cabeçalhos das colunas (despesas em vermelho)
  const headerRow = worksheet.getRow(HEADER_ROW);
  headerRow.height = 26;

  HEADERS.forEach((label, index) => {
    const col = index + 1;
    const cell = headerRow.getCell(col);
    const isDespesa = DESPESAS_COLS.includes(col);

    cell.value = label;
    paintCell(cell, {
      bg: isDespesa ? COLORS.headerDespBg : COLORS.headerMainBg,
      text: COLORS.headerText,
      size: 11,
      bold: true,
    });
  });

  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    worksheet.getColumn(Number(col)).width = width;
  }

  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };

  worksheet.views = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: HEADER_ROW,
      topLeftCell: `A${DATA_START}`,
      activeCell: `A${DATA_START}`,
      zoomScale: 115,
    },
  ];
}

function saldoFontColor(value) {
  if (value == null || value === "") return COLORS.saldoText;
  return Number(value) < 0 ? COLORS.saldoNegative : COLORS.saldoText;
}

export function styleControleDataRow(row, rowNumber, { zebra = false } = {}) {
  row.height = 22;
  const bg = zebra ? COLORS.zebra : "FFFFFFFF";

  for (let col = 1; col <= DATA_COLUMNS; col++) {
    const cell = row.getCell(col);
    const isCurrency = CURRENCY_COLS.includes(col);
    const isDespesa = DESPESAS_COLS.includes(col);

    cell.font = {
      name: "Arial",
      size: 11,
      color: {
        argb:
          col === 13
            ? COLORS.saldoText
            : isDespesa
              ? COLORS.despesasText
              : "FF111827",
      },
      bold: col === 13 || isDespesa,
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };

    if (isCurrency) cell.numFmt = CURRENCY_FMT;
    if (col === 1) cell.numFmt = DATE_FMT;
  }
}

export function styleControleClosingRow(row, rowNumber) {
  row.height = 24;

  for (let col = 1; col <= DATA_COLUMNS; col++) {
    const cell = row.getCell(col);
    const isCurrency = CURRENCY_COLS.includes(col);
    const isDespesa = DESPESAS_COLS.includes(col);

    cell.font = {
      name: "Aptos Narrow",
      size: 11,
      bold: true,
      color: {
        argb: isDespesa
          ? COLORS.despesasText
          : col === 13
            ? COLORS.saldoText
            : COLORS.closingText,
      },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.closingBg },
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF6B7280" } },
      left: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "medium", color: { argb: "FF6B7280" } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };

    if (isCurrency) cell.numFmt = CURRENCY_FMT;
  }
}

export function buildFechamentosSheetLayout(worksheet, dataSheetName) {
  clearSheetMerges(worksheet);

  const removeCount = Math.max(worksheet.rowCount, 50) - DATA_START + 1;
  if (removeCount > 0) {
    worksheet.spliceRows(DATA_START, removeCount);
  }
  if (worksheet._rows) {
    worksheet._rows.length = HEADER_ROW;
  }

  mergeRow(worksheet, TITLE_ROW, 1, DATA_COLUMNS);
  const titleCell = worksheet.getCell(TITLE_ROW, 1);
  titleCell.value = `FECHAMENTOS MENSAIS  ·  GPS BA  ·  origem: ${dataSheetName}`;
  paintCell(titleCell, { bg: COLORS.titleBg, text: COLORS.titleText, size: 14, bold: true });
  worksheet.getRow(TITLE_ROW).height = 30;

  const headerRow = worksheet.getRow(HEADER_ROW);
  headerRow.height = 26;
  const closingHeaders = [
    "Mês / período",
    "",
    "",
    "",
    "",
    "",
    "Prêmio",
    "",
    "Apoio",
    "Loc II",
    "Guincho",
    "Imposto",
    "Saldo",
  ];

  closingHeaders.forEach((label, index) => {
    const col = index + 1;
    const cell = headerRow.getCell(col);
    const isDespesa = DESPESAS_COLS.includes(col);
    cell.value = label;
    paintCell(cell, {
      bg: isDespesa ? COLORS.headerDespBg : COLORS.headerMainBg,
      text: COLORS.headerText,
      size: 11,
      bold: true,
    });
  });

  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    worksheet.getColumn(Number(col)).width = width;
  }

  worksheet.views = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: HEADER_ROW,
      topLeftCell: `A${DATA_START}`,
      activeCell: `A${DATA_START}`,
      zoomScale: 115,
    },
  ];
}

export function applySaldoConditionalFormatting(worksheet, lastDataRow) {
  if (lastDataRow < DATA_START) return;

  worksheet.conditionalFormattings = [];

  worksheet.addConditionalFormatting({
    ref: `M${DATA_START}:M${lastDataRow}`,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: ["0"],
        style: {
          font: { color: { argb: COLORS.saldoNegative }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "greaterThanOrEqual",
        formulae: ["0"],
        style: {
          font: { color: { argb: COLORS.saldoText }, bold: true },
        },
      },
    ],
  });
}

export function applyControleAutoFilter(worksheet, lastDataRow) {
  if (lastDataRow >= DATA_START) {
    worksheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: lastDataRow, column: DATA_COLUMNS },
    };
  }
}
