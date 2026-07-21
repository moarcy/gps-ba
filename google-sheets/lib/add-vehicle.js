import ExcelJS from "exceljs";
import {
  normalizeAssessoria,
  resolveContato,
} from "./assessoria-rules.js";
import {
  normalizePlaca,
  normalizeText,
  resolveDespesa,
  sortRecords,
  toExcelDate,
} from "./excel-utils.js";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";
import {
  ensureFechamentosSheet,
  readGestorRecords,
  writeControleSheet,
  writeFechamentosSheet,
} from "../sync-controle-diligencias.js";
import { DATA_CAPACITY } from "./monthly-closing.js";

const GESTOR_DATA_SHEET = "Planilha1";

function parseOptionalNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Aceita 1234.56 ou 1234,56 (sem milhar).
  const normalized = raw.includes(",") && !raw.includes(".")
    ? raw.replace(",", ".")
    : raw.replace(/\s/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toPlainRecord(row) {
  return {
    placa: row.placa,
    data: toExcelDate(row.data),
    loc1: row.loc1 || "",
    banco: row.banco || "",
    assessoria: row.assessoria || "",
    contato: row.contato || "",
    premio: row.premio ?? null,
    nfNr: row.nfNr || "",
    apoio: row.apoio ?? null,
    loc2: row.loc2 ?? null,
    guincho: row.guincho ?? null,
  };
}

/**
 * Monta o registro a partir do formulário (valida placa).
 */
export function buildVehicleInput(body = {}) {
  const placa = normalizePlaca(body.placa);
  if (!placa) {
    const err = new Error("Informe a placa do veículo.");
    err.status = 400;
    throw err;
  }

  const loc1 = normalizeText(body.loc1);
  const assessoria = normalizeAssessoria(body.assessoria);
  const contato = resolveContato(assessoria, body.contato);

  const premio = parseOptionalNumber(body.premio);
  const apoio = resolveDespesa("apoio", loc1, parseOptionalNumber(body.apoio));
  const loc2 = parseOptionalNumber(body.loc2);
  const guincho = resolveDespesa("guincho", loc1, parseOptionalNumber(body.guincho));

  return {
    placa,
    data: toExcelDate(body.data) || null,
    loc1,
    banco: normalizeText(body.banco),
    assessoria,
    contato,
    premio,
    nfNr: normalizeText(body.nfNr),
    apoio,
    loc2,
    guincho,
  };
}

/**
 * Adiciona (ou atualiza) um veículo na planilha do gestor (Planilha1).
 * Assim o registro entra na fonte do sync e não some no próximo merge.
 */
export async function addVehicleToGestor(body, { overwrite = false } = {}) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) {
    throw new Error("SPREADSHEET_ID_1 não configurado.");
  }

  const record = buildVehicleInput(body);
  const localPath = await downloadExcel(gestorId, { useCache: false });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);

  const worksheet = workbook.getWorksheet(GESTOR_DATA_SHEET);
  if (!worksheet) {
    throw new Error(`Aba ${GESTOR_DATA_SHEET} não encontrada na planilha do gestor.`);
  }

  const existing = readGestorRecords(worksheet);
  const alreadyExists = existing.has(record.placa);

  if (alreadyExists && !overwrite) {
    const err = new Error(
      `A placa ${record.placa} já existe. Marque sobrescrever para atualizar.`,
    );
    err.status = 409;
    err.code = "PLATE_EXISTS";
    throw err;
  }

  const list = [...existing.values()].map(toPlainRecord);
  if (alreadyExists) {
    const idx = list.findIndex((r) => r.placa === record.placa);
    list[idx] = { ...list[idx], ...record };
  } else {
    list.push(record);
  }

  if (list.length > DATA_CAPACITY) {
    const err = new Error(
      `Capacidade máxima de ${DATA_CAPACITY} veículos atingida. Aumente DATA_CAPACITY.`,
    );
    err.status = 400;
    throw err;
  }

  const sorted = sortRecords(list);
  writeControleSheet(worksheet, sorted);

  const fechamentos = ensureFechamentosSheet(workbook, GESTOR_DATA_SHEET);
  writeFechamentosSheet(fechamentos, sorted, GESTOR_DATA_SHEET);

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);

  return {
    ok: true,
    placa: record.placa,
    updated: alreadyExists,
    total: sorted.length,
    record,
  };
}
