import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
import { downloadExcel, uploadExcel, getFileMeta } from "./excel-drive-client.js";
import { parseLocgramChat } from "./lib/parse-locgram-chat.js";
import { ensureCrmSheets, readPipeline } from "./lib/crm-sheets.js";
import { readGestorRecords } from "./sync-controle-diligencias.js";
import { normalizePlaca, cellValue } from "./lib/excel-utils.js";
import {
  LOCALIZADOS_SHEET,
  buildLocalizados,
  buildMessageBlocks,
  renderTextDoc,
  writeLocalizadosSheet,
  auditLocalizados,
} from "./lib/localizados-status.js";
import {
  LOTES_SHEET,
  LOCALIZADOS_OPS_SHEET,
  buildLotes,
  renderLotesText,
  writeLotesSheet,
  writeLocalizadosOpsSheet,
  auditLotes,
  readAllChecklists,
  applyChecklist,
} from "./lib/localizador-lotes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const ZIP_NAME = "Conversa do WhatsApp com Locgram Atendimento (2).zip";
const TXT_NAME = "mensagens-assessorias-amanha.txt";
const LOTES_TXT = "lotes-localizadores.txt";

function extractChat() {
  const zip = path.join(__dirname, "..", ZIP_NAME);
  const outDir = path.join(__dirname, "..", "_locgram_zip_extract");
  if (!fs.existsSync(zip)) {
    throw new Error(`ZIP não encontrado: ${zip}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: "pipe" },
  );
  const txt = path.join(outDir, "Conversa do WhatsApp com Locgram Atendimento.txt");
  if (!fs.existsSync(txt)) {
    throw new Error("TXT do Locgram não saiu do ZIP.");
  }
  return txt;
}

function readSheetPlacas(ws) {
  const placas = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const p = normalizePlaca(cellValue(ws.getCell(r, 1)));
    if (p) placas.push(p);
  }
  return placas;
}

async function main() {
  const chatPath = extractChat();
  const text = fs.readFileSync(chatPath, "utf8");
  const parsed = parseLocgramChat(text);

  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw new Error("SPREADSHEET_ID_1 não configurado.");

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);

  const controleSheet = workbook.getWorksheet("Planilha1");
  if (!controleSheet) throw new Error("Planilha1 não encontrada.");
  const controle = readGestorRecords(controleSheet);
  const crmBy = new Map(
    readPipeline(ensureCrmSheets(workbook).pipeline).map((r) => [r.placa, r]),
  );

  const records = buildLocalizados(parsed, { crmBy, controle });
  const checklist = readAllChecklists(workbook);
  applyChecklist(records, checklist);
  const blocks = buildMessageBlocks(records);
  const lotes = buildLotes(records);
  const audit = auditLocalizados(records, parsed);
  const auditLote = auditLotes(lotes, records);

  writeLocalizadosSheet(workbook, records);
  writeLocalizadosOpsSheet(workbook, lotes);
  writeLotesSheet(workbook, lotes);
  await workbook.xlsx.writeFile(localPath);

  const txtPath = path.join(__dirname, "..", TXT_NAME);
  const lotesPath = path.join(__dirname, "..", LOTES_TXT);
  fs.writeFileSync(txtPath, renderTextDoc(records, blocks), "utf8");
  fs.writeFileSync(lotesPath, renderLotesText(lotes), "utf8");

  const meta = await getFileMeta(gestorId);
  await uploadExcel(gestorId, localPath);

  const verifyWb = new ExcelJS.Workbook();
  await verifyWb.xlsx.readFile(localPath);
  const ws = verifyWb.getWorksheet(LOCALIZADOS_SHEET);
  if (!ws) throw new Error("Aba não gravada no xlsx local.");
  const sheetPlacas = readSheetPlacas(ws);
  const recordPlacas = records.map((r) => r.placa);
  const sheetMissing = recordPlacas.filter((p) => !sheetPlacas.includes(p));
  const sheetExtra = sheetPlacas.filter((p) => !recordPlacas.includes(p));
  const sheetDups = sheetPlacas.filter((p, i) => sheetPlacas.indexOf(p) !== i);

  const report = {
    planilha: meta.name,
    aba: LOCALIZADOS_SHEET,
    abaOperacao: LOCALIZADOS_OPS_SHEET,
    abaLotes: LOTES_SHEET,
    txt: txtPath,
    lotesTxt: lotesPath,
    audit,
    auditLote,
    posUpload: {
      linhasNaAba: sheetPlacas.length,
      faltandoNaAba: sheetMissing,
      extraNaAba: sheetExtra,
      duplicadasNaAba: [...new Set(sheetDups)],
    },
  };

  const ok =
    audit.ok &&
    auditLote.ok &&
    sheetMissing.length === 0 &&
    sheetExtra.length === 0 &&
    sheetDups.length === 0;

  console.log(JSON.stringify({ ok, ...report }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
