import ExcelJS from "exceljs";
import os from "node:os";
import path from "node:path";
import { downloadExcel } from "../google-sheets/excel-drive-client.js";
import { buildDashboardPayload } from "../google-sheets/lib/dashboard-data.js";
import {
  mergeControleRecords,
  readGestorRecords,
  readProducaoRecords,
} from "../google-sheets/sync-controle-diligencias.js";

const cache = {
  payload: null,
  loadedAt: 0,
  ttlMs: 60_000,
};

async function loadMergedRecords() {
  const gestorId = process.env.SPREADSHEET_ID_1;
  const producaoId = process.env.SPREADSHEET_ID_2;
  if (!gestorId || !producaoId) {
    throw new Error("SPREADSHEET_ID_1 e SPREADSHEET_ID_2 são obrigatórios.");
  }

  // Em serverless (Vercel) o cache local do Drive pode ir para /tmp
  if (process.env.VERCEL) {
    process.env.GPS_BA_CACHE_DIR = path.join(os.tmpdir(), "gps-ba-cache");
  }

  const gestorPath = await downloadExcel(gestorId, { useCache: false });
  const producaoPath = await downloadExcel(producaoId, { useCache: false });

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const force = url.searchParams.get("refresh") === "1";
    const data = await getDashboardData({ force });
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erro interno" });
  }
}
