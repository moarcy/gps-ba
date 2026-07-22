/**
 * Regrava localizadores do CRM Pipeline com nomes canônicos (BIRA, MACIEL…).
 * Uso:
 *   node normalize-crm-localizadores.js
 *   node normalize-crm-localizadores.js --apply
 */
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";
import { normalizeText } from "./lib/excel-utils.js";
import {
  ensureCrmSheets,
  readPipeline,
  upsertPipelineRow,
} from "./lib/crm-sheets.js";
import { normalizeLocalizador } from "./lib/localizador-rules.js";

dotenv.config();

function findLocalizadorCol(sheet) {
  const header = sheet.getRow(1);
  let locCol = 0;
  header.eachCell((cell, col) => {
    if (normalizeText(cell.value).toLowerCase() === "localizador") locCol = col;
  });
  return locCol;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw new Error("SPREADSHEET_ID_1 não configurado.");

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const sheets = ensureCrmSheets(workbook);
  const locCol = findLocalizadorCol(sheets.pipeline);
  if (!locCol) throw new Error("Coluna localizador não encontrada.");

  const pipeline = readPipeline(sheets.pipeline);
  const changes = [];

  for (const row of pipeline) {
    const before = normalizeText(sheets.pipeline.getRow(row._row).getCell(locCol).value);
    const after = normalizeLocalizador(before);
    if (before === after) continue;

    changes.push({
      placa: row.placa,
      before: before || "(vazio)",
      after: after || "(vazio)",
    });

    if (apply) {
      upsertPipelineRow(sheets.pipeline, {
        ...row,
        localizador: after,
        atualizadoEm: new Date().toISOString(),
      });
    }
  }

  const summary = {};
  for (const c of changes) {
    const key = `${c.before} → ${c.after}`;
    summary[key] = (summary[key] || 0) + 1;
  }

  console.log(`CRM Pipeline: ${pipeline.length} linhas`);
  console.log(`A alterar: ${changes.length}`);
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("\nDry-run. Rode com --apply para gravar na planilha.");
    return;
  }

  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);
  console.log(`\nAplicado e enviado ao Drive (${changes.length} localizadores).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
