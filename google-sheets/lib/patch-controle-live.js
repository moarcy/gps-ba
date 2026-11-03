import ExcelJS from "exceljs";
import {
  DATE_FMT,
  cellValue,
  installControleCalcFormulas,
  normalizePlaca,
  toExcelDate,
} from "./excel-utils.js";
import { DATA_START, HEADER_ROW } from "./controle-sheet-theme.js";

function dateYear(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.getUTCFullYear();
}

/** `mm` / `m` no formato é minuto no Google Sheets e a data aparece como #VALUE!. */
export function dateFormatUsesMinutes(fmt) {
  const text = String(fmt || "");
  if (!text || text === "General" || text === "@") return false;
  return /m/i.test(text.replace(/MM/g, ""));
}

/**
 * Corrige o formato da coluna Data e ancora Imposto/Saldo numa fórmula só.
 * Não mexe em placa, prêmio nem nas outras colunas.
 */
export function healControleSheet(worksheet) {
  const report = {
    changed: false,
    formatsFixed: 0,
    datesRepaired: 0,
    formulasCleared: 0,
    formulasInstalled: 0,
  };
  if (!worksheet) return { ...report, skipped: true };

  const headerDate = worksheet.getRow(HEADER_ROW).getCell(1);
  if (dateFormatUsesMinutes(headerDate.numFmt)) {
    headerDate.numFmt = "General";
    report.changed = true;
  }

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < DATA_START) return;
    const dateCell = row.getCell(1);
    const placa = normalizePlaca(cellValue(row.getCell(6)));
    const current = dateCell.value;
    const hasDate = current instanceof Date || (typeof current === "number" && current > 20000);
    if (!placa && !hasDate) return;

    const year = dateYear(current);
    if (year != null && year > 2100) {
      const repaired = toExcelDate(current);
      if (repaired) {
        dateCell.value = repaired;
        report.datesRepaired += 1;
        report.changed = true;
      }
    }

    if (dateCell.numFmt !== DATE_FMT) {
      dateCell.numFmt = DATE_FMT;
      report.formatsFixed += 1;
      report.changed = true;
    }
  });

  if (worksheet.getColumn(1).numFmt !== DATE_FMT) {
    worksheet.getColumn(1).numFmt = DATE_FMT;
    report.changed = true;
  }

  const formulas = installControleCalcFormulas(worksheet, {
    headerRow: HEADER_ROW,
    dataStart: DATA_START,
  });
  report.formulasCleared = formulas.cleared;
  report.formulasInstalled = formulas.installed;
  if (formulas.cleared || formulas.installed) report.changed = true;

  return report;
}

export async function healControleFile(localPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const worksheet = workbook.getWorksheet("Planilha1");
  if (!worksheet) return { skipped: true, changed: false };

  const report = healControleSheet(worksheet);
  if (!report.changed) return report;

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  return report;
}

/** Compatível com o script antigo: o reparo agora é o heal da coluna inteira. */
export function patchControleDatesAndFormulas(worksheet) {
  const report = healControleSheet(worksheet);
  return {
    ...report,
    datesFixed: [],
    headerRestored: true,
    formulasAdded: report.formulasInstalled ? ["linhas"] : [],
  };
}
