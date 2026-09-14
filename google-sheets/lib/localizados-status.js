import { normalizePlaca } from "./excel-utils.js";
import { normalizeAssessoria, resolveContato } from "./assessoria-rules.js";

export const LOCALIZADOS_SHEET = "Localizados Status";
const TITLE_ROW = 1;
const HEADER_ROW = 2;
const DATA_START = 3;

export const CITY_BY_LOC = {
  BIRA: "Salvador",
  CARLOS: "Salvador",
  MACIEL: "Barreiras",
};

export const TARGET_LOCS = new Set(["BIRA", "CARLOS", "MACIEL"]);

const CLOSED_CRM = new Set([
  "apreendido",
  "no_patio",
  "entregue",
  "cancelado",
  "removido",
  "aguardando_pagamento",
]);

const CLOSED_BIRA =
  /apreendido|quitado|pago|em acordo|invi[aá]vel|n[aã]o apto|temporariamente inapto|outro localizador/i;

const EXTRA_ALIAS = [
  [/^gr\b/i, "GR"],
  [/^stocco/i, "STOCCO ADVOGADOS"],
  [/^zaitter/i, "ZAITER"],
  [/^eduardo albuquerque/i, "E ALBUQUERQUE"],
  [/^nelson willians/i, "NELSON WILLIANS"],
];

export const ACAO = {
  COBRAR: "COBRAR STATUS",
  SEM_ASS: "CONSULTAR LOCGRAM — SEM ASSESSORIA",
  ENCERRADO: "NÃO MANDAR — ENCERRADO",
  APREENDIDO: "NÃO MANDAR — APREENDIDO",
};

const ACAO_ORDER = {
  [ACAO.COBRAR]: 1,
  [ACAO.SEM_ASS]: 2,
  [ACAO.ENCERRADO]: 3,
  [ACAO.APREENDIDO]: 4,
};

const ACAO_FILL = {
  [ACAO.COBRAR]: null,
  [ACAO.SEM_ASS]: "FFFEF3C7",
  [ACAO.ENCERRADO]: "FFE5E7EB",
  [ACAO.APREENDIDO]: "FECACA",
};

export const LISTA_BIRA = new Map([
  ["PKE8I67", "Verificar Telegram ok"],
  ["OUW7I46", "possibilidade de reajuizamento"],
  ["OUR9030", "Verificar Assessoria ok"],
  ["JSI7843", "Mandado Ativo ok"],
  ["PJX1640", "Verificar Assessoria ok"],
  ["GEE5D38", "Em Acordo"],
  ["PKH9337", "Apto"],
  ["PKT9C34", "Inapto"],
  ["OQQ9E89", "Já foi apreendido"],
  ["RVL8E11", "Mandado Solicitado ok"],
  ["PJH2D97", "Mandado Solicitado ok"],
  ["RCS9B87", "Mandado Devolvido 13/04"],
  ["RTY2J69", "Mandado Solicitado ok"],
  ["SJL6E51", "Mandado Solicitado ok"],
  ["PLB9H65", "Mandado Solicitado - verificar localização com Bira"],
  ["PKP8G89", "Quitado com o banco"],
  ["OLB0091", "Entrar em contato com assessoria ok"],
  ["OKR9F57", "Apreendido"],
  ["PJT7A23", "Verificar Grupo Prod"],
  ["OVD1392", "Verificar Grupo Prod"],
  ["OUH6749", "Verificar Grupo Prod"],
  ["RFM3C58", "Verificar Grupo Prod"],
  ["QTU6E18", "Mandado Expedido"],
  ["NZB6395", "Mandado Expedido"],
  ["RDQ3F38", "Mandado Expedido"],
  ["PJI1B82", "Inviável (valor muito baixo)"],
  ["SKJ3D59", "Mandado Solicitado"],
  ["QTY9B44", "Sem Mandado grupo prod"],
  ["OVC8F05", "Sem Mandado"],
  ["OZG9E49", "Temporariamente Inapto"],
  ["THG8H79", "Temporariamente Inapto"],
  ["PJQ5H10", "Apto"],
  ["RNS4A95", "Ainda sem mandado ok"],
  ["SJQ3J00", "Pago"],
  ["SKJ7C47", "Advogado no Processo"],
  ["OZH8240", "Sem Liminar"],
  ["PJY4F66", "Processo Travado"],
  ["SJL3F07", "Mandado Negativo"],
  ["NZU3J26", "Não Apto"],
  ["RTS8J08", "Não Apto"],
  ["PLE8881", "Juiz indeferiu liminar"],
  ["NZY2754", "Em acordo"],
  ["PJR1514", "Em acordo"],
  ["RPE1F06", "Já tem outro localizador"],
  ["PLT6B87", "Aguardando Mandado"],
  ["RCX8E81", "Aguardando Mandado"],
  ["SDP4J41", "Aguardando Mandado"],
  ["NZP7872", "Aguardando Mandado"],
  ["OZO7632", "Sem classificação"],
  ["OKY0404", "Sem classificação"],
  ["RLR2E13", "Sem classificação"],
  ["OUH3E31", "Sem classificação"],
  ["PGF8G82", "Sem classificação"],
  ["OVC1746", "Sem classificação"],
  ["PLF2B32", "Sem classificação"],
  ["PKG4182", "Sem classificação"],
  ["PKJ1H57", "Sem classificação"],
  ["PJR3101", "Sem classificação"],
  ["SYD5E98", "Sem classificação"],
  ["PZB0J70", "Sem classificação"],
]);

