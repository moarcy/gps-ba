import {
  applyVehicleCalcFormulas,
  cellHasFormula,
  cellValue,
  clearCell,
  DATE_FMT,
  normalizePlaca,
  toExcelDate,
} from "./excel-utils.js";
import { DATA_START, HEADER_ROW, HEADERS } from "./controle-sheet-theme.js";

function dateYear(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.getUTCFullYear();
}

function isoDay(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function restoreImpostoSaldoHeaders(worksheet) {
  const header = worksheet.getRow(HEADER_ROW);
  const imposto = header.getCell(12);
  const saldo = header.getCell(13);
  clearCell(imposto);
  clearCell(saldo);
  imposto.value = HEADERS[11];
  saldo.value = HEADERS[12];
  imposto.numFmt = "General";
  saldo.numFmt = "General";
}

/**
 * Cirúrgico: não reconstrói Planilha1.
 * - Coluna A: ano 20206 → 2026 e formato dd/MM/yyyy (Sheets trata mm como minuto).
 * - Imposto/Saldo em toda linha de dados (placa ou slot vazio).
 * Cabeçalho L2/M2 volta a ser texto — fórmula aí vira #REF! no .xlsx.
 */
export function patchControleDatesAndFormulas(worksheet) {
  const report = {
    datesFixed: [],
    formatsFixed: [],
    formulasAdded: [],
    headerRestored: false,
  };

  restoreImpostoSaldoHeaders(worksheet);
  report.headerRestored = true;

  const last = Math.max(worksheet.rowCount || 0, DATA_START);
  let lastPlated = DATA_START;
  for (let rowNumber = DATA_START; rowNumber <= last; rowNumber++) {
    if (normalizePlaca(cellValue(worksheet.getRow(rowNumber).getCell(6)))) {
      lastPlated = rowNumber;
    }
  }
  const formulaEnd = Math.min(last, Math.max(lastPlated + 40, DATA_START));

  for (let rowNumber = DATA_START; rowNumber <= last; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const placa = normalizePlaca(cellValue(row.getCell(6)));

    const dateCell = row.getCell(1);
    const current = dateCell.value;
    const fmt = String(dateCell.numFmt || "");
    const year = dateYear(current);
    const repaired = toExcelDate(current);

    if (placa) {
      const yearBroken = year != null && year > 2100;
      const formatBroken = fmt.includes("dd/mm/") && !fmt.includes("dd/MM/");
      const utcMidnight =
        current instanceof Date &&
        current.getUTCHours() === 0 &&
        current.getUTCMinutes() === 0;

      if (repaired && (yearBroken || formatBroken || utcMidnight)) {
        dateCell.value = repaired;
        report.datesFixed.push({
          row: rowNumber,
          placa,
          from: current instanceof Date ? current.toISOString() : String(current ?? ""),
          to: isoDay(repaired),
        });
      }

      if (fmt !== DATE_FMT) {
        dateCell.numFmt = DATE_FMT;
        if (!yearBroken && !formatBroken) {
          report.formatsFixed.push({ row: rowNumber, placa, from: fmt || "(vazio)" });
        }
      }
    }

    if (rowNumber <= formulaEnd && (!cellHasFormula(row.getCell(12)) || !cellHasFormula(row.getCell(13)))) {
      applyVehicleCalcFormulas(row, rowNumber, { headerRow: HEADER_ROW });
      report.formulasAdded.push({ row: rowNumber, placa: placa || "" });
    }
  }

  return report;
}
