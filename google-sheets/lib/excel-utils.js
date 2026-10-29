/** Utilitários compartilhados para leitura de células Excel. */

export function cellValue(cell) {
  if (!cell || cell.value == null || cell.value === "") return null;
  const v = cell.value;
  if (typeof v === "object" && v.result != null && v.result !== "") return v.result;
  if (v instanceof Date) return v;
  if (typeof v === "object" && v.text != null) return v.text;
  if (typeof v === "object" && v.formula) return null;
  return v;
}

/** Lê número de célula, inclusive resultado cacheado de fórmula. */
export function cellNumber(cell) {
  return asNumber(cellValue(cell));
}

export function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizePlaca(value) {
  if (value == null) return "";
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

/** Grava fórmula limpa, sem herdar sharedFormula de células antigas. */
export function setFormula(cell, expression) {
  cell.value = null;
  const model = cell.model;
  if (model) {
    delete model.sharedFormula;
    delete model.shareType;
    delete model.ref;
    delete model.formula;
    delete model.result;
  }
  cell.value = { formula: expression };
}

export const CURRENCY_FMT = '"R$" #,##0.00';

export function cellHasFormula(cell) {
  const value = cell?.value;
  if (!value || typeof value !== "object") return false;
  return Boolean(value.formula || value.sharedFormula);
}

/**
 * Imposto (L) e Saldo (M) só nas linhas de dados.
 * Cabeçalho fica texto puro — ARRAYFORMULA/fórmula no L2/M2 vira #REF! no .xlsx
 * aberto no Google Sheets e quebra o filtro.
 *
 * Cada linha leva a própria fórmula. O Sheets junta em bloco compartilhado
 * (ex.: L7:L…); linha inserida ACIMA desse bloco (logo abaixo do cabeçalho)
 * fica sem cálculo — por isso o patch regrava L/M em toda linha de dados.
 */
export function applyVehicleCalcFormulas(row, rowNumber, { headerRow = 2 } = {}) {
  if (rowNumber === headerRow) return;
  const imposto = row.getCell(12);
  const saldo = row.getCell(13);
  setFormula(imposto, `IF(G${rowNumber}="","",G${rowNumber}*13%)`);
  setFormula(
    saldo,
    `IF(COUNTA(G${rowNumber},I${rowNumber},J${rowNumber},K${rowNumber})=0,"",N(G${rowNumber})-N(I${rowNumber})-N(J${rowNumber})-N(K${rowNumber})-N(L${rowNumber}))`,
  );
  imposto.numFmt = CURRENCY_FMT;
  saldo.numFmt = CURRENCY_FMT;
}

export function clearCell(cell) {
  const model = cell.model;
  if (model) {
    delete model.sharedFormula;
    delete model.shareType;
    delete model.ref;
    delete model.formula;
    delete model.result;
  }
  cell.value = null;
}

export function formatNfNr({ qtdNfs, formaPagamento, fallback }) {
  const forma = normalizeText(formaPagamento);
  if (forma) return forma;

  const qtd = asNumber(qtdNfs);
  if (qtd != null && qtd > 0) return String(qtd);

  return normalizeText(fallback) || "";
}

export function calcPremio(recebimento) {
  const total = cellNumber(recebimento.totalEntrada);
  if (total != null) return total;

  const parts = [
    recebimento.apreensao,
    recebimento.guincho,
    recebimento.estadias,
    recebimento.outros,
    recebimento.plus,
  ]
    .map(cellNumber)
    .filter((n) => n != null);

  if (!parts.length) return null;
  return parts.reduce((acc, n) => acc + n, 0);
}

export function pickFirst(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

/** Formato de data: MM = mês (Google Sheets trata mm como minutos e mostra #VALUE!). */
export const DATE_FMT = "dd/MM/yyyy";

/**
 * Google Sheets mostra #VALUE! com formato condicional `[>=1012000]00/00/0000`.
 * Coluna A usa data de verdade (`dd/mm/yyyy`). Dígitos 05092026 viram data no sync
 * (`toExcelDate`) e na coluna N (fechamentos).
 */
export const DATE_COL_FMT = DATE_FMT;

function dateFromParts(year, month, day) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Interpreta 05092026 / 5092026 / "05/09/2026" como 5 set 2026. */
export function parseDdmmaaaa(value) {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value) && value >= 1012000) {
    const digits = String(Math.trunc(value)).padStart(8, "0");
    return dateFromParts(
      Number(digits.slice(4, 8)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(0, 2)),
    );
  }

  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (dmy) return dateFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const digits = text.replace(/\D/g, "");
  if (digits.length === 8) {
    return dateFromParts(
      Number(digits.slice(4, 8)),
      Number(digits.slice(2, 4)),
      Number(digits.slice(0, 2)),
    );
  }
  if (digits.length === 7) return parseDdmmaaaa(Number(digits));

  return null;
}

/** 20206-09-15 (dígitos + formato dd/mm) → 15/09/2026. */
function repairYear(year) {
  if (year <= 2100) return year;
  const text = String(year);
  if (text.startsWith("2020") && text.length === 5) {
    return Number(`202${text.slice(4)}`);
  }
  return 2026;
}

/**
 * Normaliza datas evitando deslocamento de fuso (UTC → dia local correto).
 */
export function toExcelDate(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = repairYear(value.getUTCFullYear());
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return dateFromParts(year, month, day) || new Date(year, month - 1, day);
  }

  const fromDigits = parseDdmmaaaa(value);
  if (fromDigits) return fromDigits;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
      );
    }
  }

  return null;
}

/** Despesas padrão por localizador (quando não informadas na produção). */
export const LOCADOR_DESPESAS = {
  BIRA: { apoio: 300, guincho: 250 },
};

export function resolveDespesa(field, loc1, ...candidates) {
  const value = pickFirst(...candidates);
  if (value != null) return value;

  const key = normalizeText(loc1).toUpperCase();
  return LOCADOR_DESPESAS[key]?.[field] ?? null;
}

export function sortRecords(records) {
  return [...records].sort((a, b) => {
    const da = toExcelDate(a.data);
    const db = toExcelDate(b.data);
    const ta = da instanceof Date ? da.getTime() : 0;
    const tb = db instanceof Date ? db.getTime() : 0;
    if (ta !== tb) return tb - ta;
    return a.placa.localeCompare(b.placa, "pt-BR");
  });
}