export const MACIEL_EXTRA = [
  ["OSS6I53", "Palio", true],
  ["PLG2308", "Captur", true],
  ["FTM5I54", "BMW", true],
  ["PTO4C17", "EcoSport", true],
  ["PLI5567", "Jeep", true],
  ["OUM1J63", "Palio", true],
  ["OLG8H89", "Gol", true],
  ["PLG9E17", "Creta", false],
  ["RDO1J83", "Oroch", false],
  ["OQR1I88", "Bravo", false],
  ["FMR0162", "Toro", false],
  ["PJB2E69", "Palio", false],
  ["OUS4C82", "Corolla", false],
  ["OUR0I56", "Celta", false],
  ["PAK4C47", "Strada", false],
  ["PRQ8C40", "Jeep", false],
  ["PAE4228", "Fluence", false],
  ["PGI7F28", "Civic", false],
  ["OLA3E49", "Onix", false],
  ["RCP5B47", "Ranger", false],
  ["SAI5G95", "Tiggo", false],
  ["RNB4A96", "Gol", false],
  ["OVV1915", "Palio", false],
  ["QPM0D46", "Gol", false],
  ["PIX5775", "EcoSport", false],
  ["FXN4E00", "Celta", false],
  ["RPR9G97", "Yaris", false],
  ["MWR2H34", "Palio", false],
  ["SKF3D86", "Corolla", false],
  ["NWC8G77", "Sandero", false],
  ["SJY0G22", "Tiggo", false],
  ["PLZ1H88", "Hilux", false],
  ["JIH1A41", "Golf", false],
  ["JHI9C60", "Gol", false],
  ["QTV2D23", "Onix", false],
  ["SKH6C71", "Strada", false],
  ["OML8J57", "Strada", false],
  ["PRS0J07", "Onix", false],
  ["PRQ2D07", "Argo", false],
  ["QQA9G94", "Ford Ka", false],
  ["QBA4I64", "Etios", false],
  ["PKC0435", "HB20", false],
];

const SHEET_HEADERS = [
  "Placa",
  "Veículo",
  "Cidade",
  "Localizador",
  "Assessoria",
  "Telefone",
  "Contato",
  "Ação",
  "Lote",
  "Tipo lote",
  "Quando bateu",
  "Status Bira",
  "Status CRM",
  "Fontes",
  "Data Locgram",
  "Rastreado",
  "No Controle",
  "Posição?",
  "Obs posição",
];

function canonAssessoria(value) {
  let name = normalizeAssessoria(value);
  for (const [re, to] of EXTRA_ALIAS) {
    if (re.test(name)) return to;
  }
  return name;
}

