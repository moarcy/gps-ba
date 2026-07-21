import dotenv from "dotenv";
import ExcelJS from "exceljs";
import {
  CONTROLE_SHEET_NAME,
  FECHAMENTOS_SHEET_NAME,
  ensureControleSheet,
  ensureFechamentosSheet,
  mergeControleRecords,
  readGestorRecords,
  readProducaoRecords,
  summarizeSync,
  writeControleSheet,
  writeFechamentosSheet,
} from "./sync-controle-diligencias.js";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";

dotenv.config();

const GESTOR_FILE_ID = process.env.SPREADSHEET_ID_1;
const PRODUCAO_FILE_ID = process.env.SPREADSHEET_ID_2;
const GESTOR_DATA_SHEET = "Planilha1";

async function loadWorkbook(fileId) {
  const localPath = await downloadExcel(fileId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  return { workbook, localPath };
}

async function saveWorkbook(fileId, workbook, localPath) {
  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(fileId, localPath);
}

async function main() {
  console.log("=== Sincronização Controle Diligências ===\n");

  const gestorFile = await loadWorkbook(GESTOR_FILE_ID);
  const producaoFile = await loadWorkbook(PRODUCAO_FILE_ID);

  const gestorSheet = gestorFile.workbook.getWorksheet(GESTOR_DATA_SHEET);
  if (!gestorSheet) {
    throw new Error("Aba Planilha1 não encontrada na planilha do gestor.");
  }

  const gestorRecords = readGestorRecords(gestorSheet);
  const producaoRecords = readProducaoRecords(producaoFile.workbook);
  const mergedRecords = mergeControleRecords(gestorRecords, producaoRecords);
  const summary = summarizeSync(mergedRecords, gestorRecords);

  console.log(`Registros gestor: ${summary.gestorOriginal}`);
  console.log(`Registros produção: ${producaoRecords.size}`);
  console.log(`Total unificado: ${summary.total}`);
  console.log(`Placas novas adicionadas: ${summary.novasPlacas}`);
  if (summary.novasPlacasLista.length) {
    console.log(`  ${summary.novasPlacasLista.join(", ")}`);
  }
  console.log(`Placas sincronizadas: ${summary.sincronizadas}\n`);

  const controleProducaoSheet = ensureControleSheet(producaoFile.workbook);
  writeControleSheet(controleProducaoSheet, mergedRecords);
  const fechamentosProducao = ensureFechamentosSheet(
    producaoFile.workbook,
    CONTROLE_SHEET_NAME,
  );
  writeFechamentosSheet(fechamentosProducao, mergedRecords, CONTROLE_SHEET_NAME);

  writeControleSheet(gestorSheet, mergedRecords);
  const fechamentosGestor = ensureFechamentosSheet(
    gestorFile.workbook,
    GESTOR_DATA_SHEET,
  );
  writeFechamentosSheet(fechamentosGestor, mergedRecords, GESTOR_DATA_SHEET);

  console.log(`Salvando produção (${CONTROLE_SHEET_NAME} + ${FECHAMENTOS_SHEET_NAME})...`);
  await saveWorkbook(PRODUCAO_FILE_ID, producaoFile.workbook, producaoFile.localPath);

  console.log(`Salvando gestor (${GESTOR_DATA_SHEET} + ${FECHAMENTOS_SHEET_NAME})...`);
  await saveWorkbook(GESTOR_FILE_ID, gestorFile.workbook, gestorFile.localPath);

  console.log("\nSincronização concluída.");
  console.log(`- Veículos: aba de dados (200 slots com fórmulas)`);
  console.log(`- Fechamentos: aba '${FECHAMENTOS_SHEET_NAME}' (por DATA, até dez/ano seguinte)`);
}

main().catch((error) => {
  console.error("Erro na sincronização:", error.message);
  process.exit(1);
});
