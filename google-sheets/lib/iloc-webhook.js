import { aplicarEventoIloc } from "./iloc-crm.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_BYTES = 256 * 1024;
const LIMITE_DESCRICAO = 7000;

let fila = Promise.resolve();

export function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/** HMAC-SHA256 de `<t>.<corpo>` — o `t` entra como texto, igual ao cabeçalho. */
export function assinarCorpo(segredo, corpo, t) {
  const bytes = Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo), "utf8");
  return createHmac("sha256", segredo).update(`${t}.`).update(bytes).digest("hex");
}

export function assinaturaValida(cabecalho, corpo, segredo, toleranciaS = 300, agoraMs = Date.now()) {
  if (!segredo) return false;
  const partes = {};
  for (const parte of String(cabecalho ?? "").split(",")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    partes[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }
  const bruto = partes.t;
  const t = Number(bruto);
  if (!bruto || !Number.isFinite(t) || Math.abs(agoraMs / 1000 - t) > toleranciaS) return false;
  const esperado = assinarCorpo(segredo, corpo, bruto);
  return igual(esperado, String(partes.v1 ?? "").toLowerCase());
}

export function autorizacaoValida(authorization, token) {
  if (!token) return false;
  return igual(authorization ?? "", `Bearer ${token}`);
}

function header(req, name) {
  const headers = req.headers || {};
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== want) continue;
    if (Array.isArray(value)) return value[0] || "";
    return value || "";
  }
  return "";
}

function send(res, status, codigo) {
  if (codigo) res.writeHead(status, { "x-iloc-erro": codigo });
  else res.writeHead(status);
  res.end();
}

function codigoErro(error) {
  const msg = String(error?.message || error);
  if (error?.code === "ILOC_RAW_BODY") return "raw";
  if (/Cannot find module/.test(msg)) return "modulo";
  if (/permission|403/i.test(msg)) return "permissao";
  if (/not found|404/i.test(msg)) return "nao-encontrado";
  if (/invalid_grant|Unexpected token|credencial/i.test(msg)) return "credencial";
  return "interno";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > LIMITE_BYTES) {
        reject(Object.assign(new Error("payload grande"), { code: "ILOC_TOO_LARGE" }));
        req.destroy?.();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function caminhos() {
  const events =
    process.env.ILOC_EVENTS_PATH ||
    (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? path.join(os.tmpdir(), "gps-ba-iloc", "events.jsonl")
      : path.join(__dirname, "..", "data", "iloc-events.jsonl"));
  const seen = process.env.ILOC_SEEN_PATH || events.replace(/\.jsonl?$/, "") + ".seen";
  return { events, seen };
}

function idsVistos(seenPath) {
  if (!fs.existsSync(seenPath)) return new Set();
  return new Set(
    fs
      .readFileSync(seenPath, "utf8")
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter(Boolean),
  );
}

function montarRegistro(evento, meta) {
  const caso =
    evento.caso && typeof evento.caso === "object"
      ? {
          id: evento.caso.id ?? null,
          caseId: evento.caso.caseId ?? null,
          placa: evento.caso.placa ?? null,
        }
      : null;
  return {
    id: evento.id,
    tipo: evento.tipo,
    versao: evento.versao ?? null,
    ocorridoEm: evento.ocorridoEm ?? null,
    instancia: evento.instancia ?? null,
    caso,
    ator: evento.ator ?? null,
    dados: evento.dados ?? null,
    entrega: meta.entrega || null,
    recebidoEm: new Date().toISOString(),
  };
}

function criarAuth(google) {
  const scopes = ["https://www.googleapis.com/auth/drive"];
  const jsonInline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonInline) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(jsonInline),
      scopes,
    });
  }
  const credsPath = path.join(__dirname, "..", process.env.GOOGLE_CREDENTIALS_FILE || "credentials.json");
  if (!fs.existsSync(credsPath)) {
    throw new Error("Credenciais Google não encontradas para gravar o webhook iLoc.");
  }
  return new google.auth.GoogleAuth({ keyFile: credsPath, scopes });
}

