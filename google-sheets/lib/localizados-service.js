import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import {
  GAP_MINUTES,
  LOCALIZADOS_OPS_SHEET,
  LOTES_SHEET,
  applyPosicaoOnWorksheet,
  normalizePosicao,
  readLocalizadosOps,
  upsertLocalizadosOpsRow,
} from "./localizador-lotes.js";
import { parseLocgramLive } from "./parse-locgram-live.js";

const LOC_META = {
  BIRA: { nome: "Bira", cidade: "Salvador" },
  CARLOS: { nome: "Carlos", cidade: "Salvador" },
  MACIEL: { nome: "Maciel", cidade: "Barreiras" },
  OUTROS: { nome: "Outros", cidade: "Outras praças" },
};

const LOC_ORDER = ["BIRA", "CARLOS", "MACIEL", "OUTROS"];
const STATUS_SHEET = "Localizados Status";
const GAP_MS = GAP_MINUTES * 60 * 1000;

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

function pad(n) {
  return String(n).padStart(2, "0");
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

function dayKeyOf(it) {
  if (it.ts) {
    const d = new Date(it.ts);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  const label = normalizeText(it.data);
  if (label) return `d-${label}`;
  return "sem-data";
}

function dayLabelOf(key, fallback) {
  if (key === "sem-data") return "sem data";
  if (key.startsWith("d-")) return key.slice(2);
  const parts = key.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return fallback || key;
}

function compareDays(a, b) {
  if (a === b) return 0;
  if (a === "sem-data") return 1;
  if (b === "sem-data") return -1;
  return a < b ? 1 : -1;
}

function temJuntos(items) {
  const times = items.map((x) => x.ts).filter(Boolean).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] <= GAP_MS) return true;
  }
  return false;
}

function lineCar(it) {
  const bits = [it.placa];
  if (it.veiculo) bits.push(it.veiculo);
  if (it.hora) bits.push(`— ${it.hora}`);
  return bits.join(" ");
}

function whatsappDia({ nome, cidade, diaLabel, items, juntos }) {
  const n = items.length;
  const lines = [];
  lines.push(`${nome}, ${diaLabel} (${cidade}) — ${n} carro${n === 1 ? "" : "s"}.`);
  lines.push("");
  if (diaLabel === "sem data") {
    lines.push("Estão na lista, mas o Locgram não tem horário. Confirma se ainda tem a posição.");
  } else {
    lines.push(`Última posição ${diaLabel}. Ordem da ronda, do primeiro horário ao último.`);
    if (juntos) {
      lines.push("Alguns bateram quase juntos no horário — devem estar na mesma área.");
    }
  }
  lines.push("");
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${lineCar(it)}`);
  });
  lines.push("");
  lines.push("Desses, quais você AINDA tem a posição?");
  lines.push("Quando terminar esse dia, te mando o próximo.");
  return lines.join("\n");
}

function serializeItem(it, diaId) {
  return {
    placa: it.placa,
    veiculo: it.veiculo,
    local: it.local,
    loc: it.loc,
    loteId: it.loteId || "",
    diaId,
    data: it.data,
    hora: it.hora,
    ts: it.ts,
    posicao: it.posicao,
    obs: it.obs,
  };
}

function buildPayload(items) {
  const buckets = new Map();
  for (const raw of items) {
    const loc = LOC_META[raw.loc] ? raw.loc : "OUTROS";
    const it = { ...raw, loc };
    const key = `${loc}|${dayKeyOf(it)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }

  const dias = [];
  for (const [key, group] of buckets) {
    const [loc, diaKey] = key.split("|");
    group.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.placa.localeCompare(b.placa));
    const diaLabel = dayLabelOf(diaKey, group[0]?.data);
    const cidade = group[0]?.local || LOC_META[loc]?.cidade || "";
    const juntos = temJuntos(group);
    const diaId = `${loc}-${diaKey}`;
    const counts = countPos(group);
    const dica = diaLabel === "sem data"
      ? "Sem horário no Locgram. Confirma se lembra da área."
      : juntos
        ? `Última posição ${diaLabel}. Ordem da ronda. Alguns bateram quase juntos — devem estar perto.`
        : `Última posição ${diaLabel}. Ordem da ronda, do primeiro horário ao último.`;
    dias.push({
      id: diaId,
      loc,
      diaKey,
      diaLabel,
      cidade,
      dica,
      juntos,
      whatsapp: whatsappDia({
        nome: LOC_META[loc].nome,
        cidade,
        diaLabel,
        items: group,
        juntos,
      }),
      pendente: counts.pendente,
      sim: counts.sim,
      nao: counts.nao,
      carros: counts.total,
      items: group.map((it) => serializeItem(it, diaId)),
    });
  }

  dias.sort((a, b) => {
    const ia = LOC_ORDER.indexOf(a.loc);
    const ib = LOC_ORDER.indexOf(b.loc);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return compareDays(a.diaKey, b.diaKey);
  });

  const locators = LOC_ORDER.map((id) => {
    const group = dias.filter((d) => d.loc === id);
    const locItems = group.flatMap((d) => d.items);
    const counts = countPos(locItems);
    const primeiroPendente = group.find((d) => d.pendente > 0);
    return {
      id,
      nome: LOC_META[id].nome,
      cidade: LOC_META[id].cidade,
      dias: group.length,
      primeiroPendente: primeiroPendente?.id || group[0]?.id || null,
      ...counts,
    };
  }).filter((l) => l.total > 0);

  return {
    locators,
    dias,
    lotes: dias,
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

  const item = payload.dias.flatMap((d) => d.items).find((it) => it.placa === plate);
  return { ok: true, placa: plate, posicao: next, obs: item?.obs || obsText || "", item, data: payload };
}

export async function ingestLocgramHit(body = {}) {
  const text = body.text || body.rawWhatsapp || body.message || "";
  const parsed = body.placa
    ? {
        ok: true,
        placa: normalizePlaca(body.placa),
        veiculo: normalizeText(body.veiculo),
        loc: String(body.loc || "OUTROS").toUpperCase(),
        cidade: body.cidade || body.local || "",
        ts: Number(body.ts) || Date.now(),
      }
    : parseLocgramLive(text, { receivedAt: body.ts });

  if (parsed.skip) {
    return { ok: true, skipped: true, reason: "not-locgram" };
  }
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.error || "Não deu para ler a ocorrência do Locgram."), {
      status: 400,
    });
  }

  const { workbook, localPath } = await loadWorkbook({ useCache: false });
  const ws = workbook.getWorksheet(LOCALIZADOS_OPS_SHEET);
  if (!ws) {
    throw Object.assign(
      new Error("Aba Localizados ainda não existe. Rode npm run localizados:status."),
      { status: 404, code: "NO_SHEET" },
    );
  }

  const result = upsertLocalizadosOpsRow(ws, parsed);
  if (!result.ok) {
    throw Object.assign(new Error("Falha ao gravar na aba Localizados."), { status: 500 });
  }
  if (result.skipped) {
    return { ok: true, ...result };
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId(), localPath);

  const payload = buildPayload(readLocalizadosOps(ws));
  cache.payload = payload;
  cache.loadedAt = Date.now();

  return {
    ok: true,
    ...result,
    item: payload.dias.flatMap((d) => d.items).find((it) => it.placa === result.placa) || null,
  };
}
