import {
  cellNumber,
  cellValue,
  normalizePlaca,
  normalizeText,
  toExcelDate,
} from "./excel-utils.js";
import { monthKeyFromRecord } from "./monthly-closing.js";
import { DATA_START } from "./controle-sheet-theme.js";
import { DATA_CAPACITY } from "./monthly-closing.js";

const MONTH_LABELS = {
  "01": "JAN",
  "02": "FEV",
  "03": "MAR",
  "04": "ABR",
  "05": "MAI",
  "06": "JUN",
  "07": "JUL",
  "08": "AGO",
  "09": "SET",
  "10": "OUT",
  "11": "NOV",
  "12": "DEZ",
};

function formatMonthLabel(monthKey) {
  if (monthKey === "sem-data") return "SEM DATA";
  const [year, month] = monthKey.split("-");
  return `${MONTH_LABELS[month] || month}/${year}`;
}

function money(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function computeRow(record) {
  const premio = Number(record.premio) || 0;
  const apoio = Number(record.apoio) || 0;
  const loc2 = Number(record.loc2) || 0;
  const guincho = Number(record.guincho) || 0;
  const imposto = record.premio == null ? 0 : money(premio * 0.13);
  const saldo = record.premio == null ? null : money(premio - apoio - loc2 - guincho - imposto);

  return {
    placa: record.placa,
    data: record.data instanceof Date ? record.data.toISOString().slice(0, 10) : record.data,
    monthKey: monthKeyFromRecord(record),
    loc1: record.loc1 || "",
    banco: record.banco || "",
    assessoria: record.assessoria || "",
    contato: record.contato || "",
    nfNr: record.nfNr || "",
    premio: record.premio == null ? null : money(premio),
    apoio: record.apoio == null ? null : money(apoio),
    loc2: record.loc2 == null ? null : money(loc2),
    guincho: record.guincho == null ? null : money(guincho),
    imposto: record.premio == null ? null : imposto,
    saldo,
  };
}

function aggregateBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) || "(vazio)";
    if (!map.has(key)) {
      map.set(key, {
        key,
        veiculos: 0,
        premio: 0,
        apoio: 0,
        loc2: 0,
        guincho: 0,
        imposto: 0,
        saldo: 0,
        semPremio: 0,
      });
    }
    const bucket = map.get(key);
    bucket.veiculos += 1;
    if (row.premio == null) bucket.semPremio += 1;
    else {
      bucket.premio += row.premio;
      bucket.apoio += row.apoio || 0;
      bucket.loc2 += row.loc2 || 0;
      bucket.guincho += row.guincho || 0;
      bucket.imposto += row.imposto || 0;
      bucket.saldo += row.saldo || 0;
    }
  }

  return [...map.values()]
    .map((b) => ({
      ...b,
      premio: money(b.premio),
      apoio: money(b.apoio),
      loc2: money(b.loc2),
      guincho: money(b.guincho),
      imposto: money(b.imposto),
      saldo: money(b.saldo),
    }))
    .sort((a, b) => b.premio - a.premio || b.veiculos - a.veiculos);
}

export function buildDashboardPayload(records, { source = "gestor" } = {}) {
  const vehicles = records.map(computeRow);
  const byMonth = aggregateBy(vehicles, (r) => r.monthKey).map((m) => ({
    ...m,
    label: formatMonthLabel(m.key),
  }));

  // meses com data primeiro (cronológico), sem-data no fim
  byMonth.sort((a, b) => {
    if (a.key === "sem-data") return 1;
    if (b.key === "sem-data") return -1;
    return a.key.localeCompare(b.key);
  });

  const byAssessoria = aggregateBy(vehicles, (r) => r.assessoria);
  const byLoc1 = aggregateBy(vehicles, (r) => r.loc1);

  const withPremio = vehicles.filter((v) => v.premio != null);
  const totals = {
    veiculos: vehicles.length,
    comPremio: withPremio.length,
    semPremio: vehicles.length - withPremio.length,
    semData: vehicles.filter((v) => v.monthKey === "sem-data").length,
    saldoNegativo: vehicles.filter((v) => v.saldo != null && v.saldo < 0).length,
    premio: money(withPremio.reduce((a, v) => a + (v.premio || 0), 0)),
    apoio: money(withPremio.reduce((a, v) => a + (v.apoio || 0), 0)),
    loc2: money(withPremio.reduce((a, v) => a + (v.loc2 || 0), 0)),
    guincho: money(withPremio.reduce((a, v) => a + (v.guincho || 0), 0)),
    imposto: money(withPremio.reduce((a, v) => a + (v.imposto || 0), 0)),
    saldo: money(withPremio.reduce((a, v) => a + (v.saldo || 0), 0)),
  };

  const alerts = [];
  for (const v of vehicles) {
    if (v.premio == null) {
      alerts.push({ type: "sem-premio", placa: v.placa, message: "Sem prêmio preenchido" });
    }
    if (v.monthKey === "sem-data") {
      alerts.push({ type: "sem-data", placa: v.placa, message: "Sem data" });
    }
    if (v.saldo != null && v.saldo < 0) {
      alerts.push({
        type: "saldo-negativo",
        placa: v.placa,
        message: `Saldo negativo: R$ ${v.saldo.toFixed(2)}`,
      });
    }
  }

  const months = [...new Set(vehicles.map((v) => v.monthKey))].sort();
  const assessorias = [...new Set(vehicles.map((v) => v.assessoria).filter(Boolean))].sort();
  const localizadores = [...new Set(vehicles.map((v) => v.loc1).filter(Boolean))].sort();

  return {
    meta: {
      source,
      generatedAt: new Date().toISOString(),
      dataCapacity: DATA_CAPACITY,
      dataStart: DATA_START,
    },
    totals,
    vehicles,
    byMonth,
    byAssessoria,
    byLoc1,
    alerts,
    filters: {
      months: months.map((key) => ({ key, label: formatMonthLabel(key) })),
      assessorias,
      localizadores,
    },
  };
}

/** Lê veículos diretamente da aba (útil se quiser valores já gravados). */
export function readVehiclesFromSheet(worksheet) {
  const rows = [];
  const end = Math.min(worksheet.rowCount, DATA_START + DATA_CAPACITY - 1);

  for (let row = DATA_START; row <= end; row++) {
    const placa = normalizePlaca(cellValue(worksheet.getCell(row, 6)));
    if (!placa) continue;

    const data = toExcelDate(cellValue(worksheet.getCell(row, 1)));
    rows.push({
      placa,
      data,
      loc1: normalizeText(cellValue(worksheet.getCell(row, 2))),
      banco: normalizeText(cellValue(worksheet.getCell(row, 3))),
      assessoria: normalizeText(cellValue(worksheet.getCell(row, 4))),
      contato: normalizeText(cellValue(worksheet.getCell(row, 5))),
      premio: cellNumber(worksheet.getCell(row, 7)),
      nfNr: normalizeText(cellValue(worksheet.getCell(row, 8))),
      apoio: cellNumber(worksheet.getCell(row, 9)),
      loc2: cellNumber(worksheet.getCell(row, 10)),
      guincho: cellNumber(worksheet.getCell(row, 11)),
    });
  }

  return rows;
}
