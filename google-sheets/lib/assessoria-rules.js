import { normalizeText } from "./excel-utils.js";

/** Nomes canônicos (aba Listas da produção). */
export const CANONICAL_ASSESSORIAS = [
  "A. SAMUEL",
  "BELLINATI C6",
  "GVC",
  "HCOSTA",
  "JCS",
  "JOÃO BARBOSA",
  "MELHADO",
  "MENDES E CUNHA",
  "PASCHOALOTTO",
  "PEREZ DE REZENDE",
  "RENAC",
  "SANTOS BENELI",
  "SCHULZE",
  "TATTINI",
  "TOLEDO PIZA",
  "ZANNIN",
];

/** Apelidos / variações → nome canônico. */
const ASSESSORIA_ALIASES = {
  "n p": "PASCHOALOTTO",
  np: "PASCHOALOTTO",
  paschoalotto: "PASCHOALOTTO",
  schulze: "SCHULZE",
  "s beneli": "SANTOS BENELI",
  "santos beneli": "SANTOS BENELI",
  "j barbosa": "JOÃO BARBOSA",
  "joao barbosa": "JOÃO BARBOSA",
  "b perez": "BELLINATI C6",
  "bellinati c6": "BELLINATI C6",
  "a. samuel": "A. SAMUEL",
  "a samuel": "A. SAMUEL",
  "a braz": "A BRAZ",
  hcosta: "HCOSTA",
  jcs: "JCS",
  gvc: "GVC",
  bjl: "BJL",
  renac: "RENAC",
  melhado: "MELHADO",
  tattini: "TATTINI",
  zannin: "ZANNIN",
  "toledo piza": "TOLEDO PIZA",
  "perez de rezende": "PEREZ DE REZENDE",
  "mendes e cunha": "MENDES E CUNHA",
  renato: "RENATO",
  zaiter: "ZAITER",
};

/** Contato fixo por assessoria (nome canônico). */
const CONTATO_BY_ASSESSORIA = {
  SCHULZE: "GESSIKA",
  PASCHOALOTTO: "PROD",
};

function assessoriaKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAssessoria(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const key = assessoriaKey(raw);
  if (ASSESSORIA_ALIASES[key]) return ASSESSORIA_ALIASES[key];

  const canonical = CANONICAL_ASSESSORIAS.find(
    (name) => assessoriaKey(name) === key,
  );
  if (canonical) return canonical;

  return raw.toUpperCase();
}

export function resolveContato(assessoria, existingContato) {
  const canonical = normalizeAssessoria(assessoria);

  if (canonical === "SCHULZE") return "GESSIKA";
  if (canonical === "PASCHOALOTTO") return "PROD";

  return normalizeText(existingContato) || "";
}
