import { normalizeAssessoria } from "./assessoria-rules.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import { normalizeLocalizador } from "./localizador-rules.js";

const MSG_START =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s+-\s+Locgram Atendimento:\s+\*?Nova ocorrência(?:\s*-\s*([^*]+?))?\*?\s*$/i;

function parseBrDate(datePart, timePart) {
  const [d, m, yRaw] = datePart.split("/");
  let y = Number(yRaw);
  if (y < 100) y += 2000;
  const [hh, mm] = timePart.split(":").map(Number);
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dataHora = new Date(y, Number(m) - 1, Number(d), hh || 0, mm || 0);
  return {
    dataOcorrencia: iso,
    dataHora: Number.isNaN(dataHora.getTime()) ? null : dataHora.toISOString(),
  };
}

function parseVehicleLine(line) {
  const fields = {
    placa: "",
    veiculo: "",
    cor: "",
    origem: "",
    uf: "",
  };

  const placaMatch = line.match(/🚗\s*([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/i);
  if (!placaMatch) return fields;
  fields.placa = normalizePlaca(placaMatch[1]);

  let rest = line
    .replace(/🚗\s*/g, "")
    .replace(new RegExp(fields.placa, "i"), "")
    .replace(/^\s*[-–—]\s*/, "")
    .trim();

  // Se a linha é só a placa repetida, ignora veículo
  if (normalizePlaca(rest) === fields.placa) rest = "";

  const corMatch = rest.match(/COR:\s*(.+?)(?=\s+COMARCA:|\s+ORIGEM:|\s+UF:|$)/i);
  const origemMatch = rest.match(/(?:COMARCA|ORIGEM):\s*(.+?)(?=\s+UF:|$)/i);
  const ufMatch = rest.match(/\bUF:\s*([A-Z]{2})\b/i);

  if (corMatch) fields.cor = normalizeText(corMatch[1]);
  if (origemMatch) fields.origem = normalizeText(origemMatch[1]);
  if (ufMatch) fields.uf = normalizeText(ufMatch[1]).toUpperCase();

  fields.veiculo = rest
    .replace(/\s*COR:\s*.+$/i, "")
    .replace(/\s*(?:COMARCA|ORIGEM):\s*.+$/i, "")
    .replace(/\s*UF:\s*[A-Z]{2}\b.*$/i, "")
    .trim();

  if (normalizePlaca(fields.veiculo) === fields.placa) fields.veiculo = "";

  return fields;
}

function parseOfficeLine(line) {
  // Pode haver vários "🏢 Nome (tel) - ..." na mesma linha; prefere o primeiro com telefone.
  const chunks = line.split("🏢").map((s) => s.trim()).filter(Boolean);
  const parsed = [];
  for (const chunk of chunks) {
    if (/^Detalhes/i.test(chunk)) continue;
    const phoneMatch = chunk.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/);
    let ass = chunk;
    if (phoneMatch) ass = chunk.slice(0, phoneMatch.index).trim();
    ass = ass.replace(/\s*[-–—].*$/, "").trim();
    if (!ass || /\bN\/A\b/i.test(ass)) continue;
    parsed.push({
      assessoria: normalizeAssessoria(ass),
      telefone: phoneMatch ? normalizeText(phoneMatch[0]) : "",
      hasPhone: Boolean(phoneMatch),
    });
  }
  return parsed.find((p) => p.hasPhone) || parsed[0] || { assessoria: "", telefone: "" };
}

/**
 * Lê export Locgram e devolve ocorrências em ordem cronológica.
 * Dedup: use dedupeByFirstLocator() depois.
 */
export function parseLocgramChat(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const ocorrencias = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(MSG_START);
    if (!m) {
      i += 1;
      continue;
    }

    const [, datePart, timePart, locRaw] = m;
    const { dataOcorrencia, dataHora } = parseBrDate(datePart, timePart);
    // Sem nome no Locgram = Endrigo
    const localizador = normalizeLocalizador(locRaw, { emptyAsDefault: true });

    let placa = "";
    let veiculo = "";
    let cor = "";
    let origem = "";
    let uf = "";
    let assessoria = "";
    let telefone = "";
    const block = [line];

    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const trimmed = next.trim();
      // Próxima mensagem WhatsApp
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s+-/.test(trimmed)) break;

      block.push(next);

      if (/🚗/.test(trimmed) && !placa) {
        const v = parseVehicleLine(trimmed);
        placa = v.placa;
        veiculo = v.veiculo;
        cor = v.cor;
        origem = v.origem;
        uf = v.uf;
      }

      if (/🏢/.test(trimmed) && !/^🏢\s*Detalhes/i.test(trimmed) && !assessoria) {
        const o = parseOfficeLine(trimmed);
        assessoria = o.assessoria;
        telefone = o.telefone;
      }

      i += 1;
    }

    if (!placa) continue;

    ocorrencias.push({
      placa,
      dataOcorrencia,
      dataHora,
      localizador,
      veiculo,
      cor,
      origem,
      uf,
      assessoria,
      telefone,
      rawWhatsapp: block.join("\n").trim(),
      sourceLine: m.input,
    });
  }

  return ocorrencias;
}

/** Mantém a primeira ocorrência de cada placa (primeiro loc responsável). */
export function dedupeByFirstLocator(ocorrencias) {
  const kept = [];
  const duplicates = [];
  const seen = new Map();

  for (const item of ocorrencias) {
    if (seen.has(item.placa)) {
      duplicates.push({
        placa: item.placa,
        localizador: item.localizador,
        dataOcorrencia: item.dataOcorrencia,
        firstLocalizador: seen.get(item.placa).localizador,
        firstData: seen.get(item.placa).dataOcorrencia,
      });
      continue;
    }
    seen.set(item.placa, item);
    kept.push(item);
  }

  return { kept, duplicates, uniquePlacas: kept.length };
}