export function parseIdsReservados(description) {
  const texto = String(description || "").trim();
  if (!texto) return { ids: [], usavel: true };
  try {
    const data = JSON.parse(texto);
    if (!Array.isArray(data) || data.some((item) => typeof item !== "string")) {
      return { ids: [], usavel: false };
    }
    return { ids: data, usavel: true };
  } catch {
    return { ids: [], usavel: false };
  }
}

export function reservarIdNaLista(lista, id, limite = 120) {
  if (lista.includes(id)) return { lista, duplicado: true };
  let proxima = [...lista, id];
  while (JSON.stringify(proxima).length > LIMITE_DESCRICAO && proxima.length > 1) {
    proxima = proxima.slice(1);
  }
  if (limite && proxima.length > limite) proxima = proxima.slice(proxima.length - limite);
  return { lista: proxima, duplicado: false };
}

export function soltarIdNaLista(lista, id) {
  return lista.filter((item) => item !== id);
}

function conflitoHttp(error) {
  const status = Number(error?.response?.status || error?.status || error?.code);
  return status === 412 || /precondition/i.test(String(error?.message || ""));
}

function clienteDrive() {
  return google.drive({ version: "v2", auth: criarAuth(google) });
}

async function alterarReserva(folderId, mudar) {
  const drive = clienteDrive();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "etag,description",
      supportsAllDrives: true,
    });
    const parsed = parseIdsReservados(meta.data.description);
    if (!parsed.usavel) return "indisponivel";
    const mudanca = mudar(parsed.ids);
    if (mudanca.duplicado) return "duplicado";
    try {
      await drive.files.update(
        {
          fileId: folderId,
          requestBody: { description: JSON.stringify(mudanca.lista) },
          supportsAllDrives: true,
        },
        meta.data.etag ? { headers: { "If-Match": meta.data.etag } } : undefined,
      );
      return "novo";
    } catch (error) {
      if (!conflitoHttp(error)) throw error;
    }
  }
  return "indisponivel";
}

async function reservarSePossivel(id) {
  const folderId = process.env.ILOC_LOG_FOLDER_ID?.trim();
  if (!folderId || !process.env.VERCEL) return "indisponivel";
  try {
    return await alterarReserva(folderId, (ids) => reservarIdNaLista(ids, id));
  } catch (error) {
    console.error("iloc reserva", error?.message || error);
    return "indisponivel";
  }
}

async function soltarReserva(id) {
  const folderId = process.env.ILOC_LOG_FOLDER_ID?.trim();
  if (!folderId) return;
  try {
    await alterarReserva(folderId, (ids) => ({ lista: soltarIdNaLista(ids, id), duplicado: false }));
  } catch (error) {
    console.error("iloc soltar", error?.message || error);
  }
}

function eventoAceito(evento) {
  if (!evento || typeof evento !== "object" || Array.isArray(evento)) return false;
  if (typeof evento.id !== "string" || !evento.id || evento.id.length > 512) return false;
  if (/[\s]/.test(evento.id)) return false;
  if (typeof evento.tipo !== "string" || !evento.tipo || evento.tipo.length > 120) return false;
  return true;
}

function marcarVisto(seen, id) {
  try {
    fs.mkdirSync(path.dirname(seen), { recursive: true });
    fs.appendFileSync(seen, `${id}\n`);
  } catch (error) {
    console.error("iloc seen", error?.message || error);
  }
}

