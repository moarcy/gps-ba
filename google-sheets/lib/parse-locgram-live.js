import { parseWhatsappOcorrencia } from "./parse-whatsapp-ocorrencia.js";
import { normalizeLocalizador } from "./localizador-rules.js";

const OPS_LOCS = new Set(["BIRA", "CARLOS", "MACIEL"]);

export function looksLikeLocgramOcorrencia(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (/nova ocorr[eê]ncia/i.test(raw) && /🚗/.test(raw)) return true;
  if (/nova ocorr[eê]ncia/i.test(raw) && /\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/i.test(raw)) return true;
  return false;
}

function locCidade(loc) {
  if (loc === "MACIEL") return "Barreiras";
  if (loc === "OUTROS") return "Outras praças";
  return "Salvador";
}

/**
 * Mensagem ao vivo do Locgram (Evolution), não o export Android do ZIP.
 */
export function parseLocgramLive(text, { receivedAt } = {}) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return { ok: false, skip: true, error: "Mensagem vazia." };
  if (!looksLikeLocgramOcorrencia(raw)) {
    return { ok: false, skip: true };
  }

  const parsed = parseWhatsappOcorrencia(raw);
  if (!parsed.ok) {
    return { ok: false, skip: false, error: parsed.error, fields: parsed.fields };
  }

  const nameMatch = raw.match(/nova ocorr[eê]ncia[^\n]*?[-–—:]\s*([^\n*]+)/i);
  const localizador = normalizeLocalizador(nameMatch?.[1], { emptyAsDefault: true });
  const loc = OPS_LOCS.has(localizador) ? localizador : "OUTROS";
  const ts = Number(receivedAt) || Date.now();

  return {
    ok: true,
    skip: false,
    placa: parsed.fields.placa,
    veiculo: parsed.fields.veiculo || "",
    localizador,
    loc,
    cidade: locCidade(loc),
    assessoria: parsed.fields.assessoria || "",
    ts,
    raw,
  };
}
