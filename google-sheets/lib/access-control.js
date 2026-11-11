import crypto from "node:crypto";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const fromEnv = String(process.env.AUTH_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) return "";
  return "gps-ba-sessao-local";
}

const BLOCKED_TIPO = new Set(["pagamento", "whatsapp", "zap"]);
const BLOCKED_TEXT =
  /assessoria|pagamento|pix|recibo|\br\$\b|di[aá]ria|pr[eê]mio|nfs-?e|\bbanco\b|guincho|\bvalor\b|carteira|ita[uú]|bradesco|santander|mapfre|financeira/i;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/;

const PUBLIC_KEYS = [
  "placa",
  "dataOcorrencia",
  "veiculo",
  "cor",
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

export function locatorStatus(status) {
  if (status === "aguardando_pagamento") return "no_patio";
  return status || "nova";
}

export function publicLocalizadorCar(item) {
  const out = { status: locatorStatus(item?.status) };
  for (const key of PUBLIC_KEYS) {
    if (item?.[key] !== undefined) out[key] = item[key];
  }
  if (out.veiculo) out.veiculo = publicText(out.veiculo);
  if (out.cor) out.cor = publicText(out.cor);
  if (out.patio) out.patio = publicText(out.patio);
  if (out.processo) out.processo = publicText(out.processo);
  return out;
}

export function locatorTimeline(events, placas) {
  return (events || [])
    .filter((event) => {
      if (!placas.has(event.placa)) return false;
      const tipo = String(event.tipo || "").toLowerCase();
      if (BLOCKED_TIPO.has(tipo)) return false;
      if (tipo === "endereco") return true;
      const msg = String(event.mensagem || "");
      if (BLOCKED_TEXT.test(msg)) return false;
      if (PHONE.test(msg)) return false;
      return true;
    })
    .map((event) => ({
      id: event.id,
      dataHora: event.dataHora,
      placa: event.placa,
      tipo: event.tipo,
      mensagem: event.mensagem,
    }));
}

export function scopeCrmForLocalizador(payload, actor) {
  const loc = String(actor?.localizador || "").trim().toUpperCase();
  const pipeline = (payload?.pipeline || [])
    .filter((item) => String(item.localizador || "").trim().toUpperCase() === loc)
    .map(publicLocalizadorCar);
  const placas = new Set(pipeline.map((item) => item.placa));
  const statuses = (payload?.meta?.statuses || []).filter((status) => status !== "aguardando_pagamento");
  const byStatus = Object.fromEntries(statuses.map((status) => [status, []]));
  for (const item of pipeline) {
    const key = byStatus[item.status] ? item.status : "nova";
    if (!byStatus[key]) byStatus[key] = [];
    byStatus[key].push(item);
  }
  const statusLabels = { ...(payload?.meta?.statusLabels || {}) };
  delete statusLabels.aguardando_pagamento;
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
