import dotenv from "dotenv";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";
import { CRM_STATUS_LABELS, FOLLOWUP_STATUSES } from "./lib/crm-constants.js";
import {
  appendTimelineRow,
  ensureCrmSheets,
  readPipeline,
  readTimeline,
  upsertPipelineRow,
} from "./lib/crm-sheets.js";
import { normalizeAssessoria } from "./lib/assessoria-rules.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, ".cache", "whatsapp-plate-logs.json");
const LOCKED = new Set([
  "apreendido",
  "no_patio",
  "aguardando_pagamento",
  "removido",
  "entregue",
]);

function plusDaysIso(days, from) {
  const base = from || new Date().toISOString().slice(0, 10);
  const d = new Date(`${base.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function blankRecord(row, now) {
  return {
    placa: row.placa,
    dataOcorrencia: (row.columnAt || now).slice(0, 10),
    veiculo: "",
    cor: "",
    origem: "",
    uf: "",
    assessoria: normalizeAssessoria(row.office),
    telefone: "",
    localizador: "",
    status: row.column || "nova",
    rastreado: false,
    temMandado: row.column === "com_mandado",
    usaGuincho: false,
    patio: "",
    dataApreensao: row.column === "apreendido" ? (row.columnAt || "").slice(0, 10) : null,
    dataEntradaPatio: null,
    dataSaidaPatio: null,
    valorDiaria: null,
    proximoContato: FOLLOWUP_STATUSES.has(row.column) ? plusDaysIso(7) : null,
    observacoes: "",
    rawWhatsapp: row.events.at(-1)?.phrase || "",
    noControle: false,
    atualizadoEm: now,
  };
}

function eventId(placa, iso) {
  return `zap-${placa}-${String(iso || "").replace(/[^\d]/g, "").slice(0, 14)}`;
}

function eventMessage(event) {
  const quem = event.fromMe ? "Você" : "Assessoria";
  const titulo = event.label || "Nota";
  return `${titulo} — ${quem}: ${event.phrase}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const payload = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
  const records = payload.records || [];
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw new Error("SPREADSHEET_ID_1 não configurado.");

  const baixado = await downloadExcel(gestorId, { versioned: true });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(baixado.localPath);
  const sheets = ensureCrmSheets(workbook);
  const pipeline = readPipeline(sheets.pipeline);
  const timeline = readTimeline(sheets.timeline);
  const byPlaca = new Map(pipeline.map((row) => [row.placa, row]));
  const seenIds = new Set(timeline.map((row) => row.id));

  let created = 0;
  let moved = 0;
  let noted = 0;
  let skippedLocked = 0;

  const now = new Date().toISOString();
  for (const row of records) {
    if (!row.events?.length) continue;
    let current = byPlaca.get(row.placa);
    if (!current && !row.column) continue;
    if (!current) {
      current = blankRecord(row, now);
      byPlaca.set(row.placa, current);
      upsertPipelineRow(sheets.pipeline, current);
      created += 1;
    } else if (row.column && !LOCKED.has(current.status) && current.status !== row.column) {
      current.status = row.column;
      if (row.column === "com_mandado") current.temMandado = true;
      if (row.column === "apreendido" && !current.dataApreensao) {
        current.dataApreensao = (row.columnAt || now).slice(0, 10);
      }
      if (FOLLOWUP_STATUSES.has(row.column) && !current.proximoContato) {
        current.proximoContato = plusDaysIso(7);
      }
      current.atualizadoEm = now;
      upsertPipelineRow(sheets.pipeline, current);
      moved += 1;
    } else if (row.column && LOCKED.has(current.status) && current.status !== row.column) {
      skippedLocked += 1;
    }

    for (const event of row.events) {
      const id = eventId(row.placa, event.iso);
      if (seenIds.has(id)) continue;
      appendTimelineRow(sheets.timeline, {
        id,
        placa: row.placa,
        tipo: "zap",
        dataHora: event.iso || now,
        mensagem: eventMessage(event),
      });
      seenIds.add(id);
      noted += 1;
    }
  }

  console.log(`Placas com log: ${records.length}`);
  console.log(`Cards novos: ${created}`);
  console.log(`Coluna atualizada: ${moved}`);
  console.log(`Coluna preservada (já apreendido/pátio/entregue): ${skippedLocked}`);
  console.log(`Eventos no histórico: ${noted}`);
  if (moved || created) {
    const sample = records.filter((row) => row.column).slice(0, 8);
    for (const row of sample) {
      console.log(`  ${row.placa} → ${CRM_STATUS_LABELS[row.column] || row.column}`);
    }
  }

  if (!apply) {
    console.log("Dry-run. Para gravar: node apply-whatsapp-plate-logs.js --apply");
    return;
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(baixado.localPath);
  await uploadExcel(gestorId, baixado.localPath, { etag: baixado.etag });
  console.log("CRM atualizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
