import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { normalizeAssessoria, resolveContato } from "./lib/assessoria-rules.js";
import { LOCADOR_DESPESAS, cellNumber, cellValue, normalizePlaca, normalizeText } from "./lib/excel-utils.js";
import { DATA_CAPACITY, FECHAMENTOS_SHEET_NAME, monthKeyFromRecord } from "./lib/monthly-closing.js";
import {
  CONTROLE_SHEET_NAME,
  mergeControleRecords,
  readGestorRecords,
  readProducaoRecords,
} from "./sync-controle-diligencias.js";
import { downloadExcel } from "./excel-drive-client.js";

dotenv.config();

const DATA_START = 3;
const DATA_END = DATA_START + DATA_CAPACITY - 1;

function hasFormula(cell) {
  const v = cell?.value;
  return Boolean(v && typeof v === "object" && (v.formula || v.sharedFormula));
}

function cellFormulaOrText(cell) {
  const v = cell?.value;
  if (v && typeof v === "object" && v.formula) return String(v.formula);
  return normalizeText(cellValue(cell));
}

function auditDataSheet(worksheet, label) {
  const issues = [];
  let dataRows = 0;
  let emptySlots = 0;

  for (let row = DATA_START; row <= Math.min(DATA_END, worksheet.rowCount); row++) {
    const rowObj = worksheet.getRow(row);
    const placa = normalizePlaca(cellValue(rowObj.getCell(6)));

    if (!hasFormula(rowObj.getCell(12)) || !hasFormula(rowObj.getCell(13))) {
      issues.push({
        severity: "error",
        sheet: label,
        row,
        rule: "zona-dados-formula",
        detail: "Linha sem fórmula de Imposto/Saldo",
      });
    }

    if (!placa) {
      emptySlots += 1;
      continue;
    }

    dataRows += 1;
    if (cellNumber(rowObj.getCell(7)) == null) {
      issues.push({
        severity: "warn",
        sheet: label,
        row,
        placa,
        rule: "premio-vazio",
        detail: "Prêmio vazio",
      });
    }
  }

  return { dataRows, emptySlots, issues };
}

function auditFechamentosSheet(worksheet, label) {
  const issues = [];
  let closingRows = 0;
  let crossSheet = 0;

  for (let row = DATA_START; row <= worksheet.rowCount; row++) {
    const rowObj = worksheet.getRow(row);
    const text = cellFormulaOrText(rowObj.getCell(1));
    if (!text.toUpperCase().includes("FECHAMENTO")) continue;

    closingRows += 1;
    const premioF = rowObj.getCell(7).value?.formula || "";
    if (premioF.includes("SUMIFS") && premioF.includes("!")) crossSheet += 1;

    for (const col of [7, 9, 10, 11, 12, 13]) {
      if (!hasFormula(rowObj.getCell(col))) {
        issues.push({
          severity: "error",
          sheet: label,
          row,
          rule: "fechamento-formula",
          detail: `Coluna ${col} sem fórmula`,
        });
      }
    }
  }

  if (closingRows < 12) {
    issues.push({
      severity: "warn",
      sheet: label,
      rule: "meses-poucos",
      detail: `Apenas ${closingRows} linhas de fechamento (esperado ~24 meses + sem-data)`,
    });
  }

  return { closingRows, crossSheet, issues };
}

function auditMergedRules(records) {
  const issues = [];

  for (const record of records) {
    const loc = normalizeText(record.loc1).toUpperCase();
    const banco = normalizeText(record.banco).toUpperCase();

    if (loc && banco === loc) {
      issues.push({
        severity: "error",
        placa: record.placa,
        rule: "banco-loc",
        detail: `Banco igual ao localizador (${loc})`,
      });
    }

    const assessoria = normalizeAssessoria(record.assessoria);
    const contato = resolveContato(assessoria, record.contato);
    if (assessoria === "SCHULZE" && contato !== "GESSIKA") {
      issues.push({
        severity: "error",
        placa: record.placa,
        rule: "contato-schulze",
        detail: `Contato esperado GESSIKA, encontrado ${contato || "(vazio)"}`,
      });
    }
    if (assessoria === "PASCHOALOTTO" && contato !== "PROD") {
      issues.push({
        severity: "error",
        placa: record.placa,
        rule: "contato-paschoalotto",
        detail: `Contato esperado PROD, encontrado ${contato || "(vazio)"}`,
      });
    }

    if (loc === "BIRA") {
      const defaults = LOCADOR_DESPESAS.BIRA;
      if (record.apoio == null) {
        issues.push({
          severity: "warn",
          placa: record.placa,
          rule: "bira-apoio",
          detail: `Apoio BIRA esperado ${defaults.apoio}`,
        });
      }
      if (record.guincho == null) {
        issues.push({
          severity: "warn",
          placa: record.placa,
          rule: "bira-guincho",
          detail: `Guincho BIRA esperado ${defaults.guincho}`,
        });
      }
    }

    if (!record.data) {
      issues.push({
        severity: "warn",
        placa: record.placa,
        rule: "sem-data",
        detail: "Veículo sem data",
      });
    }
  }

  const byMonth = new Map();
  for (const record of records) {
    const key = monthKeyFromRecord(record);
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }

  return { issues, byMonth };
}

