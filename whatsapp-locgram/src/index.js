import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestLocgramHit } from "../../google-sheets/lib/localizados-service.js";
import { looksLikeLocgramOcorrencia } from "../../google-sheets/lib/parse-locgram-live.js";
import { extractMeta, isLocgramChat } from "./evolution.js";
import { createSeenStore } from "./seen.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.join(root, "..");
const sheetsDir = path.join(root, "..", "..", "google-sheets");

dotenv.config({ path: path.join(sheetsDir, ".env") });
dotenv.config({ path: path.join(workerDir, ".env") });

const PORT = Number(process.env.LOCGRAM_WEBHOOK_PORT || 8790);
const allowedJid = process.env.EVOLUTION_JID_LOCGRAM?.trim() || "";
const webhookSecret = process.env.LOCGRAM_WEBHOOK_SECRET?.trim() || "";
const seen = createSeenStore(path.join(workerDir, "data", "seen-ids.txt"));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

async function handleMessage(body) {
  const event = String(body.event || body.type || "").toLowerCase();
  if (event && !event.includes("message")) return { skipped: true, reason: "event" };

  const items = Array.isArray(body.data) ? body.data : [body.data || body];
  const results = [];
  for (const item of items) {
    const meta = extractMeta({ ...body, data: item });
    if (meta.fromMe) continue;
    if (!meta.text) continue;
    if (allowedJid && !isLocgramChat(meta, allowedJid) && !looksLikeLocgramOcorrencia(meta.text)) {
      continue;
    }
    if (!looksLikeLocgramOcorrencia(meta.text)) continue;
    const id = meta.id || `${meta.jid}:${meta.ts}:${meta.text.slice(0, 40)}`;
    if (seen.has(id)) {
      results.push({ skipped: true, reason: "dup", id });
      continue;
    }
    const ingested = await ingestLocgramHit({ text: meta.text, ts: meta.ts });
    seen.add(id);
    console.log(
      ingested.skipped
        ? `Ignorada ${ingested.placa || ""} (${ingested.reason})`
        : `${ingested.created ? "Nova" : "Atualizou"} ${ingested.placa} · ${ingested.loc} · Pendente`,
    );
    results.push(ingested);
  }
  return { ok: true, results };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    send(res, 200, { ok: true, service: "gps-ba-locgram-evolution" });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/webhook")) {
    if (webhookSecret) {
      const got = req.headers.apikey || req.headers["x-webhook-secret"] || "";
      if (got !== webhookSecret) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
    }
    try {
      const body = await readBody(req);
      const result = await handleMessage(body);
      send(res, 200, result);
    } catch (err) {
      console.error(err);
      send(res, err.status || 500, { error: err.message || "Erro interno" });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Locgram Evolution → http://127.0.0.1:${PORT}/webhook`);
  console.log("Só coleta Nova ocorrência. Você confere a posição na aba Local do app.");
  if (allowedJid) console.log(`Filtro jid: ${allowedJid}`);
  else console.log("Sem EVOLUTION_JID_LOCGRAM: aceita qualquer chat com cara de Locgram.");
});
