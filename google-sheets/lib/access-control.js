import crypto from "node:crypto";
import { assessoriaMentionNeedles } from "./assessoria-rules.js";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const fromEnv = String(process.env.AUTH_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) return "";
  return "gps-ba-sessao-local";
}

const BLOCKED_TIPO = new Set(["pagamento", "whatsapp", "zap", "contato"]);
const CONTACT_LOG =
  /contato com|entrei em contato|liguei|liga[cç][aã]o|cobrei|sem retorno|chamei no|zap enviado|mensagem enviada/i;
const BLOCKED_TEXT =
  /assessoria|pagamento|pix|recibo|\br\$\b|di[aá]ria|pr[eê]mio|nfs-?e|\bbanco\b|guincho|\bvalor\b|carteira|ita[uú]|bradesco|santander|mapfre|financeira/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;

const PUBLIC_KEYS = [
  "placa",
  "dataOcorrencia",
  "veiculo",
  "cor",
  "origem",
  "uf",
  "localizador",
  "rastreado",
  "localizado",
  "processo",
  "temMandado",
  "patio",
  "dataApreensao",
  "dataEntradaPatio",
  "dataSaidaPatio",
  "proximoContato",
  "atualizadoEm",
];

export function senhaMatches(stored, typed) {
  const a = String(stored ?? "");
  const b = String(typed ?? "");
  if (safeEqual(a, b)) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return safeEqual(a.replace(/^0+/, "") || "0", b.replace(/^0+/, "") || "0");
  }
  return false;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function signSession(user, now = Date.now()) {
  const payload = {
    usuario: user.usuario,
    papel: user.papel,
    localizador: user.localizador || "",
    exp: now + SESSION_MS,
  };
  const secret = sessionSecret();
  if (!secret) throw Object.assign(new Error("AUTH_SECRET ausente."), { status: 500 });
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token, now = Date.now()) {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload?.usuario || (payload.papel !== "admin" && payload.papel !== "localizador")) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.papel === "localizador" && !payload.localizador) return null;
  return {
    usuario: String(payload.usuario),
    papel: payload.papel,
    localizador: payload.papel === "admin" ? "" : String(payload.localizador).trim().toUpperCase(),
  };
}

export function actorFromRequest(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(\S+)/i);
  const actor = match ? readSession(match[1]) : null;
  if (!actor) {
    const err = new Error("Faça login.");
    err.status = 401;
    throw err;
  }
  return actor;
}

export function requireAdmin(req) {
  const actor = actorFromRequest(req);
  if (actor.papel !== "admin") {
    const err = new Error("Sem permissão.");
    err.status = 403;
    throw err;
  }
  return actor;
}

export function publicText(value) {
  let text = String(value ?? "").trim();
  if (!text || text === "[object Object]") return "";
  text = text.replace(/\bcarteira\s+.+?\s+ve[ií]culo\s*:\s*/i, "");
  text = text.replace(
    /\b(carteira|banco|assessoria|pagamento|pix|recibo|ita[uú]|bradesco|santander|mapfre|financeira|pr[eê]mio)\b/gi,
    " ",
  );
  return text.replace(/\s{2,}/g, " ").replace(/\s+([·,])/g, "$1").trim();
}

export const LOCATOR_STATUSES = [
  "nova",
  "aguardando_mandado",
  "com_mandado",
  "apreendido",
  "indisponivel_temp",
  "cancelado",
];

export const LOCATOR_STATUS_LABELS = {
  nova: "Nova ocorrência",
  aguardando_mandado: "Aguardando mandado",
  com_mandado: "Com mandado",
  apreendido: "Apreendido",
  indisponivel_temp: "Indisponível temp.",
  cancelado: "Cancelado",
};

const SEIZED = new Set(["apreendido", "no_patio", "aguardando_pagamento", "removido", "entregue"]);

export function locatorStatus(status) {
  if (SEIZED.has(status)) return "apreendido";
  if (status === "inapto") return "cancelado";
  if (LOCATOR_STATUSES.includes(status)) return status;
  return "nova";
}

export function publicLocalizadorCar(item) {
  const out = { status: locatorStatus(item?.status) };
  for (const key of PUBLIC_KEYS) {
    if (item?.[key] !== undefined) out[key] = item[key];
  }
  if (out.veiculo) out.veiculo = publicText(out.veiculo);
  if (out.cor) out.cor = publicText(out.cor);
  if (out.origem) out.origem = publicText(out.origem);
  if (out.patio) out.patio = publicText(out.patio);
  if (out.processo) out.processo = publicText(out.processo);
  return out;
}

