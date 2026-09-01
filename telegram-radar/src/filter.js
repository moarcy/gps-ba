import { fold } from "./parse-alerta.js";

export const DEFAULT_KEYWORDS = ["ENDRIGO", "FEIRA DE SANTANA"];

export function parseKeywords(value) {
  const raw = String(value || "").trim();
  if (!raw) return [...DEFAULT_KEYWORDS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Mantém o alerta se o texto contiver QUALQUER palavra-chave.
 * ENDRIGO = carteira do localizador · FEIRA DE SANTANA = praça/câmera.
 */
export function matchKeywords(text, keywords = DEFAULT_KEYWORDS) {
  const hay = fold(text);
  const hits = [];
  for (const keyword of keywords) {
    const needle = fold(keyword);
    if (needle && hay.includes(needle)) hits.push(keyword);
  }
  return hits;
}

export function classifyMotivo(alerta, hits) {
  const cameraHay = fold(`${alerta?.camera || ""} ${alerta?.faixa || ""}`);
  const ownerHay = fold(alerta?.proprietario || "");
  const motivos = [];

  for (const hit of hits) {
    const needle = fold(hit);
    if (needle.includes("FEIRA") && cameraHay.includes(needle)) {
      motivos.push("praça Feira de Santana");
    } else if (needle.includes("ENDRIGO") && ownerHay.includes(needle)) {
      motivos.push("carteira Endrigo");
    } else {
      motivos.push(hit);
    }
  }

  return [...new Set(motivos)];
}

export function shouldKeep(text, keywords = DEFAULT_KEYWORDS) {
  const hits = matchKeywords(text, keywords);
  return { keep: hits.length > 0, hits };
}
