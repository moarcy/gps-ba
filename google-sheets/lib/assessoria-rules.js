import { normalizeText } from "./excel-utils.js";

/** Nomes canônicos (Controle / Listas). */
export const CANONICAL_ASSESSORIAS = [
  "A. SAMUEL",
  "A BRAZ",
  "BELLINATI C6",
  "BJL",
  "GOMES",
  "GOES E NICOLADELLI",
  "GVC",
  "HCOSTA",
  "ITAPEVA",
  "JCS",
  "JOÃO BARBOSA",
  "MELHADO",
  "MENDES E CUNHA",
  "PASCHOALOTTO",
  "PEREZ DE REZENDE",
  "RENAC",
  "RENATO",
  "SANTOS BENELI",
  "SCHULZE",
  "TATTINI",
  "TOLEDO PIZA",
  "ZAITER",
  "ZANNIN",
];

/** Apelidos Locgram / variações → nome canônico da planilha. */
const ASSESSORIA_ALIASES = {
  "n p": "PASCHOALOTTO",
  np: "PASCHOALOTTO",
  paschoalotto: "PASCHOALOTTO",
  "n paschoalotto": "PASCHOALOTTO",

  schulze: "SCHULZE",

  "s beneli": "SANTOS BENELI",
  "santos beneli": "SANTOS BENELI",

  "j barbosa": "JOÃO BARBOSA",
  "joao barbosa": "JOÃO BARBOSA",

  "b perez": "BELLINATI C6",
  "bellinati c6": "BELLINATI C6",
  bellinati: "BELLINATI C6",
  "bellinati perez": "BELLINATI C6",

  "a. samuel": "A. SAMUEL",
  "a samuel": "A. SAMUEL",
  "antonio samuel": "A. SAMUEL",
  "antonio samuel da silveira": "A. SAMUEL",

  "a braz": "A BRAZ",
  abraz: "A BRAZ",
  "antonio braz": "A BRAZ",

  hcosta: "HCOSTA",
  jcs: "JCS",
  "jcs advogados": "JCS",
  "jcs junior adv": "JCS",
  "jcs junior": "JCS",

  gvc: "GVC",
  "gvc rodobens": "GVC",

  bjl: "BJL",
  "barcelos e janssen adv": "BJL",
  "barcelos e janssen": "BJL",
  "barcelos janssen": "BJL",

  renac: "RENAC",
  "renac hernandes blanco": "RENAC",

  melhado: "MELHADO",
  "melhado advogados": "MELHADO",

  tattini: "TATTINI",
  zannin: "ZANNIN",
  zaiter: "ZAITER",
  renato: "RENATO",

  "toledo piza": "TOLEDO PIZA",
  "toledo piza advogados bv": "TOLEDO PIZA",
  "toledo piza advogados": "TOLEDO PIZA",

  "perez de rezende": "PEREZ DE REZENDE",
  "perez de rezende advocacia": "PEREZ DE REZENDE",

  "mendes e cunha": "MENDES E CUNHA",

  itapeva: "ITAPEVA",
  "itapeva retomadas interna": "ITAPEVA",

  gomes: "GOMES",
  "ml gomes": "GOMES",

  "goes e nicoladelli": "GOES E NICOLADELLI",
  "goes e nicoladeli": "GOES E NICOLADELLI",
  "goes e nocoladelis": "GOES E NICOLADELLI",
  "goes e nicoladelli advogados associados": "GOES E NICOLADELLI",
};

function assessoriaKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripParen(key) {
  return key.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function lookupAlias(key) {
  if (!key) return "";
  if (ASSESSORIA_ALIASES[key]) return ASSESSORIA_ALIASES[key];

  const canonical = CANONICAL_ASSESSORIAS.find((name) => assessoriaKey(name) === key);
  if (canonical) return canonical;

  const entries = [
    ...Object.entries(ASSESSORIA_ALIASES).map(([k, v]) => ({ k, v })),
    ...CANONICAL_ASSESSORIAS.map((name) => ({ k: assessoriaKey(name), v: name })),
  ].sort((a, b) => b.k.length - a.k.length);

  for (const { k, v } of entries) {
    if (k.length < 3) continue;
    if (key === k) return v;
    // Prefixo: "JCS ADVOGADOS", "TOLEDO PIZA ADVOGADOS BV"
    if (key.startsWith(`${k} `)) return v;
    // Substring só para nomes longos (evita "GOMES" dentro de "VELOSO E GOMES")
    if (k.length >= 8 && key.includes(k)) return v;
  }

  return "";
}

export function normalizeAssessoria(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const key = assessoriaKey(raw);
  const direct = lookupAlias(key);
  if (direct) return direct;

  const stripped = stripParen(key);
  if (stripped && stripped !== key) {
    const viaParen = lookupAlias(stripped);
    if (viaParen) return viaParen;
  }

  return raw.toUpperCase();
}

export function resolveContato(assessoria, existingContato) {
  const canonical = normalizeAssessoria(assessoria);

  if (canonical === "SCHULZE") return "GESSIKA";
  if (canonical === "PASCHOALOTTO") return "PROD";

  return normalizeText(existingContato) || "";
}
