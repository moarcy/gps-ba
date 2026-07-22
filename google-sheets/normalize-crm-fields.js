/**
 * Regrava localizador + assessoria do CRM Pipeline com nomes canônicos.
 * Uso:
 *   node normalize-crm-fields.js
 *   node normalize-crm-fields.js --apply
 */
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";
import { normalizeAssessoria } from "./lib/assessoria-rules.js";
import { normalizeText } from "./lib/excel-utils.js";
import {
  ensureCrmSheets,
  readPipeline,
  upsertPipelineRow,
} from "./lib/crm-sheets.js";
import { normalizeLocalizador } from "./lib/localizador-rules.js";

dotenv.config();

function findCol(sheet, headerName) {
  const header = sheet.getRow(1);
  let found = 0;
  const want = normalizeText(headerName).toLowerCase();
  header.eachCell((cell, col) => {
    if (normalizeText(cell.value).toLowerCase() === want) found = col;
  });
  return found;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw new Error("SPREADSHEET_ID_1 não configurado.");

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const sheets = ensureCrmSheets(workbook);

  const locCol = findCol(sheets.pipeline, "localizador");
  const assCol = findCol(sheets.pipeline, "assessoria");
  if (!locCol || !assCol) {
    throw new Error("Colunas localizador/assessoria não encontradas.");
  }

  const pipeline = readPipeline(sheets.pipeline);
  const locChanges = [];
  const assChanges = [];

  for (const row of pipeline) {
    const excelRow = sheets.pipeline.getRow(row._row);
    const locBefore = normalizeText(excelRow.getCell(locCol).value);
    const assBefore = normalizeText(excelRow.getCell(assCol).value);
    const locAfter = normalizeLocalizador(locBefore, { emptyAsDefault: true });
    const assAfter = normalizeAssessoria(assBefore);

    const locChanged = locBefore !== locAfter;
    const assChanged = assBefore !== assAfter;
    if (!locChanged && !assChanged) continue;

    if (locChanged) {
      locChanges.push({
        placa: row.placa,
        before: locBefore || "(vazio)",
        after: locAfter || "(vazio)",
      });
    }
    if (assChanged) {
      assChanges.push({
        placa: row.placa,
        before: assBefore || "(vazio)",
        after: assAfter || "(vazio)",
      });
    }

    if (apply) {
      upsertPipelineRow(sheets.pipeline, {
        ...row,
        localizador: locAfter,
        assessoria: assAfter,
        atualizadoEm: new Date().toISOString(),
      });
    }
  }

  const summarize = (list) => {
    const summary = {};
    for (const c of list) {
      const key = `${c.before} → ${c.after}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    return summary;
  };

  console.log(`CRM Pipeline: ${pipeline.length} linhas`);
  console.log(`Localizador a alterar: ${locChanges.length}`);
  console.log(JSON.stringify(summarize(locChanges), null, 2));
  console.log(`Assessoria a alterar: ${assChanges.length}`);
  console.log(JSON.stringify(summarize(assChanges), null, 2));

  if (!apply) {
    console.log("\nDry-run. Rode com --apply para gravar na planilha.");
    return;
  }

  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);
  console.log(
    `\nAplicado e enviado ao Drive (loc=${locChanges.length}, ass=${assChanges.length}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
