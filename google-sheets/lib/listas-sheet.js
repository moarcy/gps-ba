import { CANONICAL_ASSESSORIAS } from "./assessoria-rules.js";
import { CANONICAL_BANCOS, PLACEHOLDER_BANCOS } from "./banco-rules.js";
import { cellValue, normalizeText } from "./excel-utils.js";
import { DATA_START } from "./controle-sheet-theme.js";
import { CANONICAL_LOCALIZADORES } from "./localizador-rules.js";

export const LISTAS_SHEET_NAME = "Listas";

/** Linha dos títulos (Assessoria, Localizador, …) na aba Listas. */
export const LISTAS_HEADER_ROW = 3;
/** Primeira linha de valores das listas. */
export const LISTAS_DATA_START = 4;
export const LISTAS_DATA_END = 60;

const LISTAS_COLUMNS = [
  { key: "assessoria", title: "Assessoria", col: 1 },
  { key: "localizador", title: "Localizador", col: 2 },
  { key: "patio", title: "Pátio", col: 3 },
  { key: "banco", title: "Banco", col: 4 },
  { key: "formaPagamento", title: "Forma de Pagamento", col: 5 },
  { key: "statusDespesa", title: "Status Despesa", col: 6 },
  { key: "statusReceita", title: "Status Receita", col: 7 },
];

const DEFAULT_PATIOS = ["Pátio Central", "Pátio Norte", "Pátio Sul"];
const DEFAULT_FORMAS = ["NF", "PIX", "Dinheiro", "Transferência", "Outro"];
const DEFAULT_STATUS_DESPESA = ["Pago", "Pendente"];
const DEFAULT_STATUS_RECEITA = ["Recebido", "Previsto"];

function readColumnValues(ws, col) {
  const values = [];
  for (let row = LISTAS_DATA_START; row <= LISTAS_DATA_END; row++) {
    const text = normalizeText(cellValue(ws.getCell(row, col)));
    if (text) values.push(text);
  }
  return values;
}

function mergeUnique(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const raw of group || []) {
      const text = normalizeText(raw);
      if (!text) continue;
      const key = text.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  }
  return out;
}

function withoutPlaceholderBancos(values) {
  return values.filter((text) => !PLACEHOLDER_BANCOS.has(text.toUpperCase()));
}

function writeColumnValues(ws, col, values) {
  for (let i = 0; i <= LISTAS_DATA_END - LISTAS_DATA_START; i++) {
    const row = LISTAS_DATA_START + i;
    ws.getCell(row, col).value = values[i] || null;
  }
}

function clearMerges(ws) {
  const merges = [...(ws.model?.merges || [])];
  for (const range of merges) {
    try {
      ws.unMergeCells(range);
    } catch {
      // ignore ranges already cleared
    }
  }
}

function paintTitle(ws) {
  clearMerges(ws);
  ws.mergeCells(1, 1, 1, LISTAS_COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = "Listas de Apoio (reaproveitáveis nas outras abas)";
  title.font = { bold: true, size: 12, name: "Arial", color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };

  ws.mergeCells(2, 1, 2, LISTAS_COLUMNS.length);
  const help = ws.getCell(2, 1);
  help.value =
    "Preencha/edite aqui. Essas colunas alimentam os menus suspensos das outras abas.";
  help.font = { size: 10, name: "Arial", color: { argb: "FF374151" } };

  const header = ws.getRow(LISTAS_HEADER_ROW);
  for (const { title: label, col } of LISTAS_COLUMNS) {
    const cell = header.getCell(col);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4B5563" },
    };
    ws.getColumn(col).width = Math.max(18, label.length + 2);
  }
  header.commit();
}

/**
 * Garante a aba Listas (fonte dos dropdowns de Assessoria, Loc, Banco…).
 * Preserva valores já existentes, completa com canônicos e inclui extras da planilha.
 */
export function ensureListasSheet(workbook, extras = {}) {
  let ws = workbook.getWorksheet(LISTAS_SHEET_NAME);
  if (!ws) ws = workbook.addWorksheet(LISTAS_SHEET_NAME);

  paintTitle(ws);

  const existing = {
    assessoria: readColumnValues(ws, 1),
    localizador: readColumnValues(ws, 2),
    patio: readColumnValues(ws, 3),
    banco: readColumnValues(ws, 4),
    formaPagamento: readColumnValues(ws, 5),
    statusDespesa: readColumnValues(ws, 6),
    statusReceita: readColumnValues(ws, 7),
  };

  writeColumnValues(
    ws,
    1,
    mergeUnique(CANONICAL_ASSESSORIAS, existing.assessoria, extras.assessoria),
  );
  writeColumnValues(
    ws,
    2,
    mergeUnique(CANONICAL_LOCALIZADORES, existing.localizador, extras.localizador),
  );
  writeColumnValues(ws, 3, mergeUnique(DEFAULT_PATIOS, existing.patio, extras.patio));
  writeColumnValues(
    ws,
    4,
    withoutPlaceholderBancos(
      mergeUnique(CANONICAL_BANCOS, existing.banco, extras.banco),
    ),
  );
  writeColumnValues(
    ws,
    5,
    mergeUnique(DEFAULT_FORMAS, existing.formaPagamento, extras.formaPagamento),
  );
  writeColumnValues(
    ws,
    6,
    mergeUnique(DEFAULT_STATUS_DESPESA, existing.statusDespesa),
  );
  writeColumnValues(
    ws,
    7,
    mergeUnique(DEFAULT_STATUS_RECEITA, existing.statusReceita),
  );

  return ws;
}

function clearControleDropdownValidations(worksheet, lastDataRow) {
  const model = worksheet.dataValidations?.model;
  if (!model) return;

  for (const key of Object.keys(model)) {
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(key);
    if (!match) continue;
    const col1 = match[1];
    const row1 = Number(match[2]);
    const col2 = match[3] || col1;
    const row2 = match[4] ? Number(match[4]) : row1;
    const touchesDropdownCol =
      ["B", "C", "D"].includes(col1) || ["B", "C", "D"].includes(col2);
    const touchesDataRows = row2 >= DATA_START && row1 <= lastDataRow;
    if (touchesDropdownCol && touchesDataRows) delete model[key];
  }
}

/**
 * Menus suspensos no Controle: Loc 1, Banco, Assessoria ← aba Listas.
 */
export function applyControleListValidations(worksheet, lastDataRow) {
  if (lastDataRow < DATA_START) return;

  clearControleDropdownValidations(worksheet, lastDataRow);

  const common = {
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    showInputMessage: false,
  };

  worksheet.dataValidations.add(`B${DATA_START}:B${lastDataRow}`, {
    ...common,
    formulae: [`${LISTAS_SHEET_NAME}!$B$${LISTAS_DATA_START}:$B$${LISTAS_DATA_END}`],
  });
  worksheet.dataValidations.add(`C${DATA_START}:C${lastDataRow}`, {
    ...common,
    formulae: [`${LISTAS_SHEET_NAME}!$D$${LISTAS_DATA_START}:$D$${LISTAS_DATA_END}`],
  });
  worksheet.dataValidations.add(`D${DATA_START}:D${lastDataRow}`, {
    ...common,
    formulae: [`${LISTAS_SHEET_NAME}!$A$${LISTAS_DATA_START}:$A$${LISTAS_DATA_END}`],
  });
}
