import { normalizeText } from "./excel-utils.js";

/** Nomes canônicos usados no Controle (LOC). */
export const CANONICAL_LOCALIZADORES = [
  "BIRA",
  "MACIEL",
  "MARCIA",
  "LUCAS",
  "CARLOS",
  "MATHEUS",
  "MOREIRA",
  "AILTON",
  "RICARDO",
  "ENDRIGO",
];

/**
 * Apelidos Locgram / variações → nome curto da planilha.
 * jubiraci = bira · maciel = maciel · etc.
 */
const LOCALIZADOR_ALIASES = {
  bira: "BIRA",
  jubiraci: "BIRA",
  "jubiraci moraes": "BIRA",
  jubirajara: "BIRA",
  "jubirajara alves de mo": "BIRA",
  "jubirajara alves de moraes": "BIRA",

  maciel: "MACIEL",
  "maciel oliveira": "MACIEL",

  marcia: "MARCIA",
  "marcia souza": "MARCIA",

  lucas: "LUCAS",

  carlos: "CARLOS",
  "carlos antonio": "CARLOS",
  "carlos antonio nunes": "CARLOS",
  "carlos antonio nunes v": "CARLOS",
  "carlos antonio nunes vieira": "CARLOS",

  matheus: "MATHEUS",
  "matheus souza": "MATHEUS",
  "matheus souza de matos": "MATHEUS",

  moreira: "MOREIRA",
  ailton: "AILTON",
  ricardo: "RICARDO",
  endrigo: "ENDRIGO",
};

function locKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.{2,}/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Locgram às vezes manda "Nova ocorrência" sem nome.
 * Essas placas são do Endrigo.
 */
export const DEFAULT_LOCALIZADOR = "ENDRIGO";

export function normalizeLocalizador(value, { emptyAsDefault = false } = {}) {
  const raw = normalizeText(value);
  if (!raw) return emptyAsDefault ? DEFAULT_LOCALIZADOR : "";

  const key = locKey(raw);
  if (!key) return emptyAsDefault ? DEFAULT_LOCALIZADOR : "";
  if (LOCALIZADOR_ALIASES[key]) return LOCALIZADOR_ALIASES[key];

  // Nomes truncados no WhatsApp ("Carlos Antonio Nunes V...")
  const aliasEntries = Object.entries(LOCALIZADOR_ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [alias, canon] of aliasEntries) {
    if (alias.length < 4) continue;
    if (key.startsWith(alias) || alias.startsWith(key)) return canon;
  }

  const first = key.split(" ")[0];
  if (LOCALIZADOR_ALIASES[first]) return LOCALIZADOR_ALIASES[first];

  const canonical = CANONICAL_LOCALIZADORES.find((name) => locKey(name) === key);
  if (canonical) return canonical;

  // Já é um código curto (ex.: BIRA)
  if (!/\s/.test(raw) && raw.length <= 16) return raw.toUpperCase();

  return first.toUpperCase();
}
