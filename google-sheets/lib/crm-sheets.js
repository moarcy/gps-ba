import {
  CRM_PAGAMENTOS_SHEET,
  CRM_PIPELINE_SHEET,
  CRM_TIMELINE_SHEET,
  DATA_START,
  HEADER_ROW,
  PAGAMENTO_CATEGORIAS,
  PAGAMENTO_HEADERS,
  PIPELINE_HEADERS,
  TIMELINE_HEADERS,
} from "./crm-constants.js";
import {
  asNumber,
  cellValue,
  normalizePlaca,
  normalizeText,
  toExcelDate,
} from "./excel-utils.js";
import { normalizeAssessoria } from "./assessoria-rules.js";
import { normalizeLocalizador } from "./localizador-rules.js";
import { normalizePatio } from "./patio-rules.js";

function yn(value) {
  if (value === true || value === 1) return "S";
  if (value === false || value === 0) return "N";
  const t = normalizeText(value).toUpperCase();
  if (["S", "SIM", "YES", "TRUE", "1"].includes(t)) return "S";
  if (["N", "NAO", "NÃO", "NO", "FALSE", "0"].includes(t)) return "N";
  return "N";
}

function ynBool(value) {
  return yn(value) === "S";
}

function toIsoDate(value) {
  const d = toExcelDate(value);
  if (!d) return null;
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (typeof d === "number" && Number.isFinite(d)) {
    // Serial Excel (dias desde 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const utc = new Date(epoch + d * 86400000);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
    const day = String(utc.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const text = normalizeText(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return null;
}

function toIsoDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

function ensureSheet(workbook, name, headers) {
  let ws = workbook.getWorksheet(name);
  if (!ws) ws = workbook.addWorksheet(name);

  if (name === CRM_PAGAMENTOS_SHEET) {
    migratePagamentosLayout(ws);
  }

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
  ws.getColumn(1).width = 14;
  if (headers.includes("raw_whatsapp")) {
    ws.getColumn(headers.indexOf("raw_whatsapp") + 1).width = 36;
  }
  if (headers.includes("veiculo")) {
    ws.getColumn(headers.indexOf("veiculo") + 1).width = 28;
  }
  if (headers.includes("mensagem")) {
    ws.getColumn(headers.indexOf("mensagem") + 1).width = 40;
  }

  return ws;
}

/** Insere coluna categoria se a aba ainda estiver no layout antigo (sem categoria). */
function migratePagamentosLayout(ws) {
  const h4 = normalizeText(cellValue(ws.getCell(HEADER_ROW, 4))).toLowerCase();
  const h5 = normalizeText(cellValue(ws.getCell(HEADER_ROW, 5))).toLowerCase();
  if (h4 === "categoria") return;
  if (h4 !== "tipo" && h5 !== "assessoria") return;

  // Layout antigo: id, placa, data, tipo, assessoria, valor, pago, data_pago, nota
  // Novo:         id, placa, data, categoria, tipo, assessoria, valor, pago, data_pago, nota
  for (let r = ws.rowCount; r >= DATA_START; r--) {
    const hasData =
      cellValue(ws.getCell(r, 1)) ||
      cellValue(ws.getCell(r, 2)) ||
      cellValue(ws.getCell(r, 4));
    if (!hasData) continue;
    for (let col = 9; col >= 4; col--) {
      ws.getCell(r, col + 1).value = cellValue(ws.getCell(r, col));
    }
    const oldTipo = normalizeText(cellValue(ws.getCell(r, 5))).toLowerCase();
    if (PAGAMENTO_CATEGORIAS.includes(oldTipo)) {
      ws.getCell(r, 4).value = oldTipo;
      ws.getCell(r, 5).value = "pix";
    } else {
      ws.getCell(r, 4).value = "apreensao";
      // tipo já está na coluna 5 após o shift
    }
  }
}

export function ensureCrmSheets(workbook) {
  return {
    pipeline: ensureSheet(workbook, CRM_PIPELINE_SHEET, PIPELINE_HEADERS),
    timeline: ensureSheet(workbook, CRM_TIMELINE_SHEET, TIMELINE_HEADERS),
    pagamentos: ensureSheet(workbook, CRM_PAGAMENTOS_SHEET, PAGAMENTO_HEADERS),
  };
}

function readRowByHeaders(ws, rowNumber, headers) {
  const row = ws.getRow(rowNumber);
  const obj = {};
  headers.forEach((key, i) => {
    obj[key] = cellValue(row.getCell(i + 1));
  });
  return obj;
}

function writeRowByHeaders(ws, rowNumber, headers, data) {
  const row = ws.getRow(rowNumber);
  headers.forEach((key, i) => {
    const value = data[key];
    if (value === undefined) return;
    row.getCell(i + 1).value = value === "" ? null : value;
  });
  row.commit();
}

function daysBetween(startIso, endIso) {
  if (!startIso) return null;
  const start = new Date(`${startIso}T12:00:00`);
  const end = endIso ? new Date(`${endIso}T12:00:00`) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return Math.max(0, diff);
}

export function normalizePipelineRecord(raw) {
  const placa = normalizePlaca(raw.placa);
  if (!placa) return null;

  const dataEntrada = toIsoDate(raw.data_entrada_patio);
  const dataSaida = toIsoDate(raw.data_saida_patio);
  const diarias = daysBetween(dataEntrada, dataSaida);

  return {
    placa,
    dataOcorrencia: toIsoDate(raw.data_ocorrencia),
    veiculo: normalizeText(raw.veiculo),
    cor: normalizeText(raw.cor),
    origem: normalizeText(raw.origem),
    uf: normalizeText(raw.uf).toUpperCase(),
    assessoria: normalizeAssessoria(raw.assessoria),
    telefone: normalizeText(raw.telefone),
    localizador: normalizeLocalizador(raw.localizador, { emptyAsDefault: true }),
    status: normalizeText(raw.status) || "nova",
    rastreado: ynBool(raw.rastreado),
    temMandado: ynBool(raw.tem_mandado),
    usaGuincho: ynBool(raw.usa_guincho),
    patio: normalizePatio(raw.patio),
    dataApreensao: toIsoDate(raw.data_apreensao),
    dataEntradaPatio: dataEntrada,
    dataSaidaPatio: dataSaida,
    valorDiaria: asNumber(raw.valor_diaria),
    diarias,
    proximoContato: toIsoDate(raw.proximo_contato),
    observacoes: normalizeText(raw.observacoes),
    rawWhatsapp: normalizeText(raw.raw_whatsapp),
    noControle: ynBool(raw.no_controle),
    atualizadoEm: toIsoDateTime(raw.atualizado_em),
    _row: raw._row,
  };
}

export function pipelineToSheetRow(record) {
  return {
    placa: record.placa,
    data_ocorrencia: record.dataOcorrencia || null,
    veiculo: record.veiculo || "",
    cor: record.cor || "",
    origem: record.origem || "",
    uf: record.uf || "",
    assessoria: record.assessoria || "",
    telefone: record.telefone || "",
    localizador: record.localizador || "",
    status: record.status || "nova",
    rastreado: record.rastreado ? "S" : "N",
    tem_mandado: record.temMandado ? "S" : "N",
    usa_guincho: record.usaGuincho ? "S" : "N",
    patio: record.patio || "",
    data_apreensao: record.dataApreensao || null,
    data_entrada_patio: record.dataEntradaPatio || null,
    data_saida_patio: record.dataSaidaPatio || null,
    valor_diaria: record.valorDiaria ?? null,
    proximo_contato: record.proximoContato || null,
    observacoes: record.observacoes || "",
    raw_whatsapp: record.rawWhatsapp || "",
    no_controle: record.noControle ? "S" : "N",
    atualizado_em: record.atualizadoEm || new Date().toISOString(),
  };
}

export function readPipeline(ws) {
  const items = [];
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const raw = readRowByHeaders(ws, r, PIPELINE_HEADERS);
    raw._row = r;
    const item = normalizePipelineRecord(raw);
    if (item) items.push(item);
  }
  return items;
}

export function readTimeline(ws) {
  const items = [];
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const raw = readRowByHeaders(ws, r, TIMELINE_HEADERS);
    const placa = normalizePlaca(raw.placa);
    if (!placa && !raw.id) continue;
    items.push({
      id: normalizeText(raw.id) || `t-${r}`,
      dataHora: toIsoDateTime(raw.data_hora) || null,
      placa,
      tipo: normalizeText(raw.tipo) || "nota",
      mensagem: normalizeText(raw.mensagem),
      _row: r,
    });
  }
  return items.sort((a, b) => String(b.dataHora || "").localeCompare(String(a.dataHora || "")));
}

export function readPagamentos(ws) {
  const items = [];
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const raw = readRowByHeaders(ws, r, PAGAMENTO_HEADERS);
    const placa = normalizePlaca(raw.placa);
    if (!placa && !raw.id) continue;

    let categoria = normalizeText(raw.categoria).toLowerCase();
    let tipo = normalizeText(raw.tipo).toLowerCase() || "pix";

    // Retrocompat: se "tipo" antigo for uma categoria, migra na leitura.
    if (PAGAMENTO_CATEGORIAS.includes(tipo) && !categoria) {
      categoria = tipo;
      tipo = "pix";
    }
    if (!PAGAMENTO_CATEGORIAS.includes(categoria)) categoria = "apreensao";

    items.push({
      id: normalizeText(raw.id) || `p-${r}`,
      placa,
      dataPrevista: toIsoDate(raw.data_prevista),
      categoria,
      tipo,
      assessoria: normalizeText(raw.assessoria),
      valor: asNumber(raw.valor),
      pago: ynBool(raw.pago),
      dataPago: toIsoDate(raw.data_pago),
      nota: normalizeText(raw.nota),
      _row: r,
    });
  }
  return items.sort((a, b) =>
    String(a.dataPrevista || "").localeCompare(String(b.dataPrevista || "")),
  );
}

