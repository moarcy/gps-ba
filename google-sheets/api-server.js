import dotenv from "dotenv";
import ExcelJS from "exceljs";
import fs from "node:fs";
import http from "node:http";
import { URL } from "node:url";
import { downloadExcel } from "./excel-drive-client.js";
import { addVehicleToGestor } from "./lib/add-vehicle.js";
import { actorFromRequest, isConferencia, requireAdmin, requireAdminOuConferencia } from "./lib/access-control.js";
import { loginWithPassword, listUsers } from "./lib/access-store.js";
import { dispatchCrmAction, getCrmData, previewWhatsapp } from "./lib/crm-service.js";
import { buildDashboardPayload } from "./lib/dashboard-data.js";
import { handleIlocWebhook } from "./lib/iloc-webhook.js";
import { lerFoto } from "./lib/bira-fotos.js";
import {
  getLocalizadosData,
  ingestLocgramHit,
  locsDaConferencia,
  scopeLocalizados,
  updatePosicao,
} from "./lib/localizados-service.js";
import { baixarPdfEmitida, cancelarNfse, emitNfse, emitNfseLote, getNfseData, prepararPdf, upsertTomador } from "./lib/nfse-service.js";
import { getRadarData } from "./lib/radar-service.js";
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

    if (url.pathname === "/api/webhooks/iloc") {
      await handleIlocWebhook(req, res);
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const session = await loginWithPassword(body.usuario || body.user, body.senha || body.password);
      sendJson(res, 200, session);
      return;
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      sendJson(res, 200, { user: actorFromRequest(req) });
      return;
    }

    if (url.pathname === "/api/dashboard" && req.method === "GET") {
      requireAdmin(req);
      const force = url.searchParams.get("refresh") === "1";
      const data = await getDashboardData({ force });
      sendJson(res, 200, data);
      return;
    }

    if (url.pathname === "/api/vehicles" && req.method === "POST") {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const overwrite = Boolean(body.overwrite);
      const result = await addVehicleToGestor(body, { overwrite });
      cache.payload = null;
      cache.loadedAt = 0;
      sendJson(res, overwrite && result.updated ? 200 : 201, result);
      return;
    }

    if (url.pathname === "/api/crm" && req.method === "GET") {
      const actor = actorFromRequest(req);
      if (isConferencia(actor)) {
        sendJson(res, 403, { error: "Sem permissão." });
        return;
      }
      if (url.searchParams.get("preview") === "1") {
        if (actor.papel !== "admin") {
          sendJson(res, 403, { error: "Sem permissão." });
          return;
        }
        sendJson(res, 200, previewWhatsapp(url.searchParams.get("text") || ""));
        return;
      }
      sendJson(res, 200, await getCrmData(actor));
      return;
    }

    if (url.pathname === "/api/crm" && (req.method === "POST" || req.method === "PATCH")) {
      const actor = actorFromRequest(req);
      if (isConferencia(actor)) {
        sendJson(res, 403, { error: "Sem permissão." });
        return;
      }
      const body = await readJsonBody(req);
      const { status, data } = await dispatchCrmAction(body, actor);
      sendJson(res, status, data);
      return;
    }

    if (url.pathname === "/api/localizados/foto" && req.method === "GET") {
      const actor = requireAdminOuConferencia(req);
      const placa = url.searchParams.get("placa");
      if (isConferencia(actor)) {
        const lista = scopeLocalizados(await getLocalizadosData(), locsDaConferencia(actor.localizador));
        const placaOk = lista.dias.some((dia) => dia.items.some((it) => it.placa === String(placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "")));
        if (!placaOk) {
          sendJson(res, 404, { error: "Sem foto desta placa." });
          return;
        }
      }
      const body = await lerFoto(placa);
      if (!body) {
        sendJson(res, 404, { error: "Sem foto desta placa." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": body.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.end(body);
      return;
    }

    if (url.pathname === "/api/localizados" && req.method === "GET") {
      const actor = requireAdminOuConferencia(req);
      const force = url.searchParams.get("refresh") === "1";
      const data = await getLocalizadosData({ force });
      sendJson(res, 200, isConferencia(actor) ? scopeLocalizados(data, locsDaConferencia(actor.localizador)) : data);
      return;
    }

    if (url.pathname === "/api/localizados" && (req.method === "POST" || req.method === "PATCH")) {
      const actor = requireAdminOuConferencia(req);
      const body = await readJsonBody(req);
      const action = body.action || body.op;
      if (action === "ingest" || action === "locgram") {
        if (isConferencia(actor)) {
          sendJson(res, 403, { error: "Sem permissão." });
          return;
        }
        sendJson(res, 200, await ingestLocgramHit(body));
        return;
      }
      sendJson(
        res,
        200,
        await updatePosicao({
          ...body,
          ...(isConferencia(actor) ? { locs: locsDaConferencia(actor.localizador) } : {}),
        }),
      );
      return;
    }

    if (url.pathname === "/api/radar" && req.method === "GET") {
      requireAdmin(req);
      sendJson(res, 200, await getRadarData());
      return;
    }

    if (url.pathname === "/api/nfse/pdf" && req.method === "GET") {
      requireAdmin(req);
      const prep = await prepararPdf(url.searchParams.get("id"));
      if (!prep) {
        sendJson(res, 404, { error: "PDF desta nota ainda não está no sistema." });
        return;
      }
      const body = prep.buffer || (await (await import("./nfse-worker/danfse.js")).pdfDeHtml(prep.html));
      const filename = prep.filename;
      const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
      const encoded = encodeURIComponent(filename);
      const inline = url.searchParams.get("inline") === "1";
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": body.length,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": inline ? "private, no-store" : "private, max-age=86400",
      });
      res.end(body);
      return;
    }

    if (url.pathname === "/api/nfse" && req.method === "GET") {
      requireAdmin(req);
      sendJson(res, 200, await getNfseData());
      return;
    }

    if (url.pathname === "/api/nfse" && req.method === "POST") {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const action = body.action || body.op || "emit";

      if (action === "upsert_tomador" || action === "tomador") {
        sendJson(res, 200, await upsertTomador(body.tomador || body));
        return;
      }

      if (action === "emit" || action === "emitir") {
        sendJson(res, 200, await emitNfse(body));
        return;
      }

      if (action === "emit_lote" || action === "emitir_lote") {
        sendJson(res, 200, await emitNfseLote(body));
        return;
      }

      if (action === "baixar_pdf") {
        sendJson(res, 200, await baixarPdfEmitida(body));
        return;
      }

      if (action === "cancelar" || action === "cancel") {
        sendJson(res, 200, await cancelarNfse(body));
        return;
      }

      sendJson(res, 400, { error: "action inválida. Use: emit | emit_lote | baixar_pdf | cancelar | upsert_tomador" });
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`GPS BA Dashboard API → http://127.0.0.1:${PORT}`);
  console.log(`  POST /api/auth/login`);
  console.log(`  GET  /api/auth/me`);
  console.log(`  GET  /api/health`);
  listUsers()
    .then((users) => {
      const nomes = users.map((user) => user.usuario).join(", ");
      console.log(`  Acessos: ${nomes || "nenhum"}`);
    })
    .catch((error) => {
      console.error("Acessos:", error.message || error);
    });
  console.log(`  GET  /api/dashboard`);
  console.log(`  GET  /api/radar`);
  console.log(`  GET  /api/crm`);
  console.log(`  POST /api/crm`);
  console.log(`  POST /api/vehicles`);
  console.log(`  GET  /api/nfse`);
  console.log(`  GET  /api/nfse/pdf`);
  console.log(`  POST /api/nfse`);
  console.log(`  GET  /api/localizados`);
  console.log(`  GET  /api/localizados/foto`);
  console.log(`  POST /api/localizados`);
  console.log(`  POST /api/webhooks/iloc`);
});
