import { toExcelDate } from "./excel-utils.js";

const MONTH_NAMES = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

/** Slots pré-formatados na aba de veículos (só dados). */
export const DATA_CAPACITY = 200;

export const FECHAMENTOS_SHEET_NAME = "Fechamentos Mensais";

export function monthKeyFromRecord(record) {
  const date = toExcelDate(record.data);
  if (!date) return "sem-data";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function monthKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthBounds(monthKey) {
  const [year, month] = monthKey.split("-");
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  return {
    start: `DATE(${y},${m},1)`,
    end: `DATE(${y},${m + 1},0)`,
    year: y,
    month: m,
    name: MONTH_NAMES[m - 1] || month,
  };
}

/** Escapa nome de aba para fórmula Excel ('Aba'!A:A). */
export function sheetRef(sheetName, range) {
  const escaped = String(sheetName).replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

/**
 * Meses de jan/anoInicio até dez/anoFim (mais recente primeiro) + sem-data.
 * Padrão: ano do primeiro dado (ou ano atual) até dezembro do ano que vem.
 */
export function buildClosingMonthKeys(records, { throughNextYear = true } = {}) {
  const today = new Date();
  const currentYear = today.getFullYear();

  let startYear = currentYear;
  for (const record of records) {
    const date = toExcelDate(record.data);
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      startYear = Math.min(startYear, date.getFullYear());
    }
  }

  const endYear = throughNextYear ? currentYear + 1 : currentYear;
  const filled = [];
  let cursor = `${startYear}-01`;
  const last = `${endYear}-12`;

  while (cursor <= last) {
    filled.push(cursor);
    cursor = nextMonthKey(cursor);
  }

  filled.sort((a, b) => b.localeCompare(a));
  filled.push("sem-data");
  return filled;
}

/**
 * Fórmulas na aba Fechamentos apontando para a aba de veículos.
 * Usa coluna inteira → qualquer linha com data entra no mês certo.
 */
export function closingFormulasCrossSheet(monthKey, dataSheetName, closingRow) {
  const A = sheetRef(dataSheetName, "A:A");
  const F = sheetRef(dataSheetName, "F:F");
  const G = sheetRef(dataSheetName, "G:G");
  const I = sheetRef(dataSheetName, "I:I");
  const J = sheetRef(dataSheetName, "J:J");
  const K = sheetRef(dataSheetName, "K:K");
  const L = sheetRef(dataSheetName, "L:L");

  if (monthKey === "sem-data") {
    const count = `COUNTIFS(${A},"",${F},"<>")`;
    return {
      label: `"FECHAMENTO — SEM DATA ("&${count}&")"`,
      premio: `SUMIFS(${G},${A},"",${F},"<>")`,
      apoio: `SUMIFS(${I},${A},"",${F},"<>")`,
      loc2: `SUMIFS(${J},${A},"",${F},"<>")`,
      guincho: `SUMIFS(${K},${A},"",${F},"<>")`,
      imposto: `SUMIFS(${L},${A},"",${F},"<>")`,
      saldo: `G${closingRow}-I${closingRow}-J${closingRow}-K${closingRow}-L${closingRow}`,
    };
  }

  const { start, end, year, name } = monthBounds(monthKey);
  const dateFilter = `${A},">="&${start},${A},"<="&${end}`;
  const count = `COUNTIFS(${dateFilter},${F},"<>")`;

  return {
    label: `"FECHAMENTO ${name}/${year} — "&${count}&" veíc."`,
    premio: `SUMIFS(${G},${dateFilter})`,
    apoio: `SUMIFS(${I},${dateFilter})`,
    loc2: `SUMIFS(${J},${dateFilter})`,
    guincho: `SUMIFS(${K},${dateFilter})`,
    imposto: `SUMIFS(${L},${dateFilter})`,
    saldo: `G${closingRow}-I${closingRow}-J${closingRow}-K${closingRow}-L${closingRow}`,
  };
}