export function findPipelineRow(ws, placa) {
  const needle = normalizePlaca(placa);
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const p = normalizePlaca(cellValue(ws.getCell(r, 1)));
    if (p === needle) return r;
  }
  return null;
}

export function upsertPipelineRow(ws, record) {
  const existing = findPipelineRow(ws, record.placa);
  const rowNumber = existing || (() => {
    let last = DATA_START - 1;
    for (let r = DATA_START; r <= ws.rowCount; r++) {
      if (normalizePlaca(cellValue(ws.getCell(r, 1)))) last = r;
    }
    return last + 1;
  })();
  writeRowByHeaders(ws, rowNumber, PIPELINE_HEADERS, pipelineToSheetRow(record));
  return rowNumber;
}

export function appendTimelineRow(ws, event) {
  let last = DATA_START - 1;
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    if (cellValue(ws.getCell(r, 1)) || cellValue(ws.getCell(r, 3))) last = r;
  }
  const rowNumber = last + 1;
  const id = event.id || `t-${Date.now()}-${rowNumber}`;
  writeRowByHeaders(ws, rowNumber, TIMELINE_HEADERS, {
    id,
    data_hora: event.dataHora || new Date().toISOString(),
    placa: normalizePlaca(event.placa),
    tipo: event.tipo || "nota",
    mensagem: event.mensagem || "",
  });
  return id;
}

