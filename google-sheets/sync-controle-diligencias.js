import {
  asNumber,
  calcPremio,
  cellNumber,
  cellValue,
  formatNfNr,
  normalizePlaca,
  normalizeText,
  pickFirst,
  resolveDespesa,
  setFormula,
  sortRecords,
  toExcelDate,
} from "./lib/excel-utils.js";
import {
  normalizeAssessoria,
  resolveContato,
} from "./lib/assessoria-rules.js";
import {
  applyControleAutoFilter,
  applySaldoConditionalFormatting,
  buildControleSheetLayout,
  buildFechamentosSheetLayout,
  DATA_START,
  HEADER_ROW,
  styleControleClosingRow,
  styleControleDataRow,
  trimRowsAfter,
} from "./lib/controle-sheet-theme.js";
import {
  DATA_CAPACITY,
  FECHAMENTOS_SHEET_NAME,
  buildClosingMonthKeys,
  closingFormulasCrossSheet,
} from "./lib/monthly-closing.js";
import gestorBaseline from "./data/gestor-baseline.json" with { type: "json" };

const GESTOR_HEADER_ROW = HEADER_ROW;
const GESTOR_DATA_START = DATA_START;
const PRODUCAO_DATA_START = 4;
const CONTROLE_SHEET_NAME = "Controle Diligências";

export { CONTROLE_SHEET_NAME, FECHAMENTOS_SHEET_NAME, GESTOR_DATA_START, GESTOR_HEADER_ROW };

export function readGestorRecords(worksheet) {
  const records = new Map();

  for (let row = GESTOR_DATA_START; row <= worksheet.rowCount; row++) {
    const rawA = worksheet.getCell(row, 1).value;
    const label = normalizeText(cellValue(worksheet.getCell(row, 1)));
    const formulaA =
      rawA && typeof rawA === "object" && typeof rawA.formula === "string"
        ? rawA.formula
        : "";

    if (
      label.toUpperCase().includes("FECHAMENTO") ||
      formulaA.toUpperCase().includes("FECHAMENTO") ||
      label.toUpperCase().includes("FECHAMENTOS MENSAIS")
    ) {
      continue;
    }

    const placa = normalizePlaca(cellValue(worksheet.getCell(row, 6)));
    if (!placa) continue;

    records.set(placa, {
      source: "gestor",
      row,
      data: cellValue(worksheet.getCell(row, 1)),
      loc1: normalizeText(cellValue(worksheet.getCell(row, 2))),
      banco: normalizeText(cellValue(worksheet.getCell(row, 3))),
      assessoria: normalizeText(cellValue(worksheet.getCell(row, 4))),
      contato: normalizeText(cellValue(worksheet.getCell(row, 5))),
      placa,
      premio: cellNumber(worksheet.getCell(row, 7)),
      nfNr: normalizeText(cellValue(worksheet.getCell(row, 8))),
      apoio: cellNumber(worksheet.getCell(row, 9)),
      loc2: cellNumber(worksheet.getCell(row, 10)),
      guincho: cellNumber(worksheet.getCell(row, 11)),
      imposto: cellNumber(worksheet.getCell(row, 12)),
      saldo: cellNumber(worksheet.getCell(row, 13)),
    });
  }

  return records;
}

export function readProducaoRecords(workbook) {
  const recebimentos = workbook.getWorksheet("Recebimentos");
  const saidas = workbook.getWorksheet("Saídas");
  const apreensoes = workbook.getWorksheet("Apreensão");

  if (!recebimentos || !saidas) {
    throw new Error("Planilha avançada sem abas Recebimentos/Saídas.");
  }

  const byPlaca = new Map();

  for (let row = PRODUCAO_DATA_START; row <= recebimentos.rowCount; row++) {
    const placa = normalizePlaca(cellValue(recebimentos.getCell(row, 2)));
    if (!placa) continue;

    const recebimento = {
      row,
      loc1: normalizeText(cellValue(recebimentos.getCell(row, 3))),
      assessoria: normalizeText(cellValue(recebimentos.getCell(row, 4))),
      banco: normalizeText(cellValue(recebimentos.getCell(row, 5))),
      data: cellValue(recebimentos.getCell(row, 6)),
      qtdNfs: cellValue(recebimentos.getCell(row, 7)),
      apreensao: recebimentos.getCell(row, 8),
      guincho: recebimentos.getCell(row, 9),
      estadias: recebimentos.getCell(row, 10),
      formaPagamento: cellValue(recebimentos.getCell(row, 11)),
      totalEntrada: recebimentos.getCell(row, 17),
      outros: recebimentos.getCell(row, 15),
      plus: recebimentos.getCell(row, 16),
    };

    const saida = findSaidaByPlaca(saidas, placa);
    const apreensao = apreensoes ? findApreensaoByPlaca(apreensoes, placa) : null;

    byPlaca.set(placa, {
      source: "producao",
      recebimento,
      saida,
      apreensao,
    });
  }

  return byPlaca;
}

