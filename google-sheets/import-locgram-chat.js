import dotenv from "dotenv";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";
import { CRM_STATUS_LABELS } from "./lib/crm-constants.js";
import {
  appendTimelineRow,
  ensureCrmSheets,
  readPipeline,
  upsertPipelineRow,
} from "./lib/crm-sheets.js";
import { dedupeByFirstLocator, parseLocgramChat } from "./lib/parse-locgram-chat.js";
import { readGestorRecords } from "./sync-controle-diligencias.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHAT = path.join(
  __dirname,
  "..",
  "Conversa do WhatsApp com Locgram Atendimento.txt",
);

function plusDaysIso(days, from) {
  const base = from || new Date().toISOString().slice(0, 10);
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = { apply: false, file: DEFAULT_CHAT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--file") args.file = argv[++i];
  }
  return args;
}

async function loadExistingPlacas() {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw new Error("SPREADSHEET_ID_1 não configurado.");

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);

  const controleSheet = workbook.getWorksheet("Planilha1");
  if (!controleSheet) throw new Error("Planilha1 não encontrada.");

  const controle = readGestorRecords(controleSheet);
  const sheets = ensureCrmSheets(workbook);
  const crm = readPipeline(sheets.pipeline);

  return {
    workbook,
    localPath,
    sheets,
    controlePlacas: new Set(controle.keys()),
    crmPlacas: new Set(crm.map((r) => r.placa)),
    crmByPlaca: new Map(crm.map((r) => [r.placa, r])),
  };
}

async function main() {
  const { apply, file } = parseArgs(process.argv);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${file}`);
  }

  console.log(`Lendo chat: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  const parsed = parseLocgramChat(text);
  const { kept, duplicates, uniquePlacas } = dedupeByFirstLocator(parsed);

  console.log(`\n=== Parse Locgram ===`);
  console.log(`Mensagens "Nova ocorrência": ${parsed.length}`);
  console.log(`Placas únicas (1º loc): ${uniquePlacas}`);
  console.log(`Duplicadas ignoradas: ${duplicates.length}`);

  console.log(`\nBaixando planilha do gestor…`);
  const existing = await loadExistingPlacas();

  const toCreate = [];
  const skipControle = [];
  const skipCrm = [];

  for (const item of kept) {
    if (existing.controlePlacas.has(item.placa)) {
      skipControle.push(item);
      continue;
    }
    if (existing.crmPlacas.has(item.placa)) {
      skipCrm.push(item);
      continue;
    }
    toCreate.push(item);
  }

  console.log(`\n=== Cruzamento com planilha ===`);
  console.log(`Já no Controle (apreendidos/base) — skip: ${skipControle.length}`);
  console.log(`Já no CRM — skip: ${skipCrm.length}`);
  console.log(`Novos para importar: ${toCreate.length}`);

  if (duplicates.length) {
    const sample = duplicates.slice(0, 8);
    console.log(`\nEx. duplicados (mantém 1º loc):`);
    for (const d of sample) {
      console.log(
        `  ${d.placa}: 1º=${d.firstLocalizador || "(sem nome)"} ${d.firstData} | ignorado=${d.localizador || "(sem nome)"} ${d.dataOcorrencia}`,
      );
    }
  }

  if (toCreate.length) {
    console.log(`\nEx. novos:`);
    for (const item of toCreate.slice(0, 10)) {
      console.log(
        `  ${item.placa} | loc=${item.localizador || "—"} | ass=${item.assessoria || "—"} | ${item.dataOcorrencia}`,
      );
    }
  }

  const reportPath = path.join(__dirname, ".cache", "locgram-import-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        file,
        totals: {
          parsed: parsed.length,
          unique: uniquePlacas,
          duplicates: duplicates.length,
          skipControle: skipControle.length,
          skipCrm: skipCrm.length,
          toCreate: toCreate.length,
        },
        toCreate: toCreate.map((i) => ({
          placa: i.placa,
          localizador: i.localizador,
          assessoria: i.assessoria,
          dataOcorrencia: i.dataOcorrencia,
        })),
        skipControle: skipControle.map((i) => i.placa),
        skipCrm: skipCrm.map((i) => i.placa),
        duplicates: duplicates.slice(0, 200),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nRelatório: ${reportPath}`);

  if (!apply) {
    console.log(`\nDry-run OK. Para gravar no CRM: npm run import:locgram -- --apply`);
    return;
  }

  if (!toCreate.length) {
    console.log("\nNada novo para gravar.");
    return;
  }

  console.log(`\nGravando ${toCreate.length} ocorrências no CRM…`);
  const now = new Date().toISOString();

  for (const item of toCreate) {
    const record = {
      placa: item.placa,
      dataOcorrencia: item.dataOcorrencia,
      veiculo: item.veiculo || "",
      cor: item.cor || "",
      origem: item.origem || "",
      uf: item.uf || "",
      assessoria: item.assessoria || "",
      telefone: item.telefone || "",
      localizador: item.localizador || "",
      status: "nova",
      rastreado: false,
      temMandado: false,
      usaGuincho: false,
      patio: "",
      dataApreensao: null,
      dataEntradaPatio: null,
      dataSaidaPatio: null,
      valorDiaria: null,
      proximoContato: plusDaysIso(7, item.dataOcorrencia),
      observacoes: "",
      rawWhatsapp: item.rawWhatsapp || "",
      noControle: false,
      atualizadoEm: now,
    };

    upsertPipelineRow(existing.sheets.pipeline, record);
    appendTimelineRow(existing.sheets.timeline, {
      placa: item.placa,
      tipo: "whatsapp",
      dataHora: item.dataHora || now,
      mensagem: `Import Locgram — 1º loc: ${item.localizador || "—"}\nStatus: ${CRM_STATUS_LABELS.nova}`,
    });
  }

  existing.workbook.calcProperties.fullCalcOnLoad = true;
  await existing.workbook.xlsx.writeFile(existing.localPath);
  await uploadExcel(process.env.SPREADSHEET_ID_1.trim(), existing.localPath);

  console.log(`\nImport concluído: ${toCreate.length} placas novas no CRM Pipeline.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
