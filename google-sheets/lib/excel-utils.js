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
  cell.value = { formula: expression };
}

export function clearCell(cell) {
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

/** Formato de data brasileiro para células Excel. */
export const DATE_FMT = "dd/mm/yyyy";

/**
 * Normaliza datas evitando deslocamento de fuso (UTC → dia local correto).
 */
export function toExcelDate(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

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