async function gravar(evento, meta) {
  const { events, seen } = caminhos();
  if (idsVistos(seen).has(evento.id)) return { duplicate: true };

  if (evento.tipo !== "webhook.ping") {
    const aplicar = globalThis.__ilocAplicarEvento || aplicarEventoIloc;
    const crm = await aplicar(evento, meta);
    if (crm?.duplicate) {
      marcarVisto(seen, evento.id);
      return { duplicate: true };
    }
  }

  const record = montarRegistro(evento, meta);
  try {
    fs.mkdirSync(path.dirname(events), { recursive: true });
    fs.appendFileSync(events, `${JSON.stringify(record)}\n`);
    marcarVisto(seen, evento.id);
  } catch (error) {
    console.error("iloc jsonl", error?.message || error);
  }
  const placa = evento.caso?.placa || "-";
  console.log(`iloc ${evento.tipo} ${evento.id} placa=${placa}`);
  return { duplicate: false };
}

function enfileirar(evento, meta) {
  const job = fila.then(() => gravar(evento, meta));
  fila = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

function respostaOk() {
  return { status: 204, body: null, headers: {} };
}

export async function executarIloc({ method, headers = {}, raw = Buffer.alloc(0), continuar } = {}) {
  const req = { method, headers };
  if (method === "GET") {
    const pronto = Boolean(process.env.ILOC_WEBHOOK_TOKEN && process.env.ILOC_WEBHOOK_SEGREDO);
    return {
      status: 200,
      body: JSON.stringify({ ok: true, service: "gps-ba-iloc-webhook", pronto }),
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    };
  }
  if (method !== "POST") return { status: 405, body: null, headers: {} };
  if (raw.length > LIMITE_BYTES) return { status: 413, body: null, headers: {} };

  const token = process.env.ILOC_WEBHOOK_TOKEN || "";
  const segredo = process.env.ILOC_WEBHOOK_SEGREDO || "";
  if (!autorizacaoValida(header(req, "authorization"), token)) {
    console.error("iloc 401 token");
    return { status: 401, body: null, headers: {} };
  }
  if (!assinaturaValida(header(req, "x-iloc-assinatura"), raw, segredo)) {
    console.error("iloc 401 assinatura");
    return { status: 401, body: null, headers: {} };
  }

  let evento;
  try {
    evento = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400, body: null, headers: {} };
  }
  if (!eventoAceito(evento)) return { status: 400, body: null, headers: {} };

  const meta = { entrega: header(req, "x-iloc-entrega") };
  const reserva = await reservarSePossivel(evento.id);
  if (reserva === "duplicado") {
    console.log(`iloc ${evento.tipo} ${evento.id} duplicado`);
    return respostaOk();
  }

  const job = enfileirar(evento, meta);
  const cedo = typeof continuar === "function" && reserva === "novo";
  if (!cedo) {
    try {
      await job;
    } catch (error) {
      if (reserva === "novo") await soltarReserva(evento.id);
      throw error;
    }
    return respostaOk();
  }

  let timer;
  const prazoMs = Number(process.env.ILOC_RESPOSTA_MS || 7000);
  const prazo = new Promise((resolve) => {
    timer = setTimeout(() => resolve("prazo"), prazoMs);
  });
  const chegada = job.then(
    () => "ok",
    () => "erro",
  );
  const resultado = await Promise.race([chegada, prazo]);
  clearTimeout(timer);

  if (resultado === "erro") {
    await soltarReserva(evento.id);
    await job;
  }
  if (resultado === "ok") return respostaOk();

  continuar(
    job.catch(async (error) => {
      console.error("iloc fundo", error?.message || error);
      await soltarReserva(evento.id);
    }),
  );
  console.log(`iloc ${evento.tipo} ${evento.id} segue em fundo`);
  return respostaOk();
}

function escrever(res, result) {
  const headers = result.headers || {};
  if (Object.keys(headers).length) res.writeHead(result.status, headers);
  else res.writeHead(result.status);
  res.end(result.body || undefined);
}

export async function handleIlocWebhook(req, res) {
  try {
    const raw = req.method === "POST" ? await readRawBody(req) : Buffer.alloc(0);
    const result = await executarIloc({ method: req.method, headers: req.headers, raw });
    escrever(res, result);
  } catch (error) {
    console.error("iloc", error?.message || error);
    if (!res.headersSent) send(res, 500, codigoErro(error));
  }
}
