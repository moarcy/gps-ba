import dotenv from "dotenv";
import ExcelJS from "exceljs";
import http from "node:http";
import { URL } from "node:url";
import { downloadExcel } from "./excel-drive-client.js";
import { addVehicleToGestor } from "./lib/add-vehicle.js";
import {
  addTimelineEvent,
  createOcorrencia,
  getCrmData,
  previewWhatsapp,
  sendToControle,
  updateOcorrencia,
  upsertPagamento,
} from "./lib/crm-service.js";
import { buildDashboardPayload } from "./lib/dashboard-data.js";
import {
  mergeControleRecords,
  readGestorRecords,
  readProducaoRecords,
} from "./sync-controle-diligencias.js";

dotenv.config();

const PORT = Number(process.env.DASHBOARD_API_PORT || 8787);
const GESTOR_ID = process.env.SPREADSHEET_ID_1;
const PRODUCAO_ID = process.env.SPREADSHEET_ID_2;

const cache = {
  payload: null,
  loadedAt: 0,
  ttlMs: 60_000,
};

function sendJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(json);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function loadMergedRecords() {
  const gestorPath = await downloadExcel(GESTOR_ID, { useCache: false });
  const producaoPath = await downloadExcel(PRODUCAO_ID, { useCache: false });

  const gestorWb = new ExcelJS.Workbook();
  const producaoWb = new ExcelJS.Workbook();
  await gestorWb.xlsx.readFile(gestorPath);
  await producaoWb.xlsx.readFile(producaoPath);

  const gestorSheet = gestorWb.getWorksheet("Planilha1");
  if (!gestorSheet) throw new Error("Planilha1 não encontrada.");

  const gestorRecords = readGestorRecords(gestorSheet);
  const producaoRecords = readProducaoRecords(producaoWb);
  return mergeControleRecords(gestorRecords, producaoRecords);
}

async function getDashboardData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.payload && now - cache.loadedAt < cache.ttlMs) {
    return { ...cache.payload, meta: { ...cache.payload.meta, cacheHit: true } };
  }

  const records = await loadMergedRecords();
  const payload = buildDashboardPayload(records, { source: "gestor+producao" });
  cache.payload = payload;
  cache.loadedAt = now;
  return { ...payload, meta: { ...payload.meta, cacheHit: false } };
}

async function handleCrmPost(body) {
  const action = body.action || body.op;

  if (action === "preview") {
    return { status: 200, data: previewWhatsapp(body.text || body.whatsapp || body.rawWhatsapp) };
  }
  if (action === "create" || action === "create_ocorrencia") {
    return { status: 201, data: await createOcorrencia(body) };
  }
  if (action === "update" || action === "update_ocorrencia") {
    const { action: _a, op: _o, placa, ...patch } = body;
    return { status: 200, data: await updateOcorrencia(placa, patch) };
  }
  if (action === "timeline" || action === "add_timeline") {
    return { status: 201, data: await addTimelineEvent(body) };
  }
  if (action === "pagamento" || action === "upsert_pagamento") {
    return { status: 200, data: await upsertPagamento(body) };
  }
  if (action === "bridge" || action === "send_controle") {
    return { status: 200, data: await sendToControle(body) };
  }

  const err = new Error(
    "action inválida. Use: create | update | timeline | pagamento | bridge | preview",
  );
  err.status = 400;
  throw err;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "gps-ba-dashboard-api" });
      return;
    }

    if (url.pathname === "/api/dashboard" && req.method === "GET") {
      const force = url.searchParams.get("refresh") === "1";
      const data = await getDashboardData({ force });
      sendJson(res, 200, data);
      return;
    }

    if (url.pathname === "/api/vehicles" && req.method === "POST") {
      const body = await readJsonBody(req);
      const overwrite = Boolean(body.overwrite);
      const result = await addVehicleToGestor(body, { overwrite });
      cache.payload = null;
      cache.loadedAt = 0;
      sendJson(res, overwrite && result.updated ? 200 : 201, result);
      return;
    }

    if (url.pathname === "/api/crm" && req.method === "GET") {
      if (url.searchParams.get("preview") === "1") {
        sendJson(res, 200, previewWhatsapp(url.searchParams.get("text") || ""));
        return;
      }
      sendJson(res, 200, await getCrmData());
      return;
    }

    if (url.pathname === "/api/crm" && (req.method === "POST" || req.method === "PATCH")) {
      const body = await readJsonBody(req);
      const { status, data } = await handleCrmPost(body);
      sendJson(res, status, data);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, {
      error: error.message || "Erro interno",
      code: error.code,
    });
  }
});

server.listen(PORT, () => {
  console.log(`GPS BA Dashboard API → http://localhost:${PORT}`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/dashboard`);
  console.log(`  GET  /api/crm`);
  console.log(`  POST /api/crm`);
  console.log(`  POST /api/vehicles`);
});
