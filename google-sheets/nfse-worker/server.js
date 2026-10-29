import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitNfseOnPortal } from "./emit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PORT = Number(process.env.NFSE_WORKER_PORT || 8791);
const SECRET = process.env.NFSE_WORKER_SECRET?.trim() || "";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function authorize(req) {
  if (!SECRET) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === SECRET;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        service: "gps-ba-nfse-worker",
        portalUserConfigured: Boolean(process.env.NFSE_PORTAL_USER),
      });
      return;
    }

    if (url.pathname === "/emit" && req.method === "POST") {
      if (!authorize(req)) {
        sendJson(res, 401, { error: "Não autorizado." });
        return;
      }

      const body = await readJsonBody(req);
      const result = await emitNfseOnPortal(body);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: error.message || "Erro interno" });
  }
});

server.listen(PORT, () => {
  console.log(`NFS-e worker → http://localhost:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  POST /emit`);
});