const OFFICE_NEEDLES = assessoriaMentionNeedles();

function foldWithMap(text) {
  let folded = "";
  const map = [];
  for (let i = 0; i < text.length; i += 1) {
    const chunk = text[i].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const ch of chunk) {
      map.push(i);
      folded += ch;
    }
  }
  return { folded, map };
}

function blankRange(chars, start, end) {
  for (let i = start; i <= end && i < chars.length; i += 1) chars[i] = "";
}

/** Tira escritório, banco e quem atende lá. O fato do processo fica. */
export function scrubLocatorMessage(message) {
  let text = String(message || "");
  if (!text) return "";
  if (/^localizador\s*:/i.test(text)) return "";
  text = text.replace(/\b(s[aã]o\s+paulo)\b/gi, "§SAOPAULO§");
  text = text.replace(/\b[\p{L}][\p{L}.']*(?:\s+[\p{L}][\p{L}.']*){0,3}\s*\([^)]{0,48}\)\s*:/gu, " ");
  text = text.replace(/\b[\p{L}]{3,}\s+saiu\s+do(?:\s+[\p{L}\d]+)?/gu, " ");
  text = text.replace(/\bcom\s+o\s+[\p{L}]{3,}\b/gu, " ");

  const chars = [...text];
  const { folded, map } = foldWithMap(text);
  for (const needle of OFFICE_NEEDLES) {
    let from = 0;
    while (from < folded.length) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      const before = at === 0 ? "" : folded[at - 1];
      const after = folded[at + needle.length] || "";
      const boundary = (ch) => !ch || !/[\p{L}\p{N}]/u.test(ch);
      if (boundary(before) && boundary(after)) {
        blankRange(chars, map[at], map[at + needle.length - 1]);
      }
      from = at + needle.length;
    }
  }
  text = chars.join("");
  text = text.replace(/§SAOPAULO§/g, "São Paulo");
  text = text
    .replace(/\(\s*\)/g, " ")
    .replace(/:\s*/g, " ")
    .replace(/(\d{1,2}\/\d{1,2})\s+e\s+(?=\p{L})/gu, "$1 ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/([,.;]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return "";
  return text;
}

export function locatorTimeline(events, placas) {
  return (events || [])
    .filter((event) => {
      if (!placas.has(event.placa)) return false;
      const tipo = String(event.tipo || "").toLowerCase();
      if (BLOCKED_TIPO.has(tipo)) return false;
      if (tipo === "endereco") return true;
      const msg = String(event.mensagem || "");
      if (tipo !== "status" && CONTACT_LOG.test(msg)) return false;
      if (BLOCKED_TEXT.test(msg)) return false;
      if (PHONE.test(msg)) return false;
      return Boolean(scrubLocatorMessage(msg));
    })
    .map((event) => ({
      id: event.id,
      dataHora: event.dataHora,
      placa: event.placa,
      tipo: event.tipo,
      mensagem: event.tipo?.toLowerCase() === "endereco" ? event.mensagem : scrubLocatorMessage(event.mensagem),
    }));
}

export function scopeCrmForLocalizador(payload, actor) {
  const loc = String(actor?.localizador || "").trim().toUpperCase();
  const pipeline = (payload?.pipeline || [])
    .filter((item) => String(item.localizador || "").trim().toUpperCase() === loc)
    .map(publicLocalizadorCar);
  const placas = new Set(pipeline.map((item) => item.placa));
  const byStatus = Object.fromEntries(LOCATOR_STATUSES.map((status) => [status, []]));
  for (const item of pipeline) {
    const key = byStatus[item.status] ? item.status : "nova";
    byStatus[key].push(item);
  }
  const statusLabels = { ...LOCATOR_STATUS_LABELS };
  const enderecos = (payload?.enderecos || [])
    .filter((item) => placas.has(item.placa))
    .map((item) => ({
      id: item.id,
      placa: item.placa,
      ordem: item.ordem,
      texto: item.texto,
      atualizadoEm: item.atualizadoEm,
      atualizadoPor: item.atualizadoPor,
    }));

  return {
    meta: {
      generatedAt: payload?.meta?.generatedAt || null,
      statusLabels,
      statuses: Object.keys(byStatus),
      patios: [],
      papel: "localizador",
      localizador: loc,
    },
    filters: { localizadores: loc ? [loc] : [], patios: [] },
    counts: Object.fromEntries(Object.keys(byStatus).map((status) => [status, byStatus[status].length])),
    pipeline,
    byStatus,
    timeline: locatorTimeline(payload?.timeline, placas),
    enderecos,
  };
}
