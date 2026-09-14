import {
  CONFIG_HEADERS,
  DATA_START,
  DEFAULT_CONFIG,
  DEFAULT_SERVICOS,
  EMITIDA_HEADERS,
  HEADER_ROW,
  NFSE_CONFIG_SHEET,
  NFSE_EMITIDAS_SHEET,
  NFSE_SERVICOS_SHEET,
  NFSE_TOMADORES_SHEET,
  SERVICO_HEADERS,
  TOMADOR_HEADERS,
} from "./nfse-constants.js";
import { asNumber, cellValue, normalizeText } from "./excel-utils.js";

function ensureSheet(workbook, name, headers) {
  let ws = workbook.getWorksheet(name);
  if (!ws) ws = workbook.addWorksheet(name);

  const headerRow = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF374151" },
    };
  });
  headerRow.commit();

  headers.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    if (!col.width || col.width < 12) col.width = 14;
  });

  return ws;
}

function onlyDigits(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function rowHasData(ws, row, colCount) {
  for (let c = 1; c <= colCount; c++) {
    if (normalizeText(cellValue(ws.getCell(row, c)))) return true;
  }
  return false;
}

export function ensureNfseSheets(workbook) {
  const tomadores = ensureSheet(workbook, NFSE_TOMADORES_SHEET, TOMADOR_HEADERS);
  const servicos = ensureSheet(workbook, NFSE_SERVICOS_SHEET, SERVICO_HEADERS);
  const config = ensureSheet(workbook, NFSE_CONFIG_SHEET, CONFIG_HEADERS);
  const emitidas = ensureSheet(workbook, NFSE_EMITIDAS_SHEET, EMITIDA_HEADERS);

  seedConfigIfEmpty(config);
  seedServicosIfEmpty(servicos);

  return { tomadores, servicos, config, emitidas };
}

function seedConfigIfEmpty(ws) {
  if (rowHasData(ws, DATA_START, CONFIG_HEADERS.length)) return;
  let row = DATA_START;
  for (const [chave, valor] of Object.entries(DEFAULT_CONFIG)) {
    ws.getRow(row).getCell(1).value = chave;
    ws.getRow(row).getCell(2).value = valor;
    row += 1;
  }
}

function seedServicosIfEmpty(ws) {
  if (rowHasData(ws, DATA_START, SERVICO_HEADERS.length)) return;
  DEFAULT_SERVICOS.forEach((svc, i) => {
    const row = ws.getRow(DATA_START + i);
    SERVICO_HEADERS.forEach((key, col) => {
      row.getCell(col + 1).value = svc[key] ?? "";
    });
  });
}

export function readConfig(ws) {
  const config = { ...DEFAULT_CONFIG };
  for (let row = DATA_START; row <= ws.rowCount; row++) {
    const chave = normalizeText(cellValue(ws.getCell(row, 1)));
    if (!chave) continue;
    config[chave] = cellValue(ws.getCell(row, 2)) ?? "";
  }
  const aliquota = asNumber(config.aliquota);
  if (aliquota != null) config.aliquota = aliquota;
  return config;
}

export function readTomadores(ws) {
  const list = [];
  for (let row = DATA_START; row <= ws.rowCount; row++) {
    const documento = onlyDigits(cellValue(ws.getCell(row, 3)));
    const razao = normalizeText(cellValue(ws.getCell(row, 4)));
    if (!documento && !razao) continue;

    const id = normalizeText(cellValue(ws.getCell(row, 1))) || documento;
    list.push({
      id,
      tipo: normalizeText(cellValue(ws.getCell(row, 2))) || "CNPJ",
      documento,
      razaoSocial: razao,
      logradouro: normalizeText(cellValue(ws.getCell(row, 5))),
      numero: normalizeText(cellValue(ws.getCell(row, 6))),
      complemento: normalizeText(cellValue(ws.getCell(row, 7))),
      bairro: normalizeText(cellValue(ws.getCell(row, 8))),
      municipio: normalizeText(cellValue(ws.getCell(row, 9))),
      uf: normalizeText(cellValue(ws.getCell(row, 10))).toUpperCase(),
      cep: onlyDigits(cellValue(ws.getCell(row, 11))),
      pais: normalizeText(cellValue(ws.getCell(row, 12))) || "BRASIL",
      telefone: normalizeText(cellValue(ws.getCell(row, 13))),
      email: normalizeText(cellValue(ws.getCell(row, 14))),
      _row: row,
    });
  }
  return list;
}

export function readServicos(ws) {
  const list = [];
  for (let row = DATA_START; row <= ws.rowCount; row++) {
    const codigo = normalizeText(cellValue(ws.getCell(row, 1)));
    if (!codigo) continue;
    list.push({
      codigo,
      cnae: normalizeText(cellValue(ws.getCell(row, 2))),
      cnaeDescricao: normalizeText(cellValue(ws.getCell(row, 3))),
      servicoDescricao: normalizeText(cellValue(ws.getCell(row, 4))),
      descricaoPadrao: normalizeText(cellValue(ws.getCell(row, 5))),
      _row: row,
    });
  }
  return list;
}

export function readEmitidas(ws, { limit = 50 } = {}) {
  const list = [];
  for (let row = DATA_START; row <= ws.rowCount; row++) {
    const id = normalizeText(cellValue(ws.getCell(row, 1)));
    if (!id) continue;
    list.push({
      id,
      criadoEm: normalizeText(cellValue(ws.getCell(row, 2))),
      status: normalizeText(cellValue(ws.getCell(row, 3))),
      numeroNf: normalizeText(cellValue(ws.getCell(row, 4))),
      tomadorId: normalizeText(cellValue(ws.getCell(row, 5))),
      tomadorNome: normalizeText(cellValue(ws.getCell(row, 6))),
      servicoCodigo: normalizeText(cellValue(ws.getCell(row, 7))),
      cnae: normalizeText(cellValue(ws.getCell(row, 8))),
      descricao: normalizeText(cellValue(ws.getCell(row, 9))),
      quantidade: asNumber(cellValue(ws.getCell(row, 10))),
      valorUnitario: asNumber(cellValue(ws.getCell(row, 11))),
      valorTotal: asNumber(cellValue(ws.getCell(row, 12))),
      aliquota: asNumber(cellValue(ws.getCell(row, 13))),
      dataFato: normalizeText(cellValue(ws.getCell(row, 14))),
      erro: normalizeText(cellValue(ws.getCell(row, 15))),
      _row: row,
    });
  }
  list.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return list.slice(0, limit);
}

export function upsertTomadorRow(ws, tomador) {
  const documento = onlyDigits(tomador.documento);
  if (!documento) {
    const err = new Error("Informe o CPF/CNPJ do tomador.");
    err.status = 400;
    throw err;
  }

  const existing = readTomadores(ws).find((t) => t.documento === documento);
  const row = existing?._row || findNextEmptyRow(ws, TOMADOR_HEADERS.length);
  const id = normalizeText(tomador.id) || documento;

  const values = [
    id,
    normalizeText(tomador.tipo) || (documento.length <= 11 ? "CPF" : "CNPJ"),
    documento,
    normalizeText(tomador.razaoSocial || tomador.razao_social),
    normalizeText(tomador.logradouro),
    normalizeText(tomador.numero),
    normalizeText(tomador.complemento),
    normalizeText(tomador.bairro),
    normalizeText(tomador.municipio),
    normalizeText(tomador.uf).toUpperCase(),
    onlyDigits(tomador.cep),
    normalizeText(tomador.pais) || "BRASIL",
    normalizeText(tomador.telefone),
    normalizeText(tomador.email),
  ];

  values.forEach((value, i) => {
    ws.getRow(row).getCell(i + 1).value = value || "";
  });

  return {
    id,
    tipo: values[1],
    documento,
    razaoSocial: values[3],
    logradouro: values[4],
    numero: values[5],
    complemento: values[6],
    bairro: values[7],
    municipio: values[8],
    uf: values[9],
    cep: values[10],
    pais: values[11],
    telefone: values[12],
    email: values[13],
  };
}

export function appendEmitidaRow(ws, emitida) {
  const row = findNextEmptyRow(ws, EMITIDA_HEADERS.length);
  const values = [
    emitida.id,
    emitida.criadoEm,
    emitida.status,
    emitida.numeroNf || "",
    emitida.tomadorId || "",
    emitida.tomadorNome || "",
    emitida.servicoCodigo || "",
    emitida.cnae || "",
    emitida.descricao || "",
    emitida.quantidade ?? "",
    emitida.valorUnitario ?? "",
    emitida.valorTotal ?? "",
    emitida.aliquota ?? "",
    emitida.dataFato || "",
    emitida.erro || "",
  ];
  values.forEach((value, i) => {
    ws.getRow(row).getCell(i + 1).value = value;
  });
  return { ...emitida, _row: row };
}

export function updateEmitidaRow(ws, id, patch) {
  const list = readEmitidas(ws, { limit: 5000 });
  const found = list.find((e) => e.id === id);
  if (!found) return null;

  const merged = { ...found, ...patch };
  const values = [
    merged.id,
    merged.criadoEm,
    merged.status,
    merged.numeroNf || "",
    merged.tomadorId || "",
    merged.tomadorNome || "",
    merged.servicoCodigo || "",
    merged.cnae || "",
    merged.descricao || "",
    merged.quantidade ?? "",
    merged.valorUnitario ?? "",
    merged.valorTotal ?? "",
    merged.aliquota ?? "",
    merged.dataFato || "",
    merged.erro || "",
  ];
  values.forEach((value, i) => {
    ws.getRow(found._row).getCell(i + 1).value = value;
  });
  return merged;
}

function findNextEmptyRow(ws, colCount) {
  for (let row = DATA_START; row <= ws.rowCount + 1; row++) {
    if (!rowHasData(ws, row, colCount)) return row;
  }
  return ws.rowCount + 1;
}

export function buildBankItem(config) {
  return {
    descricao: normalizeText(config.dados_bancarios) || DEFAULT_CONFIG.dados_bancarios,
    quantidade: 0,
    valorUnitario: 0,
    valorTotal: 0,
  };
}

export function buildEmissionItems({ descricao, quantidade, valorUnitario, config }) {
  const qtd = asNumber(quantidade) ?? 0;
  const unit = asNumber(valorUnitario) ?? 0;
  const total = Number((qtd * unit).toFixed(2));
  return [
    {
      descricao: normalizeText(descricao),
      quantidade: qtd,
      valorUnitario: unit,
      valorTotal: total,
    },
    buildBankItem(config),
  ];
}