function cleanVehicle(v) {
  if (v == null || v === "") return "";
  if (typeof v === "object") {
    v = v.text || v.result || v.veiculo || "";
    if (typeof v === "object") return "";
  }
  let s = String(v);
  if (!s || s === "[object Object]") return "";
  s = s
    .replace(/CARTEIRA\s+\S+\s+VEICULO:\s*/i, "")
    .replace(/Guaranty Code:.*$/i, "")
    .replace(/Marca\s*\/\s*Modelo:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const cut = s.split(/[-–(|]/)[0].trim();
  const out = (cut || s).slice(0, 28);
  if (/^\d+$/.test(out)) return "";
  return out;
}

function ensureCar(cars, placa) {
  const p = normalizePlaca(placa);
  if (!p) return null;
  if (!cars.has(p)) {
    cars.set(p, {
      placa: p,
      fontes: new Set(),
      locs: new Set(),
      cidades: new Set(),
      hits: [],
      lastHitTs: 0,
      lastHitLoc: "",
      origem: "",
      assessoria: "",
      telefone: "",
      veiculo: "",
      data: "",
      rastreado: false,
      statusBira: "",
      crmStatus: "",
      noControle: false,
      contato: "",
    });
  }
  return cars.get(p);
}

function fillCities(c) {
  const hasTarget = [...c.locs].some((l) => TARGET_LOCS.has(l));
  c.cidades.clear();
  if (c.locs.has("MACIEL")) c.cidades.add("Barreiras");
  if (c.locs.has("BIRA") || c.locs.has("CARLOS")) c.cidades.add("Salvador");
  if (!hasTarget && c.locs.size) {
    const other = [...c.locs].filter((l) => !TARGET_LOCS.has(l));
    c.cidades.add(other.length ? `Outras (${other.join("/")})` : "Outras praças");
  }
}

export function sourceUniverse(parsed) {
  const set = new Set();
  for (const item of parsed) {
    const p = normalizePlaca(item.placa);
    if (p) set.add(p);
  }
  for (const p of LISTA_BIRA.keys()) set.add(normalizePlaca(p));
  for (const [p] of MACIEL_EXTRA) set.add(normalizePlaca(p));
  return set;
}

export function buildLocalizados(parsed, { crmBy, controle }) {
  const cars = new Map();

  for (const item of parsed) {
    const c = ensureCar(cars, item.placa);
    if (!c) continue;
    c.fontes.add("locgram");
    if (item.localizador) c.locs.add(item.localizador);
    if (item.assessoria) c.assessoria = canonAssessoria(item.assessoria);
    if (item.telefone) c.telefone = item.telefone;
    if (item.veiculo) c.veiculo = cleanVehicle(item.veiculo);
    if (item.dataOcorrencia) c.data = item.dataOcorrencia;
    if (item.dataHora) {
      const ts = Date.parse(item.dataHora);
      if (!Number.isNaN(ts)) {
        c.hits.push({
          loc: item.localizador,
          ts,
          origem: item.origem || "",
        });
        if (ts >= (c.lastHitTs || 0)) {
          c.lastHitTs = ts;
          c.lastHitLoc = item.localizador;
          if (item.origem) c.origem = item.origem;
        }
      }
    }
  }

  for (const [placa, veiculo, rastreado] of MACIEL_EXTRA) {
    const c = ensureCar(cars, placa);
    c.fontes.add("lista_maciel");
    c.locs.add("MACIEL");
    if (!c.veiculo) c.veiculo = veiculo;
    if (rastreado) c.rastreado = true;
  }

  for (const [placa, status] of LISTA_BIRA) {
    const c = ensureCar(cars, placa);
    c.fontes.add("lista_bira");
    c.statusBira = status;
    c.locs.add("BIRA");
    if (/grupo prod/i.test(status) && !c.assessoria) c.assessoria = "PASCHOALOTTO";
  }

  for (const c of cars.values()) {
    const crm = crmBy.get(c.placa);
    const gest = controle.get(c.placa);
    if (crm) {
      c.crmStatus = crm.status || "";
      c.noControle = Boolean(crm.noControle);
      if (!c.assessoria && crm.assessoria) c.assessoria = canonAssessoria(crm.assessoria);
      if (!c.telefone) c.telefone = crm.telefone || "";
      if (!c.veiculo) c.veiculo = cleanVehicle(crm.veiculo);
      if (!c.locs.size && crm.localizador) c.locs.add(crm.localizador);
    }
    if (gest) {
      c.noControle = true;
      if (!c.assessoria) c.assessoria = canonAssessoria(gest.assessoria);
    }
    fillCities(c);
    c.contato = resolveContato(c.assessoria, "");
    c.assessoria = c.assessoria || "";
    c.apreendido =
      c.noControle || CLOSED_CRM.has(c.crmStatus) || /apreendido/i.test(c.statusBira);
    c.encerrado = !c.apreendido && CLOSED_BIRA.test(c.statusBira);
    if (c.apreendido) c.acao = ACAO.APREENDIDO;
    else if (c.encerrado) c.acao = ACAO.ENCERRADO;
    else if (!c.assessoria) c.acao = ACAO.SEM_ASS;
    else c.acao = ACAO.COBRAR;
    c.cidade = [...c.cidades].join(" + ");
    c.localizador = [...c.locs].join("/");
    c.fontesTxt = [...c.fontes].sort().join(", ");
  }

  return [...cars.values()].sort((a, b) => {
    const oa = ACAO_ORDER[a.acao] - ACAO_ORDER[b.acao];
    if (oa) return oa;
    const ass = (a.assessoria || "ZZZ").localeCompare(b.assessoria || "ZZZ", "pt-BR");
    if (ass) return ass;
    const cid = (a.cidade || "").localeCompare(b.cidade || "", "pt-BR");
    if (cid) return cid;
    return a.placa.localeCompare(b.placa);
  });
}

function lineCar(c) {
  const bits = [c.placa];
  if (c.veiculo) bits.push(c.veiculo);
  if (c.rastreado) bits.push("(rastreado)");
  return bits.join(" ");
}

export function buildMessageBlocks(records) {
  const cobraveis = records.filter((c) => c.acao === ACAO.COBRAR);
  const byAss = new Map();
  for (const c of cobraveis) {
    if (!byAss.has(c.assessoria)) byAss.set(c.assessoria, []);
    byAss.get(c.assessoria).push(c);
  }

  const blocks = [];
  for (const [ass, items] of [...byAss.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR"),
  )) {
    const barreiras = items
      .filter((x) => x.cidades.has("Barreiras"))
      .sort((a, b) => a.placa.localeCompare(b.placa));
    const salvador = items
      .filter((x) => x.cidades.has("Salvador"))
      .sort((a, b) => a.placa.localeCompare(b.placa));
    const outras = items
      .filter((x) => !x.cidades.has("Barreiras") && !x.cidades.has("Salvador"))
      .sort((a, b) => a.placa.localeCompare(b.placa));
    const phone = items.find((x) => x.telefone)?.telefone || "";
    const contato = items.find((x) => x.contato)?.contato || "";
    const cityNames = [
      barreiras.length ? "Barreiras" : null,
      salvador.length ? "Salvador" : null,
      outras.length ? "outras praças" : null,
    ].filter(Boolean);
    const who = contato ? `Olá ${contato}, tudo bem?` : "Olá, tudo bem?";
    const parts = [
      who,
      "",
      `Gostaria de saber como estão esses casos de ${cityNames.join(" e ")}:`,
      "",
    ];
    if (barreiras.length) {
      parts.push("Barreiras");
      for (const x of barreiras) parts.push(lineCar(x));
      parts.push("");
    }
    if (salvador.length) {
      parts.push("Salvador");
      for (const x of salvador) parts.push(lineCar(x));
      parts.push("");
    }
    if (outras.length) {
      parts.push("Outras praças");
      for (const x of outras) parts.push(`${lineCar(x)}  [${x.cidade}]`);
      parts.push("");
    }
    parts.push("Pode me atualizar o status de cada um, por favor?");
    blocks.push({
      assessoria: ass,
      contato,
      telefone: phone,
      qtd: items.length,
      barreiras: barreiras.length,
      salvador: salvador.length,
      outras: outras.length,
      placas: items.map((x) => x.placa),
      mensagem: parts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    });
  }
  return blocks;
}

export function renderTextDoc(records, blocks) {
  const apreendidos = records.filter((c) => c.acao === ACAO.APREENDIDO);
  const encerrados = records.filter((c) => c.acao === ACAO.ENCERRADO);
  const semAss = records.filter((c) => c.acao === ACAO.SEM_ASS);
  const cobraveis = records.filter((c) => c.acao === ACAO.COBRAR);
  const L = [];
  const hr = (title) => {
    L.push("");
    L.push("========================================================================");
    L.push(title);
    L.push("========================================================================");
    L.push("");
  };

  L.push("GPS BA — MENSAGENS PARA ASSESSORIAS (COPIAR E COLAR)");
  L.push("Fonte: Locgram ZIP + lista Bira + lista Maciel");
  L.push("Bira/Carlos = Salvador · Maciel = Barreiras");
  L.push("");
  L.push(`Total de placas: ${records.length}`);
  L.push(`Cobrar status: ${cobraveis.length} em ${blocks.length} escritórios`);
  L.push(`Sem assessoria: ${semAss.length}`);
  L.push(`Encerrados: ${encerrados.length}`);
  L.push(`Apreendidos / no pátio: ${apreendidos.length}`);

  hr("ÍNDICE DAS MENSAGENS");
  blocks.forEach((b, i) => {
    L.push(
      `${String(i + 1).padStart(2, "0")}. ${b.assessoria}  (${b.qtd})  ${b.telefone || "sem tel"}  B${b.barreiras}/S${b.salvador}/O${b.outras}`,
    );
  });

  blocks.forEach((b, i) => {
    L.push("");
    L.push("------------------------------------------------------------------------");
    L.push(
      `${String(i + 1).padStart(2, "0")}  ${b.assessoria}  |  ${b.telefone || "sem telefone"}  |  ${b.qtd} veículos`,
    );
    L.push("------------------------------------------------------------------------");
    L.push("");
    L.push(b.mensagem);
  });

  hr("SEM ESCRITÓRIO — CONSULTAR NO LOCGRAM ANTES");
  for (const c of semAss) {
    L.push(`${c.placa}\t${c.cidade || "-"}\t${c.statusBira || c.veiculo || c.localizador}`);
  }

  hr("NÃO MANDAR — ENCERRADOS LISTA BIRA");
  for (const c of encerrados) {
    L.push(`${c.placa}\t${c.cidade || "-"}\t${c.assessoria}\t${c.statusBira}`);
  }

  hr("NÃO MANDAR — APREENDIDOS / NO PÁTIO");
  for (const c of apreendidos) {
    L.push(`${c.placa}\t${c.cidade || "-"}\t${c.assessoria}\t${c.crmStatus || c.statusBira}`);
  }

  return L.join("\n") + "\n";
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

export function writeLocalizadosSheet(workbook, records) {
  let ws = workbook.getWorksheet(LOCALIZADOS_SHEET);
  if (!ws) ws = workbook.addWorksheet(LOCALIZADOS_SHEET);
  ws.properties.tabColor = { argb: "FFB45309" };

  const merges = [...(ws.model?.merges || [])];
  for (const range of merges) {
    try {
      ws.unMergeCells(range);
    } catch {
      // ignore
    }
  }

  if (ws.rowCount >= 1) {
    ws.spliceRows(1, ws.rowCount);
  }

  const lastCol = SHEET_HEADERS.length;
  ws.mergeCells(TITLE_ROW, 1, TITLE_ROW, lastCol);
  const title = ws.getCell(TITLE_ROW, 1);
  title.value =
    "Localizados — cobrança de status (Locgram + listas Bira/Maciel). Filtro na linha 2. Não apague esta aba.";
  paintCell(title, { bg: "FF111827", text: "FFFFFFFF", bold: true, size: 12 });
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(TITLE_ROW).height = 22;

  const header = ws.getRow(HEADER_ROW);
  SHEET_HEADERS.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    paintCell(cell, { bg: "FF4B5563", text: "FFFFFFFF", bold: true });
  });
  header.height = 18;
  header.commit();

  const widths = [13, 22, 22, 18, 28, 18, 12, 34, 14, 22, 18, 28, 16, 22, 14, 12, 14, 14, 22];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  records.forEach((c, i) => {
    const row = ws.getRow(DATA_START + i);
    const values = [
      c.placa,
      c.veiculo || "",
      c.cidade || "",
      c.localizador || "",
      c.assessoria || "",
      c.telefone || "",
      c.contato || "",
      c.acao,
      c.loteId || "",
      c.loteTipo || "",
      c.quandoBateu || "",
      c.statusBira || "",
      c.crmStatus || "",
      c.fontesTxt,
      c.data || "",
      c.rastreado ? "S" : "N",
      c.noControle ? "S" : "N",
      c.posicao || "",
      c.obsPosicao || "",
    ];
    const bg = ACAO_FILL[c.acao] || (i % 2 ? "FFF9FAFB" : "FFFFFFFF");
    values.forEach((value, col) => {
      const cell = row.getCell(col + 1);
      cell.value = value || null;
      paintCell(cell, {
        bg,
        bold: col === 0 || col === 7,
        text: col === 7 && c.acao === ACAO.APREENDIDO ? "FF7F1D1D" : "FF111827",
      });
      if (col === 1 || col === 4 || col === 7 || col === 8) {
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      }
    });
    row.height = 18;
    row.commit();
  });

  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + records.length, column: lastCol },
  };
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW, xSplit: 1, activeCell: "A3" }];
  ws.getRow(HEADER_ROW).eachCell((cell) => {
    paintCell(cell, { bg: "FF4B5563", text: "FFFFFFFF", bold: true });
  });

  return ws;
}

