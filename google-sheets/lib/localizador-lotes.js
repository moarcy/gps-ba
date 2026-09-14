import { ACAO, TARGET_LOCS } from "./localizados-status.js";
import { cellValue, normalizePlaca, normalizeText } from "./excel-utils.js";

export const POSICAO_OPCOES = ["Pendente", "Sim", "Não"];

export const POSICAO_FILL = {
  Sim: "FF86EFAC",
  Não: "FFFCA5A5",
  Pendente: "FFFDE68A",
};

export function normalizePosicao(value) {
  const t = normalizeText(value).toLowerCase();
  if (!t) return "";
  if (["sim", "s", "yes", "true", "1", "ok", "tenho"].includes(t)) return "Sim";
  if (["não", "nao", "n", "no", "false", "0"].includes(t)) return "Não";
  if (["pendente", "p", "?"].includes(t)) return "Pendente";
  return "";
}

export function readChecklist(ws) {
  const map = new Map();
  if (!ws) return map;
  let placaCol = 0;
  let posCol = 0;
  let obsCol = 0;
  const header = ws.getRow(2);
  header.eachCell((cell, col) => {
    const label = normalizeText(cell.value).toLowerCase();
    if (label === "placa") placaCol = col;
    if (label.startsWith("posição") || label.startsWith("posicao")) posCol = col;
    if (label === "obs" || label.startsWith("obs")) obsCol = col;
  });
  if (!placaCol) return map;
  for (let r = 3; r <= ws.rowCount; r++) {
    const placa = normalizePlaca(cellValue(ws.getCell(r, placaCol)));
    if (!placa) continue;
    const posicao = posCol ? normalizePosicao(cellValue(ws.getCell(r, posCol))) : "";
    const obs = obsCol ? normalizeText(cellValue(ws.getCell(r, obsCol))) : "";
    if (posicao || obs) map.set(placa, { posicao: posicao || "Pendente", obs });
  }
  return map;
}

export function applyChecklist(records, checklist) {
  for (const r of records) {
    const c = checklist.get(r.placa);
    const precisa = r.acao === ACAO.COBRAR || r.acao === ACAO.SEM_ASS;
    r.posicao = c?.posicao || (precisa ? "Pendente" : "");
    r.obsPosicao = c?.obs || "";
  }
}
export const LOTES_SHEET = "Lotes Localizador";
export const LOCALIZADOS_OPS_SHEET = "Localizados";
export const GAP_MINUTES = 45;
export const BATCH_SIZE = 6;

export function readAllChecklists(workbook) {
  const rank = { Sim: 3, Não: 3, Pendente: 1 };
  const map = new Map();
  for (const name of [LOCALIZADOS_OPS_SHEET, LOTES_SHEET, "Localizados Status"]) {
    const part = readChecklist(workbook.getWorksheet(name));
    for (const [placa, val] of part) {
      const prev = map.get(placa);
      if (!prev || (rank[val.posicao] || 0) >= (rank[prev.posicao] || 0)) {
        map.set(placa, {
          posicao: val.posicao || prev?.posicao || "Pendente",
          obs: val.obs || prev?.obs || "",
        });
      } else if (val.obs && !prev.obs) {
        map.set(placa, { ...prev, obs: val.obs });
      }
    }
  }
  return map;
}

export const TIPO = {
  JUNTO: "Juntos (mesma área)",
  SOLO: "Um por um",
  SEM_HORA: "Sem horário",
};

const TIPO_FILL = {
  [TIPO.JUNTO]: "FFD1FAE5",
  [TIPO.SOLO]: "FFDBEAFE",
  [TIPO.SEM_HORA]: "FFE5E7EB",
};

const LOC_ORDER = ["BIRA", "CARLOS", "MACIEL", "OUTROS"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(tsOrKey) {
  if (!tsOrKey) return "";
  if (typeof tsOrKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tsOrKey)) {
    const [, m, d] = tsOrKey.split("-");
    return `${d}/${m}`;
  }
  return formatWhen(tsOrKey).slice(0, 5);
}

