const PLACA_RE = /\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/i;

export function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePlaca(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function field(text, label) {
  const re = new RegExp(
    `${label}\\s*[:：]\\s*(.+?)(?=\\n|\\r|🔤|📷|🕐|👤|🏢|🏦|📍|🗺️|$)`,
    "i",
  );
  const m = String(text || "").match(re);
  return m ? m[1].replace(/^[^\wÀ-ÿ-]+/, "").trim() : "";
}

function parseLatLon(text) {
  const m = String(text || "").match(
    /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
  );
  if (!m) return { lat: null, lon: null };
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

function parseDataHora(raw) {
  const m = String(raw || "").match(
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return { dataHora: null, iso: null, weekday: null, hour: null };
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[2]);
  const day = Number(m[1]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || 0);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) {
    return { dataHora: raw, iso: null, weekday: null, hour: null };
  }
  return {
    dataHora: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
    iso: date.toISOString(),
    weekday: date.getDay(),
    hour,
    minute,
  };
}

function parseMapsUrl(text, extraUrl = "") {
  const blob = `${text}\n${extraUrl}`;
  const m = blob.match(
    /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[^\s)\]>]*/i,
  );
  if (m) return m[0];
  const { lat, lon } = parseLatLon(text);
  if (lat != null && lon != null) {
    return `https://www.google.com/maps?q=${lat},${lon}`;
  }
  return "";
}

function parseFaixa(text) {
  const m = String(text || "").match(/\(\[([^\]]+)\]\)/);
  return m ? m[1].trim() : "";
}

export function isBlacklistAlert(text) {
  const t = fold(text);
  return t.includes("ALERTA") && t.includes("PLACA") && (t.includes("BLACKLIST") || t.includes("PLACA-ALVO") || t.includes("PLACA ALVO"));
}

export function parseAlerta(text, { mapsUrl = "" } = {}) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return null;

  const placaMatch =
    raw.match(/Placa\s*[:：]\s*([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})/i) ||
    raw.match(PLACA_RE);
  if (!placaMatch) return null;

  const camera = field(raw, "C[âa]mera") || field(raw, "Camera");
  const proprietario = field(raw, "Propriet[áa]rio");
  const escritorio = field(raw, "Escrit[óo]rio");
  const banco = field(raw, "Banco");
  const dataRaw = field(raw, "Data\\/Hora") || field(raw, "Data");
  const when = parseDataHora(dataRaw || raw);
  const { lat, lon } = parseLatLon(raw);

  return {
    placa: normalizePlaca(placaMatch[1]),
    camera: camera.replace(/\s*\(\[.*$/, "").trim(),
    faixa: parseFaixa(raw),
    dataHora: when.dataHora,
    iso: when.iso,
    weekday: when.weekday,
    hour: when.hour,
    minute: when.minute,
    proprietario,
    escritorio,
    banco,
    lat,
    lon,
    mapsUrl: parseMapsUrl(raw, mapsUrl),
    raw,
  };
}

export function splitAlerts(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const chunks = raw.split(/(?=(?:🚨\s*)?Alerta\s*[—–-]\s*Placa)/i);
  const parsed = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const alerta = parseAlerta(trimmed);
    if (alerta) parsed.push(alerta);
  }
  return parsed;
}