function findSaidaByPlaca(worksheet, placa) {
  for (let row = PRODUCAO_DATA_START; row <= worksheet.rowCount; row++) {
    if (normalizePlaca(cellValue(worksheet.getCell(row, 2))) === placa) {
      return {
        row,
        loc1: normalizeText(cellValue(worksheet.getCell(row, 3))),
        assessoria: normalizeText(cellValue(worksheet.getCell(row, 4))),
        banco: normalizeText(cellValue(worksheet.getCell(row, 5))),
        custoLoc: asNumber(cellValue(worksheet.getCell(row, 6))),
        custoGuincho: asNumber(cellValue(worksheet.getCell(row, 7))),
        apoio: asNumber(cellValue(worksheet.getCell(row, 9))),
      };
    }
  }
  return null;
}

function findApreensaoByPlaca(worksheet, placa) {
  for (let row = PRODUCAO_DATA_START; row <= worksheet.rowCount; row++) {
    if (normalizePlaca(cellValue(worksheet.getCell(row, 2))) === placa) {
      return {
        row,
        assessoria: normalizeText(cellValue(worksheet.getCell(row, 3))),
        banco: normalizeText(cellValue(worksheet.getCell(row, 4))),
        loc1: normalizeText(cellValue(worksheet.getCell(row, 5))),
        guincho: asNumber(cellValue(worksheet.getCell(row, 12))),
      };
    }
  }
  return null;
}

/** Banco real — nunca usa localizador (LOC) erroneamente preenchido. */
function resolveBanco({ baseline, gestor, rec, sai, apr, loc1 }) {
  const loc = normalizeText(loc1).toUpperCase();
  const candidates = [
    baseline?.banco,
    gestor?.banco,
    rec?.banco,
    sai?.banco,
    apr?.banco,
  ];

  for (const candidate of candidates) {
    const banco = normalizeText(candidate);
    if (!banco) continue;
    if (loc && banco.toUpperCase() === loc) continue;
    return banco;
  }

  return "";
}

export function mergeControleRecords(gestorRecords, producaoRecords) {
  const placas = new Set([...gestorRecords.keys(), ...producaoRecords.keys()]);
  const merged = [];

  for (const placa of placas) {
    const gestor = gestorRecords.get(placa);
    const baseline = gestorBaseline[placa];
    const prod = producaoRecords.get(placa);
    const rec = prod?.recebimento;
    const sai = prod?.saida;
    const apr = prod?.apreensao;

    const premioProducao = rec ? calcPremio(rec) : null;

    const loc1 = pickFirst(baseline?.loc1, gestor?.loc1, rec?.loc1, sai?.loc1, apr?.loc1);
    const banco = resolveBanco({ baseline, gestor, rec, sai, apr, loc1 });

    const assessoria = normalizeAssessoria(
      pickFirst(
        baseline?.assessoria,
        gestor?.assessoria,
        rec?.assessoria,
        sai?.assessoria,
        apr?.assessoria,
      ),
    );

    merged.push({
      placa,
      data: toExcelDate(pickFirst(rec?.data, gestor?.data)),
      loc1,
      banco,
      assessoria,
      contato: resolveContato(
        assessoria,
        pickFirst(baseline?.contato, gestor?.contato),
      ),
      premio: pickFirst(premioProducao, baseline?.premio, gestor?.premio),
      nfNr: formatNfNr({
        qtdNfs: rec?.qtdNfs,
        formaPagamento: rec?.formaPagamento,
        fallback: pickFirst(baseline?.nfNr, gestor?.nfNr),
      }),
      apoio: resolveDespesa("apoio", loc1, sai?.apoio, baseline?.apoio, gestor?.apoio),
      loc2: pickFirst(sai?.custoLoc, baseline?.loc2, gestor?.loc2),
      guincho: resolveDespesa(
        "guincho",
        loc1,
        sai?.custoGuincho,
        baseline?.guincho,
      ),
      fromGestor: Boolean(gestor),
      fromProducao: Boolean(prod),
      isNewForGestor: Boolean(prod && !gestor),
    });
  }

  return sortRecords(merged);
}