export function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysAgo(ts, now) {
  if (!ts) return null;
  return Math.max(0, Math.floor((now - ts) / 86400000));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function assignLocator(record) {
  const hits = (record.hits || []).filter((h) => TARGET_LOCS.has(h.loc));
  if (hits.length) {
    hits.sort((a, b) => b.ts - a.ts);
    return { loc: hits[0].loc, ts: hits[0].ts, origem: hits[0].origem || "" };
  }
  if (record.locs?.has("MACIEL")) {
    return { loc: "MACIEL", ts: record.lastHitTs || 0, origem: record.origem || "" };
  }
  if (record.locs?.has("CARLOS")) {
    return { loc: "CARLOS", ts: record.lastHitTs || 0, origem: record.origem || "" };
  }
  if (record.locs?.has("BIRA")) {
    return { loc: "BIRA", ts: record.lastHitTs || 0, origem: record.origem || "" };
  }
  return {
    loc: record.lastHitLoc || "OUTROS",
    ts: record.lastHitTs || 0,
    origem: record.origem || "",
  };
}

function makeLote({ loc, num, total, tipo, items, now, dia }) {
  const times = items.map((x) => x.ts).filter(Boolean);
  const minTs = times.length ? Math.min(...times) : 0;
  const maxTs = times.length ? Math.max(...times) : 0;
  const idade = daysAgo(maxTs, now);
  let calor = "";
  if (!maxTs) calor = "";
  else if (idade <= 3) calor = "quente";
  else if (idade <= 14) calor = "morno";
  else calor = "frio";

  return {
    loc,
    num,
    total,
    id: `${loc}-${pad(num)}`,
    tipo,
    items,
    minTs,
    maxTs,
    idade,
    calor,
    dia: dia || (maxTs ? dayKey(maxTs) : ""),
    diaLabel: dia ? dayLabel(dia) : maxTs ? dayLabel(maxTs) : "",
    cidade: loc === "MACIEL" ? "Barreiras" : loc === "OUTROS" ? "Outras praças" : "Salvador",
  };
}

export function dica(lote) {
  if (lote.tipo === TIPO.JUNTO) {
    const a = formatWhen(lote.minTs);
    const b = formatWhen(lote.maxTs);
    const janela = a === b ? a : `${a} até ${b}`;
    return `Última posição ${lote.diaLabel}. Ronda ${janela}. Bateram quase juntos — devem estar perto.`;
  }
  if (lote.tipo === TIPO.SEM_HORA) {
    return "Estão na lista, mas o Locgram não tem horário. Confirma se lembra da área.";
  }
  return `Última posição ${lote.diaLabel || "sem data"}. Mesmo dia, horários espalhados. Confirma um por um, na ordem.`;
}

export function buildLotes(records, { now = Date.now(), gapMin = GAP_MINUTES, batchSize = BATCH_SIZE } = {}) {
  const gapMs = gapMin * 60 * 1000;
  const ativos = records.filter((r) => r.acao === ACAO.COBRAR || r.acao === ACAO.SEM_ASS);

  const byLoc = new Map();
  for (const rec of ativos) {
    const asg = assignLocator(rec);
    const loc = TARGET_LOCS.has(asg.loc) ? asg.loc : "OUTROS";
    const item = {
      rec,
      loc,
      ts: asg.ts || 0,
      origem: asg.origem,
      placa: rec.placa,
      veiculo: rec.veiculo || "",
      cidade: rec.cidade || "",
      rastreado: rec.rastreado,
      dia: asg.ts ? dayKey(asg.ts) : "",
    };
    if (!byLoc.has(loc)) byLoc.set(loc, []);
    byLoc.get(loc).push(item);
  }

  const lotes = [];

  for (const loc of [...LOC_ORDER, ...[...byLoc.keys()].filter((k) => !LOC_ORDER.includes(k))]) {
    const items = byLoc.get(loc) || [];
    if (!items.length) continue;

    const withTime = items.filter((x) => x.ts);
    const noTime = items.filter((x) => !x.ts);
    const byDay = new Map();
    for (const it of withTime) {
      if (!byDay.has(it.dia)) byDay.set(it.dia, []);
      byDay.get(it.dia).push(it);
    }
    const daysNewestFirst = [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

    const raw = [];
    for (const dia of daysNewestFirst) {
      const dayItems = byDay.get(dia).sort((a, b) => a.ts - b.ts);
      for (const part of chunk(dayItems, batchSize)) {
        const span = part[part.length - 1].ts - part[0].ts;
        const tipo =
          part.length >= 2 && span <= gapMs ? TIPO.JUNTO : TIPO.SOLO;
        raw.push({ tipo, items: part, dia });
      }
    }
    for (const part of chunk(noTime, batchSize)) {
      raw.push({ tipo: TIPO.SEM_HORA, items: part, dia: "" });
    }

    raw.forEach((entry, i) => {
      lotes.push(
        makeLote({
          loc,
          num: i + 1,
          total: raw.length,
          tipo: entry.tipo,
          items: entry.items,
          now,
          dia: entry.dia,
        }),
      );
    });
  }

  for (const lote of lotes) {
    lote.dica = dica(lote);
    lote.items.forEach((it, idx) => {
      it.rec.loteId = lote.id;
      it.rec.loteTipo = lote.tipo;
      it.rec.loteSeq = idx + 1;
      it.rec.quandoBateu = formatWhen(it.ts);
      it.rec.loteCalor = lote.calor;
      it.rec.loteDia = lote.diaLabel;
    });
  }

  return lotes;
}

function lineCar(it) {
  const bits = [it.placa];
  if (it.veiculo) bits.push(it.veiculo);
  if (it.rastreado) bits.push("(rastreado)");
  if (it.ts) bits.push(`— bateu ${formatWhen(it.ts)}`);
  return bits.join(" ");
}

export function renderLotesText(lotes) {
  const L = [];
  L.push("GPS BA — LOTES PARA CONFERIR POSIÇÃO (COPIAR E MANDAR NO ZAP)");
  L.push("1 placa = última data que bateu (se localizou de novo, vale a última).");
  L.push("No dia, a ordem é do começo ao fim da ronda. Lote 1 = dia mais recente.");
  L.push("Marca na aba Localizados a coluna Posição?: Pendente / Sim / Não.");
  L.push("Manda 1 lote por vez. Máx. 6 carros.");
  L.push("");

  const byLoc = new Map();
  for (const lote of lotes) {
    if (!byLoc.has(lote.loc)) byLoc.set(lote.loc, []);
    byLoc.get(lote.loc).push(lote);
  }

  for (const loc of LOC_ORDER) {
    const group = byLoc.get(loc);
    if (!group?.length) continue;
    const cidade = group[0].cidade;
    const n = group.reduce((s, l) => s + l.items.length, 0);
    L.push("========================================================================");
    L.push(`${loc}  ·  ${cidade}  ·  ${n} carros em ${group.length} lotes`);
    L.push("========================================================================");
    L.push("");

    for (const lote of group) {
      L.push("------------------------------------------------------------------------");
      L.push(`${lote.id}   (${lote.num} de ${lote.total})   ${lote.diaLabel || "s/ data"}   ${lote.tipo}   ${lote.calor || ""}`);
      L.push("------------------------------------------------------------------------");
      L.push("");
      L.push(whatsappBody(lote, loc, cidade));
      L.push("");
    }
  }

  return L.join("\n") + "\n";
}

function primeiroNome(loc) {
  if (loc === "BIRA") return "Bira";
  if (loc === "CARLOS") return "Carlos";
  if (loc === "MACIEL") return "Maciel";
  return loc;
}

export function whatsappBody(lote, loc, cidade) {
  const nome = primeiroNome(loc);
  const lines = [];
  lines.push(`${nome}, lote ${lote.num} (${cidade}${lote.diaLabel ? `, ${lote.diaLabel}` : ""}).`);
  if (lote.num === 1) lines.push("Começa por esse.");
  lines.push("");
  lines.push(lote.dica);
  lines.push("");
  lote.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${lineCar(it)}`);
  });
  lines.push("");
  lines.push("Desses, quais você AINDA tem a posição?");
  lines.push("Quando terminar esse, te mando o próximo.");
  return lines.join("\n");
}

function horaLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateValue(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function resetSheet(ws, colCount) {
  const merges = [...(ws.model?.merges || [])];
  for (const range of merges) {
    try {
      ws.unMergeCells(range);
    } catch {
      // ignore
    }
  }
  if (ws.rowCount >= 1) ws.spliceRows(1, ws.rowCount);
}

export function writeLocalizadosOpsSheet(workbook, lotes) {
  const TITLE_ROW = 1;
  const HEADER_ROW = 2;
  const DATA_START = 3;
  const headers = [
    "Data",
    "Hora",
    "Local",
    "Localizador",
    "Placa",
    "Veículo",
    "Lote",
    "Posição?",
    "Obs",
  ];
  const POS_COL = 8;

  let ws = workbook.getWorksheet(LOCALIZADOS_OPS_SHEET);
  if (!ws) ws = workbook.addWorksheet(LOCALIZADOS_OPS_SHEET, { state: "visible" });
  ws.properties.tabColor = { argb: "FFB45309" };
  resetSheet(ws, headers.length);

  const counts = { Pendente: 0, Sim: 0, Não: 0 };
  const rows = [];
  for (const lote of lotes) {
    for (const it of lote.items) {
      const posicao = it.rec.posicao || "Pendente";
      if (counts[posicao] != null) counts[posicao] += 1;
      rows.push({ lote, it, posicao });
    }
  }

  ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, headers.length);
  const title = ws.getCell(TITLE_ROW, 1);
  title.value =
    `LOCALIZADOS — local + última data. Marque Posição? conforme o localizador: Pendente ${counts.Pendente} · Sim ${counts.Sim} · Não ${counts.Não}. Ordenado por data (mais recente em cima); no mesmo dia, ronda do começo ao fim.`;
  paintCell(title, { bg: "FF7C2D12", text: "FFFFFFFF", bold: true, size: 12 });
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  ws.getRow(TITLE_ROW).height = 28;

  const header = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    paintCell(cell, {
      bg: i + 1 === POS_COL ? "FFB45309" : "FF9A3412",
      text: "FFFFFFFF",
      bold: true,
    });
  });
  header.height = 18;
  header.commit();

  [12, 8, 14, 14, 13, 24, 12, 14, 32].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  rows.forEach((rowData, i) => {
    const { lote, it, posicao } = rowData;
    const row = ws.getRow(DATA_START + i);
    const dataCell = row.getCell(1);
    const dv = dateValue(it.ts);
    dataCell.value = dv;
    if (dv) dataCell.numFmt = "DD/MM/YYYY";
    paintCell(dataCell, { bg: "FFFFFFFF" });

    const values = [
      null,
      horaLabel(it.ts),
      lote.cidade,
      lote.loc,
      it.placa,
      it.veiculo || "",
      lote.id,
      posicao,
      it.rec.obsPosicao || "",
    ];
    values.forEach((value, col) => {
      if (col === 0) return;
      const cell = row.getCell(col + 1);
      cell.value = value === "" ? null : value;
      const isPos = col + 1 === POS_COL;
      paintCell(cell, {
        bg: isPos ? POSICAO_FILL[posicao] || "FFFDE68A" : "FFFFFFFF",
        bold: col === 4 || isPos,
      });
      if (col === 5 || col === 8) {
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
      if (isPos) {
        cell.dataValidation = {
          type: "list",
          allowBlank: false,
          formulae: ['"Pendente,Sim,Não"'],
          showErrorMessage: true,
          errorTitle: "Posição",
          error: "Escolha Pendente, Sim ou Não.",
        };
      }
    });
    row.height = 20;
    row.commit();
  });

  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + rows.length, column: headers.length },
  };
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 0, activeCell: "H3" }];
  return { rows: rows.length, checklist: counts };
}

function paintCell(cell, { bg, text = "FF111827", bold = false, size = 10 }) {
  cell.font = { name: "Arial", size, bold, color: { argb: text } };
  if (bg) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  }
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };
}

export function writeLotesSheet(workbook, lotes) {
  const TITLE_ROW = 1;
  const HEADER_ROW = 2;
  const DATA_START = 3;
  const headers = [
    "Localizador",
    "Lote",
    "Seq",
    "Placa",
    "Veículo",
    "Cidade",
    "Data",
    "Quando bateu",
    "Há quantos dias",
    "Tipo",
    "Dica",
    "Posição?",
    "Obs",
  ];
  const POS_COL = 12;
  const OBS_COL = 13;

  let ws = workbook.getWorksheet(LOTES_SHEET);
  if (!ws) ws = workbook.addWorksheet(LOTES_SHEET);
  ws.properties.tabColor = { argb: "FF047857" };

  const merges = [...(ws.model?.merges || [])];
  for (const range of merges) {
    try {
      ws.unMergeCells(range);
    } catch {
      // ignore
    }
  }
  if (ws.rowCount >= 1) ws.spliceRows(1, ws.rowCount);

  const counts = { Pendente: 0, Sim: 0, Não: 0 };
  for (const lote of lotes) {
    for (const it of lote.items) {
      const p = it.rec.posicao || "Pendente";
      if (counts[p] != null) counts[p] += 1;
    }
  }

  ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, headers.length);
  const title = ws.getCell(TITLE_ROW, 1);
  title.value =
    `Checklist de posição — 1 placa = última data. No dia, ordem da ronda (começo→fim). Lote 1 = dia mais recente. Marque Posição?: Pendente ${counts.Pendente} · Sim ${counts.Sim} · Não ${counts.Não}. Máx. 6 por lote.`;
  paintCell(title, { bg: "FF064E3B", text: "FFFFFFFF", bold: true, size: 12 });
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  ws.getRow(TITLE_ROW).height = 28;

  const header = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    paintCell(cell, {
      bg: i + 1 === POS_COL ? "FFB45309" : "FF047857",
      text: "FFFFFFFF",
      bold: true,
    });
  });
  header.height = 18;
  header.commit();

  const widths = [14, 12, 8, 13, 22, 22, 12, 16, 16, 22, 48, 14, 28];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  let r = 0;
  for (const lote of lotes) {
    lote.items.forEach((it, idx) => {
      const row = ws.getRow(DATA_START + r);
      const posicao = it.rec.posicao || "Pendente";
      const bg = TIPO_FILL[lote.tipo] || "FFFFFFFF";
      const values = [
        lote.loc,
        lote.id,
        idx + 1,
        it.placa,
        it.veiculo || "",
        it.cidade || lote.cidade,
        lote.diaLabel || "",
        formatWhen(it.ts),
        it.ts ? daysAgo(it.ts, Date.now()) : "",
        lote.tipo,
        lote.dica,
        posicao,
        it.rec.obsPosicao || "",
      ];
      values.forEach((value, col) => {
        const cell = row.getCell(col + 1);
        cell.value = value === "" ? null : value;
        const isPos = col + 1 === POS_COL;
        paintCell(cell, {
          bg: isPos ? POSICAO_FILL[posicao] || "FFFDE68A" : bg,
          bold: col === 3 || col === 1 || isPos,
        });
        if (col === 4 || col === 10 || col === 12) {
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        }
        if (isPos) {
          cell.dataValidation = {
            type: "list",
            allowBlank: false,
            formulae: ['"Pendente,Sim,Não"'],
            showErrorMessage: true,
            errorTitle: "Posição",
            error: "Escolha Pendente, Sim ou Não.",
          };
        }
      });
      row.height = 26;
      row.commit();
      r += 1;
    });
  }

  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + r, column: headers.length },
  };
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 0, activeCell: "L3" }];
  return { rows: r, lotes: lotes.length, checklist: counts };
}

export function auditLotes(lotes, records) {
  const ativos = records.filter((r) => r.acao === ACAO.COBRAR || r.acao === ACAO.SEM_ASS);
  const inLotes = lotes.flatMap((l) => l.items.map((i) => i.placa));
  const set = new Set(inLotes);
  const missing = ativos.map((r) => r.placa).filter((p) => !set.has(p));
  const dups = inLotes.filter((p, i) => inLotes.indexOf(p) !== i);
  const oversized = lotes.filter((l) => l.items.length > BATCH_SIZE);
  return {
    ok: missing.length === 0 && dups.length === 0 && oversized.length === 0,
    ativos: ativos.length,
    emLotes: set.size,
    nLotes: lotes.length,
    checklist: {
      Pendente: ativos.filter((r) => r.posicao === "Pendente").length,
      Sim: ativos.filter((r) => r.posicao === "Sim").length,
      Não: ativos.filter((r) => r.posicao === "Não").length,
    },
    missing,
    dups: [...new Set(dups)],
    oversized: oversized.map((l) => `${l.id}:${l.items.length}`),
    porLoc: Object.fromEntries(
      ["BIRA", "CARLOS", "MACIEL", "OUTROS"].map((loc) => {
        const g = lotes.filter((l) => l.loc === loc);
        return [
          loc,
          {
            lotes: g.length,
            carros: g.reduce((s, l) => s + l.items.length, 0),
            juntos: g.filter((l) => l.tipo === TIPO.JUNTO).length,
          },
        ];
      }),
    ),
  };
}

function headerKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?]/g, "")
    .trim();
}

export function sheetHeaderMap(ws, headerRow = 2) {
  const map = {};
  if (!ws) return map;
  ws.getRow(headerRow).eachCell((cell, col) => {
    const key = headerKey(cell.value);
    if (key) map[key] = col;
  });
  if (!map.posicao) {
    const key = Object.keys(map).find((k) => k.startsWith("posicao"));
    if (key) map.posicao = map[key];
  }
  if (!map.obs) {
    const key = Object.keys(map).find((k) => k === "obs" || k.startsWith("obs"));
    if (key) map.obs = map[key];
  }
  return map;
}

function parseSheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0) {
      return {
        y: value.getUTCFullYear(),
        m: value.getUTCMonth() + 1,
        d: value.getUTCDate(),
      };
    }
    return {
      y: value.getFullYear(),
      m: value.getMonth() + 1,
      d: value.getDate(),
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000;
    const d = new Date(utc);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const text = normalizeText(value);
  const m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return { y: year, m: month, d: day };
}

function parseHora(value) {
  const text = normalizeText(value);
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return { h: 0, min: 0, label: text };
  return { h: Number(m[1]), min: Number(m[2]), label: `${pad(Number(m[1]))}:${pad(Number(m[2]))}` };
}

export function readLocalizadosOps(ws) {
  const items = [];
  if (!ws) return items;
  const cols = sheetHeaderMap(ws, 2);
  const placaCol = cols.placa;
  if (!placaCol) return items;

  for (let r = 3; r <= ws.rowCount; r++) {
    const placa = normalizePlaca(cellValue(ws.getCell(r, placaCol)));
    if (!placa) continue;
    const dataVal = cols.data ? cellValue(ws.getCell(r, cols.data)) : null;
    const horaVal = cols.hora ? cellValue(ws.getCell(r, cols.hora)) : null;
    const parts = parseSheetDate(dataVal);
    const hora = parseHora(horaVal);
    let ts = 0;
    let dataLabel = "";
    if (parts) {
      dataLabel = `${pad(parts.d)}/${pad(parts.m)}`;
      ts = new Date(parts.y, parts.m - 1, parts.d, hora.h, hora.min, 0, 0).getTime();
    }
    const loc = normalizeText(cols.localizador ? cellValue(ws.getCell(r, cols.localizador)) : "").toUpperCase();
    const loteId = normalizeText(cols.lote ? cellValue(ws.getCell(r, cols.lote)) : "");
    items.push({
      placa,
      veiculo: normalizeText(cols.veiculo ? cellValue(ws.getCell(r, cols.veiculo)) : ""),
      local: normalizeText(cols.local ? cellValue(ws.getCell(r, cols.local)) : ""),
      loc: loc || "OUTROS",
      loteId,
      data: dataLabel,
      hora: hora.label,
      ts,
      posicao: normalizePosicao(cols.posicao ? cellValue(ws.getCell(r, cols.posicao)) : "") || "Pendente",
      obs: normalizeText(cols.obs ? cellValue(ws.getCell(r, cols.obs)) : ""),
    });
  }
  return items;
}

export function applyPosicaoOnWorksheet(ws, placa, posicao, obs) {
  if (!ws) return false;
  const cols = sheetHeaderMap(ws, 2);
  const placaCol = cols.placa;
  const posCol = cols.posicao;
  if (!placaCol || !posCol) return false;
  const wanted = normalizePlaca(placa);
  let found = false;
  for (let r = 3; r <= ws.rowCount; r++) {
    if (normalizePlaca(cellValue(ws.getCell(r, placaCol))) !== wanted) continue;
    found = true;
    const cell = ws.getCell(r, posCol);
    cell.value = posicao;
    const fill = POSICAO_FILL[posicao] || POSICAO_FILL.Pendente;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF111827" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    if (obs !== undefined && cols.obs) {
      ws.getCell(r, cols.obs).value = obs || null;
    }
  }
  return found;
}

function paintOpsCell(cell, { bg, bold = false, wrap = false }) {
  cell.font = { name: "Arial", size: 10, bold, color: { argb: "FF111827" } };
  if (bg) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  }
  cell.alignment = {
    vertical: "middle",
    horizontal: wrap ? "left" : "center",
    wrapText: wrap,
  };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  };
}

function lastPlacaRow(ws, placaCol) {
  let last = 2;
  for (let r = 3; r <= ws.rowCount; r++) {
    if (normalizePlaca(cellValue(ws.getCell(r, placaCol)))) last = r;
  }
  return last;
}

/** Inclui ou atualiza 1 placa na aba Localizados. Preserva Sim/Não. 1 placa = último hit. */
export function upsertLocalizadosOpsRow(ws, hit) {
  if (!ws) return { ok: false, reason: "no-sheet" };
  const cols = sheetHeaderMap(ws, 2);
  const placaCol = cols.placa;
  if (!placaCol) return { ok: false, reason: "no-placa-col" };

  const placa = normalizePlaca(hit.placa);
  if (!placa) return { ok: false, reason: "no-placa" };

  const ts = Number(hit.ts) || Date.now();
  const when = new Date(ts);
  const hora = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  const dateVal = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  const loc = String(hit.loc || "OUTROS").toUpperCase();
  const cidade = hit.cidade || hit.local || "";
  const veiculo = hit.veiculo || "";

  let rowNum = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    if (normalizePlaca(cellValue(ws.getCell(r, placaCol))) === placa) {
      rowNum = r;
      break;
    }
  }

  let created = false;
  let posicao = hit.posicao || "Pendente";
  if (rowNum) {
    const existing = readLocalizadosOps(ws).find((it) => it.placa === placa);
    if (existing?.ts && ts + 1000 < existing.ts) {
      return { ok: true, skipped: true, reason: "older", placa, posicao: existing.posicao };
    }
    posicao = existing?.posicao || "Pendente";
  } else {
    rowNum = lastPlacaRow(ws, placaCol) + 1;
    created = true;
    posicao = "Pendente";
  }

  const row = ws.getRow(rowNum);
  if (cols.data) {
    const cell = row.getCell(cols.data);
    cell.value = dateVal;
    cell.numFmt = "DD/MM/YYYY";
    paintOpsCell(cell, { bg: "FFFFFFFF" });
  }
  if (cols.hora) {
    const cell = row.getCell(cols.hora);
    cell.value = hora;
    paintOpsCell(cell, { bg: "FFFFFFFF" });
  }
  if (cols.local) {
    const cell = row.getCell(cols.local);
    cell.value = cidade || null;
    paintOpsCell(cell, { bg: "FFFFFFFF" });
  }
  if (cols.localizador) {
    const cell = row.getCell(cols.localizador);
    cell.value = loc;
    paintOpsCell(cell, { bg: "FFFFFFFF", bold: true });
  }
  {
    const cell = row.getCell(placaCol);
    cell.value = placa;
    paintOpsCell(cell, { bg: "FFFFFFFF", bold: true });
  }
  if (cols.veiculo) {
    const cell = row.getCell(cols.veiculo);
    cell.value = veiculo || null;
    paintOpsCell(cell, { bg: "FFFFFFFF", wrap: true });
  }
  if (cols.posicao) {
    const cell = row.getCell(cols.posicao);
    cell.value = posicao;
    paintOpsCell(cell, { bg: POSICAO_FILL[posicao] || POSICAO_FILL.Pendente, bold: true });
    cell.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Pendente,Sim,Não"'],
      showErrorMessage: true,
      errorTitle: "Posição",
      error: "Escolha Pendente, Sim ou Não.",
    };
  }
  row.height = 20;
  row.commit();
  return { ok: true, created, placa, loc, posicao, ts };
}