export function findPagamentoRow(ws, id) {
  const needle = normalizeText(id);
  if (!needle) return null;
  for (let r = DATA_START; r <= ws.rowCount; r++) {
    if (normalizeText(cellValue(ws.getCell(r, 1))) === needle) return r;
  }
  return null;
}

export function upsertPagamentoRow(ws, pagamento) {
  const existing = pagamento.id ? findPagamentoRow(ws, pagamento.id) : null;
  let rowNumber = existing;
  if (!rowNumber) {
    let last = DATA_START - 1;
    for (let r = DATA_START; r <= ws.rowCount; r++) {
      if (cellValue(ws.getCell(r, 1)) || cellValue(ws.getCell(r, 2))) last = r;
    }
    rowNumber = last + 1;
  }
  const id = pagamento.id || `p-${Date.now()}-${rowNumber}`;
  writeRowByHeaders(ws, rowNumber, PAGAMENTO_HEADERS, {
    id,
    placa: normalizePlaca(pagamento.placa),
    data_prevista: pagamento.dataPrevista || null,
    categoria: pagamento.categoria || "apreensao",
    tipo: pagamento.tipo || "pix",
    assessoria: pagamento.assessoria || "",
    valor: pagamento.valor ?? null,
    pago: pagamento.pago ? "S" : "N",
    data_pago: pagamento.dataPago || null,
    nota: pagamento.nota || "",
  });
  return id;
}

export { yn, ynBool, toIsoDate, daysBetween };
