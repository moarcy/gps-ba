import { normalizeAssessoria } from "./assessoria-rules.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";

/**
 * Extrai dados de mensagem estilo:
 * Nova ocorrência
 * 🚗 PJW2687 - HR-V EX-CVT ... COR: VERMELHA ORIGEM: PAULO AFONSO UF: BA
 * 🏢 Paschoalotto (71) 99197-6649 - ...
 */
export function parseWhatsappOcorrencia(rawText) {
  const text = String(rawText || "").replace(/\r/g, "").trim();
  if (!text) {
    return { ok: false, error: "Cole a mensagem do WhatsApp.", fields: {} };
  }

  const fields = {
    placa: "",
    veiculo: "",
    cor: "",
    origem: "",
    uf: "",
    assessoria: "",
    telefone: "",
    rawWhatsapp: text,
  };

  const placaMatch =
    text.match(/(?:🚗\s*)([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/i) ||
    text.match(/\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/i);
  if (placaMatch) fields.placa = normalizePlaca(placaMatch[1]);

  const vehicleLine =
    text
      .split("\n")
      .find(
        (l) =>
          /🚗/.test(l) || (fields.placa && l.toUpperCase().includes(fields.placa)),
      ) || "";

  if (vehicleLine) {
    let rest = vehicleLine
      .replace(/🚗\s*/g, "")
      .replace(new RegExp(fields.placa, "i"), "")
      .replace(/^\s*[-–—]\s*/, "")
      .trim();

    const corMatch = rest.match(/COR:\s*(.+?)(?=\s+ORIGEM:|\s+UF:|$)/i);
    const origemMatch = rest.match(/ORIGEM:\s*(.+?)(?=\s+UF:|$)/i);
    const ufMatch = rest.match(/\bUF:\s*([A-Z]{2})\b/i);

    if (corMatch) fields.cor = normalizeText(corMatch[1]);
    if (origemMatch) fields.origem = normalizeText(origemMatch[1]);
    if (ufMatch) fields.uf = normalizeText(ufMatch[1]).toUpperCase();

    fields.veiculo = rest
      .replace(/\s*COR:\s*.+$/i, "")
      .replace(/\s*ORIGEM:\s*.+$/i, "")
      .replace(/\s*UF:\s*[A-Z]{2}\b.*$/i, "")
      .trim();
  }

  const officeLine =
    text.split("\n").find((l) => /🏢/.test(l) || /\(\d{2}\)/.test(l)) || "";
  if (officeLine) {
    const clean = officeLine.replace(/🏢\s*/g, "").trim();
    const phoneMatch = clean.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/);
    if (phoneMatch) fields.telefone = normalizeText(phoneMatch[0]);

    let ass = clean;
    if (phoneMatch) ass = clean.slice(0, phoneMatch.index).trim();
    ass = ass.replace(/\s*[-–—].*$/, "").trim();
    fields.assessoria = normalizeAssessoria(ass);
  }

  const missing = [];
  if (!fields.placa) missing.push("placa");

  return {
    ok: missing.length === 0,
    error: missing.length ? `Não foi possível extrair: ${missing.join(", ")}` : null,
    fields,
  };
}
