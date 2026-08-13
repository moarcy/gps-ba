import { normalizeText } from "./excel-utils.js";

/** Nomes curtos usados no Controle (coluna Banco). */
export const CANONICAL_BANCOS = [
  "ALFA",
  "BRADESCO",
  "BRD",
  "C6",
  "CNH",
  "CREDITAS",
  "GM",
  "HONDA",
  "ITAPEVA",
  "ITAU",
  "ITAUCARD",
  "LUIZA",
  "MAPFRE",
  "RCI BRASIL",
  "SAFRA",
  "SANTANDER",
  "STELLANTIS",
  "VOLKSWAGEN",
  "VOTORANTIM",
];

/** Placeholders antigos da aba Listas — não são bancos reais do Controle. */
export const PLACEHOLDER_BANCOS = new Set([
  "BANCO ITAU",
  "BANCO ITAÚ",
  "BANCO SANTANDER",
  "BANCO BRADESCO",
]);

const BANCO_ALIASES = {
  alfa: "ALFA",
  bradesco: "BRADESCO",
  "banco bradesco": "BRADESCO",
  brd: "BRD",
  c6: "C6",
  "c6 bank": "C6",
  cnh: "CNH",
  "cnh industrial": "CNH",
  creditas: "CREDITAS",
  gm: "GM",
  chevrolet: "GM",
  honda: "HONDA",
  itapeva: "ITAPEVA",
  itau: "ITAU",
  "banco itau": "ITAU",
  itaucard: "ITAUCARD",
  luiza: "LUIZA",
  "magazine luiza": "LUIZA",
  mapfre: "MAPFRE",
  rci: "RCI BRASIL",
  "rci brasil": "RCI BRASIL",
  safra: "SAFRA",
  santander: "SANTANDER",
  "banco santander": "SANTANDER",
  stellantis: "STELLANTIS",
  volkswagen: "VOLKSWAGEN",
  vw: "VOLKSWAGEN",
  volks: "VOLKSWAGEN",
  votorantim: "VOTORANTIM",
  bv: "VOTORANTIM",
  "bv financeira": "VOTORANTIM",
};

function bancoKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBanco(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const key = bancoKey(raw);
  if (!key) return "";
  if (PLACEHOLDER_BANCOS.has(raw.toUpperCase()) || PLACEHOLDER_BANCOS.has(key.toUpperCase())) {
    if (BANCO_ALIASES[key]) return BANCO_ALIASES[key];
  }

  if (BANCO_ALIASES[key]) return BANCO_ALIASES[key];

  const canonical = CANONICAL_BANCOS.find((name) => bancoKey(name) === key);
  if (canonical) return canonical;

  return raw.toUpperCase();
}