function printIssues(title, issues) {
  if (!issues.length) {
    console.log(`  ✓ ${title}: nenhum problema`);
    return;
  }
  console.log(`  ✗ ${title}: ${issues.length} item(ns)`);
  for (const issue of issues.slice(0, 25)) {
    const prefix = issue.row ? `linha ${issue.row}` : issue.placa || issue.sheet;
    console.log(`    [${issue.severity}] ${prefix} — ${issue.detail}`);
  }
  if (issues.length > 25) console.log(`    ... e mais ${issues.length - 25}`);
}

async function main() {
  console.log("=== Auditoria Controle Diligências ===\n");

  const gestorPath = await downloadExcel(process.env.SPREADSHEET_ID_1, { useCache: false });
  const producaoPath = await downloadExcel(process.env.SPREADSHEET_ID_2, { useCache: false });

  const gestorWb = new ExcelJS.Workbook();
  const producaoWb = new ExcelJS.Workbook();
  await gestorWb.xlsx.readFile(gestorPath);
  await producaoWb.xlsx.readFile(producaoPath);

  const gestorSheet = gestorWb.getWorksheet("Planilha1");
  const controleSheet = producaoWb.getWorksheet(CONTROLE_SHEET_NAME);
  const fechGestor = gestorWb.getWorksheet(FECHAMENTOS_SHEET_NAME);
  const fechProducao = producaoWb.getWorksheet(FECHAMENTOS_SHEET_NAME);

  if (!gestorSheet || !controleSheet) {
    throw new Error("Abas de veículos não encontradas.");
  }
  if (!fechGestor || !fechProducao) {
    throw new Error(`Aba '${FECHAMENTOS_SHEET_NAME}' não encontrada — rode npm run sync.`);
  }

  const gestorRecords = readGestorRecords(gestorSheet);
  const producaoRecords = readProducaoRecords(producaoWb);
  const merged = mergeControleRecords(gestorRecords, producaoRecords);
  const ruleAudit = auditMergedRules(merged);

  const gData = auditDataSheet(gestorSheet, "Planilha1");
  const pData = auditDataSheet(controleSheet, CONTROLE_SHEET_NAME);
  const gFech = auditFechamentosSheet(fechGestor, `Gestor/${FECHAMENTOS_SHEET_NAME}`);
  const pFech = auditFechamentosSheet(fechProducao, `Produção/${FECHAMENTOS_SHEET_NAME}`);

  console.log(`Registros unificados: ${merged.length}`);
  console.log(`Zona veículos: linhas ${DATA_START}–${DATA_END} (${DATA_CAPACITY} slots)`);
  console.log(`  Gestor → ${gData.dataRows} veíc., ${gData.emptySlots} livres`);
  console.log(`  Produção → ${pData.dataRows} veíc., ${pData.emptySlots} livres`);
  console.log(
    `Fechamentos: gestor ${gFech.closingRows} linhas (${gFech.crossSheet} cross-sheet), ` +
      `produção ${pFech.closingRows} linhas`,
  );
  console.log("Veículos por mês:");
  for (const [month, count] of [...ruleAudit.byMonth.entries()].sort().reverse()) {
    console.log(`  ${month}: ${count} veíc.`);
  }
  console.log("");

  const allIssues = [
    ...gData.issues,
    ...pData.issues,
    ...gFech.issues,
    ...pFech.issues,
    ...ruleAudit.issues,
  ];
  const sheetErrors = allIssues.filter((i) => i.severity === "error");
  const sheetWarns = allIssues.filter((i) => i.severity === "warn");

  printIssues("Erros", sheetErrors);
  printIssues("Avisos", sheetWarns);

  const semPremio = merged.filter((r) => r.premio == null);
  if (semPremio.length) {
    console.log(`\n  ⚠ ${semPremio.length} veículo(s) sem prêmio:`);
    console.log(`    ${semPremio.map((r) => r.placa).join(", ")}`);
  }

  console.log("\n---");
  if (sheetErrors.length === 0) {
    console.log("Resultado: OK.");
  } else {
    console.log(`Resultado: ${sheetErrors.length} erro(s).`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Erro na auditoria:", error.message);
  process.exit(1);
});