export function auditLocalizados(records, parsed) {
  const universe = sourceUniverse(parsed);
  const sheet = records.map((r) => r.placa);
  const sheetSet = new Set(sheet);
  const dups = sheet.filter((p, i) => sheet.indexOf(p) !== i);
  const missing = [...universe].filter((p) => !sheetSet.has(p)).sort();
  const extra = [...sheetSet].filter((p) => !universe.has(p)).sort();

  const blocks = buildMessageBlocks(records);
  const msgPlacas = blocks.flatMap((b) => b.placas);
  const msgSet = new Set(msgPlacas);
  const cobraveis = records.filter((c) => c.acao === ACAO.COBRAR).map((c) => c.placa);
  const cobraveisSet = new Set(cobraveis);
  const missingInMsg = cobraveis.filter((p) => !msgSet.has(p));
  const extraInMsg = [...msgSet].filter((p) => !cobraveisSet.has(p));
  const dupsInMsg = msgPlacas.filter((p, i) => msgPlacas.indexOf(p) !== i);

  const listaBira = [...LISTA_BIRA.keys()].map(normalizePlaca);
  const listaMaciel = MACIEL_EXTRA.map(([p]) => normalizePlaca(p));
  const zip = parsed.map((x) => normalizePlaca(x.placa)).filter(Boolean);
  const zipSet = new Set(zip);

  return {
    ok:
      missing.length === 0 &&
      extra.length === 0 &&
      dups.length === 0 &&
      missingInMsg.length === 0 &&
      extraInMsg.length === 0 &&
      dupsInMsg.length === 0,
    counts: {
      zipOcorrencias: parsed.length,
      zipUnicas: zipSet.size,
      listaBira: new Set(listaBira).size,
      listaMaciel: new Set(listaMaciel).size,
      universo: universe.size,
      naAba: sheetSet.size,
      cobraveis: cobraveis.length,
      mensagens: blocks.length,
      placasNasMensagens: msgSet.size,
    },
    listaBiraForaDoZip: listaBira.filter((p) => !zipSet.has(p)),
    listaMacielForaDoZip: [...new Set(listaMaciel)].filter((p) => !zipSet.has(p)),
    missing,
    extra,
    dups: [...new Set(dups)],
    missingInMsg,
    extraInMsg,
    dupsInMsg: [...new Set(dupsInMsg)],
  };
}
