import { fold, parseAlerta } from "./parse-alerta.js";

/** Operação Feira: só passa alerta cuja câmera/texto é a praça. */
export const DEFAULT_KEYWORDS = ["FEIRA DE SANTANA"];

export function parseKeywords(value) {
  const raw = String(value || "").trim();
  if (!raw) return [...DEFAULT_KEYWORDS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function matchKeywords(text, keywords = DEFAULT_KEYWORDS) {
  const hay = fold(text);
  const hits = [];
  for (const keyword of keywords) {
    const needle = fold(keyword);
    if (needle && hay.includes(needle)) hits.push(keyword);
  }
  return hits;
}

export function classifyMotivo(alerta, hits = ["FEIRA DE SANTANA"]) {
  if (isFeiraOrigin(alerta)) return ["GO Feira de Santana"];
  if (isFeiraCorridor(alerta)) return ["sentido Feira de Santana"];
  const cameraHay = fold(`${alerta?.camera || ""} ${alerta?.faixa || ""}`);
  const motivos = [];
  for (const hit of hits || []) {
    const needle = fold(hit);
    if (!needle || needle.includes("FEIRA")) continue;
    if (cameraHay.includes(needle) || fold(alerta?.raw).includes(needle)) {
      motivos.push(hit);
    }
  }
  return [...new Set(motivos)];
}

export function shouldKeep(text, keywords = DEFAULT_KEYWORDS) {
  const alerta =
    text && typeof text === "object" ? text : parseAlerta(text);
  if (alerta && isFeiraCorridor(alerta)) {
    return { keep: true, hits: ["FEIRA DE SANTANA"] };
  }
  const hits = matchKeywords(typeof text === "string" ? text : text?.raw, keywords).filter(
    (k) => !fold(k).includes("FEIRA"),
  );
  return { keep: hits.length > 0, hits };
}

export function isFeiraOrigin(alerta) {
  const origem = fold(alerta?.origemRota || "");
  if (origem) return origem.includes("FEIRA DE SANTANA");
  const cam = fold(alerta?.camera || "");
  const faixa = fold(alerta?.faixa || "").replace(/^FAIXA\s+\d+\s+/, "");
  const head = (s) => s.split(/\s+SENT\s+|\s+->\s+|\s+→\s+/)[0];
  return head(cam).includes("FEIRA DE SANTANA") || head(faixa).includes("FEIRA DE SANTANA");
}

export function isFeiraCorridor(alerta) {
  return fold(
    `${alerta?.camera || ""} ${alerta?.faixa || ""} ${alerta?.rota || ""} ${alerta?.origemRota || ""} ${alerta?.destinoRota || ""}`,
  ).includes("FEIRA DE SANTANA");
}

export function isFeiraAlerta(alerta) {
  return isFeiraOrigin(alerta);
}

/** Placas no corredor Feira (origem ou destino) + todas as câmeras delas. */
export function selectFeiraNetwork(alertas) {
  const feiraPlates = new Set();
  for (const alerta of alertas || []) {
    if (alerta?.placa && isFeiraCorridor(alerta)) feiraPlates.add(alerta.placa);
  }
  return (alertas || []).filter((a) => a?.placa && feiraPlates.has(a.placa));
}

export function decideTrack(alerta, { knownPlates } = {}) {
  if (isFeiraCorridor(alerta)) return { track: true, notify: true };
  if (alerta?.placa && knownPlates?.has(alerta.placa)) {
    return { track: true, notify: false };
  }
  return { track: false, notify: false };
}
