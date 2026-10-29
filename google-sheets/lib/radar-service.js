import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";
import { cellValue, normalizePlaca, normalizeText } from "./excel-utils.js";
import { DATA_START, HEADER_ROW } from "./crm-constants.js";
import { attachInterceptAnalytics } from "../../telegram-radar/src/analytics.js";
import { buildRadarPayload } from "../../telegram-radar/src/geo.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RADAR_SHEET = "Radar Feira";

export const RADAR_HEADERS = [
  "id",
  "fp",
  "placa",
  "data_hora",
  "iso",
  "weekday",
  "hour",
  "camera",
  "faixa",
  "rota",
  "lat",
  "lon",
  "proprietario",
  "escritorio",
  "banco",
  "maps_url",
];

function jsonlPath() {
  return (
    process.env.RADAR_DATA_FILE ||
    path.join(__dirname, "..", "..", "telegram-radar", "data", "sightings.jsonl")
  );
}

export function readRadarJsonl() {
  const file = jsonlPath();
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function ensureRadarSheet(workbook) {
  let ws = workbook.getWorksheet(RADAR_SHEET);
  if (!ws) ws = workbook.addWorksheet(RADAR_SHEET);
  const headerRow = ws.getRow(HEADER_ROW);
  RADAR_HEADERS.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E3D" } };
  });
  headerRow.commit();
  return ws;
}

function sightingToRow(s) {
  return {
    id: s.id || "",
    fp: s.fp || "",
    placa: s.placa || "",
    data_hora: s.dataHora || "",
    iso: s.iso || "",
    weekday: s.weekday ?? "",
    hour: s.hour ?? "",
    camera: s.camera || "",
    faixa: s.faixa || "",
    rota: s.rota || "",
    lat: s.lat ?? "",
    lon: s.lon ?? "",
    proprietario: s.proprietario || "",
    escritorio: s.escritorio || "",
    banco: s.banco || "",
    maps_url: s.mapsUrl || "",
  };
}

function rowToSighting(raw) {
  const placa = normalizePlaca(raw.placa);
  if (!placa) return null;
  return {
    id: normalizeText(raw.id),
    fp: normalizeText(raw.fp),
    placa,
    dataHora: normalizeText(raw.data_hora),
    iso: normalizeText(raw.iso) || null,
    weekday: raw.weekday === "" ? null : Number(raw.weekday),
    hour: raw.hour === "" ? null : Number(raw.hour),
    camera: normalizeText(raw.camera),
    faixa: normalizeText(raw.faixa),
    rota: normalizeText(raw.rota),
    lat: raw.lat === "" ? null : Number(raw.lat),
    lon: raw.lon === "" ? null : Number(raw.lon),
    proprietario: normalizeText(raw.proprietario),
    escritorio: normalizeText(raw.escritorio),
    banco: normalizeText(raw.banco),
    mapsUrl: normalizeText(raw.maps_url),
  };
}

export async function syncRadarToSheet(sightings) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) return { ok: false, error: "SPREADSHEET_ID_1 não configurado" };

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const ws = ensureRadarSheet(workbook);

  if (ws.rowCount >= DATA_START) {
    ws.spliceRows(DATA_START, ws.rowCount - DATA_START + 1);
  }

  sightings.forEach((s, i) => {
    const data = sightingToRow(s);
    const row = ws.getRow(DATA_START + i);
    RADAR_HEADERS.forEach((key, col) => {
      row.getCell(col + 1).value = data[key] === "" ? null : data[key];
    });
    row.commit();
  });

  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);
  return { ok: true, sheet: RADAR_SHEET, rows: sightings.length };
}

export async function getRadarData() {
  let sightings = readRadarJsonl();
  if (!sightings.length) {
    try {
      sightings = await readRadarFromSheet();
    } catch {
      sightings = [];
    }
  }
  const payload = attachInterceptAnalytics(buildRadarPayload(sightings), sightings);
  payload.meta.source = sightings.length ? "jsonl" : "vazio";
  return payload;
}

async function readRadarFromSheet() {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) return [];
  const localPath = await downloadExcel(gestorId, { useCache: true });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const ws = workbook.getWorksheet(RADAR_SHEET);
  if (!ws) return [];
  const headers = RADAR_HEADERS;
  const out = [];
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const raw = {};
    headers.forEach((h, i) => {
      raw[h] = cellValue(ws.getCell(r, i + 1));
    });
    const s = rowToSighting(raw);
    if (s) out.push(s);
  }
  return out;
}