export function writeControleSheet(worksheet, records) {
  if (records.length > DATA_CAPACITY) {
    console.warn(
      `Atenção: ${records.length} veículos > capacidade ${DATA_CAPACITY}. ` +
        `Aumente DATA_CAPACITY em lib/monthly-closing.js.`,
    );
  }

  buildControleSheetLayout(worksheet);

  const dataEnd = DATA_START + DATA_CAPACITY - 1;

  const writeVehicleFormulas = (row, rowNumber) => {
    setFormula(row.getCell(12), `IF(G${rowNumber}="","",G${rowNumber}*13%)`);
    setFormula(
      row.getCell(13),
      `IF(G${rowNumber}="","",G${rowNumber}-I${rowNumber}-J${rowNumber}-K${rowNumber}-L${rowNumber})`,
    );
  };

  for (let i = 0; i < DATA_CAPACITY; i++) {
    const rowNumber = DATA_START + i;
    const row = worksheet.getRow(rowNumber);
    const record = records[i];

    if (record) {
      row.getCell(1).value = toExcelDate(record.data);
      row.getCell(2).value = record.loc1 || "";
      row.getCell(3).value = record.banco || "";
      row.getCell(4).value = record.assessoria || "";
      row.getCell(5).value = record.contato || "";
      row.getCell(6).value = record.placa;
      row.getCell(7).value = record.premio ?? null;
      row.getCell(8).value = record.nfNr || "";
      row.getCell(9).value = record.apoio ?? null;
      row.getCell(10).value = record.loc2 ?? null;
      row.getCell(11).value = record.guincho ?? null;
    } else {
      for (let col = 1; col <= 11; col++) {
        row.getCell(col).value = null;
      }
    }

    writeVehicleFormulas(row, rowNumber);
    styleControleDataRow(row, rowNumber, { zebra: i % 2 === 1 });
    row.commit();
  }

  trimRowsAfter(worksheet, dataEnd);
  applySaldoConditionalFormatting(worksheet, dataEnd);
  applyControleAutoFilter(worksheet, dataEnd);
}

/**
 * Aba separada de fechamentos: um mês por linha até dez/ano seguinte.
 * Totais leem a aba de veículos por DATA (coluna inteira).
 */
export function writeFechamentosSheet(worksheet, records, dataSheetName) {
  buildFechamentosSheetLayout(worksheet, dataSheetName);

  const monthKeys = buildClosingMonthKeys(records);
  let lastWrittenRow = HEADER_ROW;

  monthKeys.forEach((monthKey, index) => {
    const rowNumber = DATA_START + index;
    const row = worksheet.getRow(rowNumber);
    const formulas = closingFormulasCrossSheet(monthKey, dataSheetName, rowNumber);

    setFormula(row.getCell(1), formulas.label);
    for (let col = 2; col <= 6; col++) {
      row.getCell(col).value = null;
    }
    setFormula(row.getCell(7), formulas.premio);
    row.getCell(8).value = null;
    setFormula(row.getCell(9), formulas.apoio);
    setFormula(row.getCell(10), formulas.loc2);
    setFormula(row.getCell(11), formulas.guincho);
    setFormula(row.getCell(12), formulas.imposto);
    setFormula(row.getCell(13), formulas.saldo);

    worksheet.mergeCells(rowNumber, 1, rowNumber, 6);
    styleControleClosingRow(row, rowNumber);
    row.commit();
    lastWrittenRow = rowNumber;
  });

  trimRowsAfter(worksheet, lastWrittenRow);
  applySaldoConditionalFormatting(worksheet, lastWrittenRow);
}

export function ensureControleSheet(workbook) {
  let worksheet = workbook.getWorksheet(CONTROLE_SHEET_NAME);
  if (!worksheet) {
    worksheet = workbook.addWorksheet(CONTROLE_SHEET_NAME);
  }

  const listasIndex = workbook.worksheets.findIndex((ws) => ws.name === "Listas");
  if (listasIndex >= 0) {
    const currentIndex = workbook.worksheets.findIndex((ws) => ws.name === CONTROLE_SHEET_NAME);
    const desiredIndex = listasIndex + 1;
    if (currentIndex !== desiredIndex && currentIndex >= 0) {
      workbook.worksheets.splice(desiredIndex, 0, workbook.worksheets.splice(currentIndex, 1)[0]);
    }
  }

  return worksheet;
}

export function ensureFechamentosSheet(workbook, afterSheetName) {
  let worksheet = workbook.getWorksheet(FECHAMENTOS_SHEET_NAME);
  if (!worksheet) {
    worksheet = workbook.addWorksheet(FECHAMENTOS_SHEET_NAME);
  }

  const afterIndex = workbook.worksheets.findIndex((ws) => ws.name === afterSheetName);
  const currentIndex = workbook.worksheets.findIndex((ws) => ws.name === FECHAMENTOS_SHEET_NAME);
  if (afterIndex >= 0 && currentIndex >= 0) {
    const desiredIndex = afterIndex + 1;
    if (currentIndex !== desiredIndex) {
      workbook.worksheets.splice(desiredIndex, 0, workbook.worksheets.splice(currentIndex, 1)[0]);
    }
  }

  return worksheet;
}

export function summarizeSync(records, gestorRecords) {
  const novas = records.filter((record) => record.isNewForGestor);
  const atualizadas = records.filter((record) => record.fromGestor && record.fromProducao);

  return {
    total: records.length,
    gestorOriginal: gestorRecords.size,
    novasPlacas: novas.length,
    novasPlacasLista: novas.map((record) => record.placa),
    sincronizadas: atualizadas.length,
  };
}
