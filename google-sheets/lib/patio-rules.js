import { normalizeLocalizador } from "./localizador-rules.js";
import { normalizeText } from "./excel-utils.js";

/** Pátios oficiais usados no CRM / planilha. */
export const CANONICAL_PATIOS = ["BF Car", "Ponto a Ponto"];

/**
 * Localizador (LOC do Controle) → pátio padrão.
 * BIRA → BF Car · MACIEL → Ponto a Ponto
 */
export const LOCALIZADOR_TO_PATIO = {
  BIRA: "BF Car",
  MACIEL: "Ponto a Ponto",
};

const PATIO_ALIASES = {
  "bf car": "BF Car",
  bfcar: "BF Car",
  bf: "BF Car",
  "ponto a ponto": "Ponto a Ponto",
  "ponto-a-ponto": "Ponto a Ponto",
  pontoponto: "Ponto a Ponto",
  pap: "Ponto a Ponto",
};

function patioKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza nome do pátio para o canônico (ou texto limpo). */
export function normalizePatio(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const key = patioKey(raw);
  if (PATIO_ALIASES[key]) return PATIO_ALIASES[key];
  const exact = CANONICAL_PATIOS.find((p) => patioKey(p) === key);
  if (exact) return exact;
  return raw;
}

/** Resolve pátio a partir do localizador (BIRA/MACIEL…). */
export function resolvePatioFromLocalizador(localizador) {
  const loc = normalizeLocalizador(localizador);
  if (!loc) return "";
  return LOCALIZADOR_TO_PATIO[loc] || "";
}

/**
 * Escolhe o pátio: valor explícito > já salvo > mapa do localizador.
 */
export function resolvePatio({ patio, localizador } = {}) {
  const explicit = normalizePatio(patio);
  if (explicit) return explicit;
  return resolvePatioFromLocalizador(localizador);
}
