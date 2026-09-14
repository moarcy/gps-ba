import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import {
  GAP_MINUTES,
  LOCALIZADOS_OPS_SHEET,
  LOTES_SHEET,
  applyPosicaoOnWorksheet,
  dica,
  normalizePosicao,
  readLocalizadosOps,
  TIPO,
  whatsappBody,
} from "./localizador-lotes.js";

const LOC_META = {
  BIRA: { nome: "Bira", cidade: "Salvador" },
  CARLOS: { nome: "Carlos", cidade: "Salvador" },
  MACIEL: { nome: "Maciel", cidade: "Barreiras" },
  OUTROS: { nome: "Outros", cidade: "Outras praças" },
};

const LOC_ORDER = ["BIRA", "CARLOS", "MACIEL", "OUTROS"];
const STATUS_SHEET = "Localizados Status";

const cache = {
  payload: null,
  loadedAt: 0,
  ttlMs: 20_000,
};

function gestorId() {
  const id = process.env.SPREADSHEET_ID_1?.trim();
  if (!id) {
    throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });
  }
  return id;
}

export function invalidateLocalizadosCache() {
  cache.payload = null;
  cache.loadedAt = 0;
}

function countPos(items) {
  const counts = { pendente: 0, sim: 0, nao: 0, total: items.length };
  for (const it of items) {
    if (it.posicao === "Sim") counts.sim += 1;
    else if (it.posicao === "Não") counts.nao += 1;
    else counts.pendente += 1;
  }
  return counts;
}

function parseLoteNum(loteId) {
  const m = String(loteId || "").match(/(\d+)\s*$/);
  if (m) return Number(m[1]);
  return 0;
}

function inferTipo(items) {
  const times = items.map((x) => x.ts).filter(Boolean);
  if (!times.length) return TIPO.SEM_HORA;
  const span = Math.max(...times) - Math.min(...times);
  if (items.length >= 2 && span <= GAP_MINUTES * 60 * 1000) return TIPO.JUNTO;
  return TIPO.SOLO;
}

function buildPayload(items) {
  const byLote = new Map();
  for (const it of items) {
    const loc = LOC_META[it.loc] ? it.loc : "OUTROS";
    const loteId = it.loteId || `${loc}-00`;
    if (!byLote.has(loteId)) byLote.set(loteId, []);
    byLote.get(loteId).push({ ...it, loc });
  }

  const locLoteCount = {};
  for (const [loteId, group] of byLote) {
    const loc = group[0]?.loc || "OUTROS";
    locLoteCount[loc] = (locLoteCount[loc] || 0) + 1;
  }

  const lotes = [];
  for (const [loteId, group] of byLote) {
    const loc = group[0]?.loc || "OUTROS";
    const cidade = group[0]?.local || LOC_META[loc]?.cidade || "";
    const num = parseLoteNum(loteId);
    const tipo = inferTipo(group);
    const times = group.map((x) => x.ts).filter(Boolean);
    const minTs = times.length ? Math.min(...times) : 0;
    const maxTs = times.length ? Math.max(...times) : 0;
    const diaLabel = group.find((x) => x.data)?.data || "";
    const lote = {
      id: loteId,
      loc,
      num,
      total: locLoteCount[loc] || 1,
      tipo,
      items: group,
      minTs,
      maxTs,
      diaLabel,
      cidade,
    };
    lote.dica = dica(lote);
    lote.whatsapp = whatsappBody(lote, loc, cidade);
    const counts = countPos(group);
    lotes.push({
      id: lote.id,
      loc,
      num,
      total: lote.total,
      tipo: lote.tipo,
      dica: lote.dica,
      diaLabel,
      cidade,
      whatsapp: lote.whatsapp,
      pendente: counts.pendente,
      sim: counts.sim,
      nao: counts.nao,
      carros: counts.total,
      items: group.map((it) => ({
        placa: it.placa,
        veiculo: it.veiculo,
        local: it.local,
        loc: it.loc,
        loteId: lote.id,
        data: it.data,
        hora: it.hora,
        ts: it.ts,
        posicao: it.posicao,
        obs: it.obs,
      })),
    });
  }

  lotes.sort((a, b) => {
    const ia = LOC_ORDER.indexOf(a.loc);
    const ib = LOC_ORDER.indexOf(b.loc);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.num - b.num;
  });

  const locators = LOC_ORDER.map((id) => {
    const group = lotes.filter((l) => l.loc === id);
    const items = group.flatMap((l) => l.items);
    const counts = countPos(items);
    const primeiroPendente = group.find((l) => l.pendente > 0);
    return {
      id,
      nome: LOC_META[id].nome,
      cidade: LOC_META[id].cidade,
      lotes: group.length,
      primeiroPendente: primeiroPendente?.id || group[0]?.id || null,
      ...counts,
    };
  }).filter((l) => l.total > 0);

  return {
    locators,
    lotes,
    counts: countPos(items),
    sheet: LOCALIZADOS_OPS_SHEET,
  };
}

async function loadWorkbook({ useCache = false } = {}) {
  const localPath = await downloadExcel(gestorId(), { useCache });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  return { workbook, localPath };
}

export async function getLocalizadosData({ force = false } = {}) {
  if (!force && cache.payload && Date.now() - cache.loadedAt < cache.ttlMs) {
    return cache.payload;
  }

  const { workbook } = await loadWorkbook({ useCache: !force });
  const ws = workbook.getWorksheet(LOCALIZADOS_OPS_SHEET);
  if (!ws) {
    throw Object.assign(
      new Error("Aba Localizados ainda não existe. Rode npm run localizados:status."),
      { status: 404, code: "NO_SHEET" },
    );
  }

  const payload = buildPayload(readLocalizadosOps(ws));
  cache.payload = payload;
  cache.loadedAt = Date.now();
  return payload;
}

export async function updatePosicao({ placa, posicao, obs } = {}) {
  const plate = normalizePlaca(placa);
  if (!plate) {
    throw Object.assign(new Error("Informe a placa."), { status: 400 });
  }
  const next = normalizePosicao(posicao);
  if (!next) {
    throw Object.assign(new Error("Posição deve ser Pendente, Sim ou Não."), { status: 400 });
  }
  const obsText = obs === undefined ? undefined : normalizeText(obs);

  const { workbook, localPath } = await loadWorkbook({ useCache: false });
  const sheets = [LOCALIZADOS_OPS_SHEET, LOTES_SHEET, STATUS_SHEET];
  let found = false;
  for (const name of sheets) {
    if (applyPosicaoOnWorksheet(workbook.getWorksheet(name), plate, next, obsText)) {
      found = true;
    }
  }
  if (!found) {
    throw Object.assign(new Error(`Placa ${plate} não está na aba Localizados.`), { status: 404 });
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId(), localPath);

  const payload = buildPayload(readLocalizadosOps(workbook.getWorksheet(LOCALIZADOS_OPS_SHEET)));
  cache.payload = payload;
  cache.loadedAt = Date.now();

  const item = payload.lotes.flatMap((l) => l.items).find((it) => it.placa === plate);
  return { ok: true, placa: plate, posicao: next, obs: item?.obs || obsText || "", item, data: payload };
}
