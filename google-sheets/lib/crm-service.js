import ExcelJS from "exceljs";
import { addVehicleToGestor } from "./add-vehicle.js";
import { normalizeAssessoria } from "./assessoria-rules.js";
import { normalizeLocalizador } from "./localizador-rules.js";
import {
  CONTROLE_BRIDGE_STATUSES,
  CRM_STATUS_LABELS,
  CRM_STATUSES,
  FOLLOWUP_STATUSES,
  PAGAMENTO_CATEGORIA_LABELS,
  PAGAMENTO_CATEGORIAS,
  PAGAMENTO_FORMA_LABELS,
} from "./crm-constants.js";
import {
  appendTimelineRow,
  daysBetween,
  ensureAccessUsers,
  ensureCrmSheets,
  readEnderecos,
  readPagamentos,
  readPipeline,
  readTimeline,
  toIsoDate,
  upsertEnderecoRow,
  upsertPagamentoRow,
  upsertPipelineRow,
} from "./crm-sheets.js";
import { publicLocalizadorCar, scopeCrmForLocalizador } from "./access-control.js";
import { readSeedUsers } from "./access-store.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import { parseWhatsappOcorrencia } from "./parse-whatsapp-ocorrencia.js";
import {
  CANONICAL_PATIOS,
  normalizePatio,
  resolvePatio,
} from "./patio-rules.js";
import { descartarArquivo, downloadExcel, editarPlanilha, uploadExcel } from "../excel-drive-client.js";
import { readGestorRecords } from "../sync-controle-diligencias.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days, from = todayIso()) {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sortByPriority(a, b) {
  if (a.rastreado !== b.rastreado) return a.rastreado ? -1 : 1;
  const ca = a.proximoContato || "9999";
  const cb = b.proximoContato || "9999";
  if (ca !== cb) return ca.localeCompare(cb);
  return a.placa.localeCompare(b.placa);
}

/** Fila do kanban: caso mais recente primeiro. */
function sortFilaDesc(a, b) {
  const da = a.dataOcorrencia || "";
  const db = b.dataOcorrencia || "";
  if (da !== db) return db.localeCompare(da);
  const ua = a.atualizadoEm || "";
  const ub = b.atualizadoEm || "";
  if (ua !== ub) return ub.localeCompare(ua);
  return a.placa.localeCompare(b.placa);
}

async function withGestorWorkbook(mutator) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });

  return editarPlanilha(gestorId, async (workbook) => {
    const sheets = ensureCrmSheets(workbook);
    return mutator(workbook, sheets);
  });
}

async function loadCrmSnapshot({ persistIfCreated = true, enrichFromControle = true } = {}) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });

  const baixado = await downloadExcel(gestorId, { versioned: true });
  const localPath = baixado.localPath;
  const etag = baixado.etag;
  const workbook = new ExcelJS.Workbook();
  try {
  await workbook.xlsx.readFile(localPath);

  const hadPipeline = Boolean(workbook.getWorksheet("CRM Pipeline"));
  const hadTimeline = Boolean(workbook.getWorksheet("CRM Timeline"));
  const hadPagamentos = Boolean(workbook.getWorksheet("CRM Pagamentos"));
  const hadAcessos = Boolean(workbook.getWorksheet("CRM Acessos"));
  const sheets = ensureCrmSheets(workbook);
  const seeded = ensureAccessUsers(sheets.acessos, readSeedUsers());
  const created = !hadPipeline || !hadTimeline || !hadPagamentos || !hadAcessos || seeded > 0;

  let pipeline = readPipeline(sheets.pipeline);
  let dirtyRows = [];

  if (enrichFromControle) {
    const controleSheet = workbook.getWorksheet("Planilha1");
    const controle = controleSheet ? readGestorRecords(controleSheet) : new Map();
    const enriched = enrichPipelineFromControle(pipeline, controle);
    pipeline = enriched.pipeline;
    dirtyRows = enriched.changed;
  }

    if ((created || dirtyRows.length) && persistIfCreated) {
      try {
        for (const item of dirtyRows) {
          upsertPipelineRow(sheets.pipeline, item);
        }
        workbook.calcProperties.fullCalcOnLoad = true;
        await workbook.xlsx.writeFile(localPath);
        await uploadExcel(gestorId, localPath, { etag });
      } catch (err) {
        console.error("Falha ao persistir sync CRM←Controle:", err.message || err);
      }
    }

    return {
      pipeline,
      timeline: readTimeline(sheets.timeline),
      pagamentos: readPagamentos(sheets.pagamentos),
      enderecos: readEnderecos(sheets.enderecos),
    };
  } finally {
    descartarArquivo(localPath);
  }
}

/**
 * Data do Controle = entrada no pátio.
 * BIRA → BF Car · MACIEL → Ponto a Ponto.
 * Carros do Controle que ainda não estão no CRM entram como no_patio.
 */
function occFromControle(c) {
  const loc = normalizeLocalizador(c.loc1);
  const entrada = toIsoDate(c.data) || todayIso();
  const patio = resolvePatio({ localizador: loc });
  return {
    placa: c.placa,
    dataOcorrencia: entrada,
    veiculo: "",
    cor: "",
    origem: "",
    uf: "",
    assessoria: normalizeAssessoria(c.assessoria),
    telefone: normalizeText(c.contato),
    localizador: loc,
    status: "no_patio",
    rastreado: false,
    localizado: false,
    processo: "",
    temMandado: false,
    usaGuincho: false,
    patio,
    dataApreensao: entrada,
    dataEntradaPatio: entrada,
    dataSaidaPatio: null,
    valorDiaria: null,
    diarias: daysBetween(entrada, null),
    proximoContato: null,
    observacoes: "Sincronizado do Controle de Diligências",
    rawWhatsapp: "",
    noControle: true,
    atualizadoEm: new Date().toISOString(),
  };
}

function enrichPipelineFromControle(pipeline, controleMap) {
  const changed = [];
  const seen = new Set();

  const next = pipeline.map((item) => {
    seen.add(item.placa);
    const c = controleMap.get(item.placa);
    let updated = item;
    let dirty = false;

    const loc = item.localizador || c?.loc1 || "";
    const patio = resolvePatio({ patio: item.patio, localizador: loc });
    if (patio && patio !== item.patio) {
      updated = { ...updated, patio };
      dirty = true;
    }

    // Data da coluna A do Controle = entrada no pátio
    if (!item.dataEntradaPatio && c?.data) {
      const entrada = toIsoDate(c.data);
      if (entrada) {
        updated = { ...updated, dataEntradaPatio: entrada };
        if (!updated.dataApreensao) updated = { ...updated, dataApreensao: entrada };
        dirty = true;
      }
    }

    if (!item.localizador && c?.loc1) {
      const locNorm = normalizeLocalizador(c.loc1);
      if (locNorm) {
        updated = { ...updated, localizador: locNorm };
        const patioFromLoc = resolvePatio({ patio: updated.patio, localizador: locNorm });
        if (patioFromLoc && patioFromLoc !== updated.patio) {
          updated = { ...updated, patio: patioFromLoc };
        }
        dirty = true;
      }
    }

    // Carros no Controle estão no pátio (exceto já finalizados no CRM)
    if (
      c &&
      !["entregue", "cancelado", "removido"].includes(updated.status) &&
      updated.status !== "no_patio"
    ) {
      updated = { ...updated, status: "no_patio", noControle: true };
      if (!updated.dataEntradaPatio && c.data) {
        const entrada = toIsoDate(c.data);
        if (entrada) updated = { ...updated, dataEntradaPatio: entrada };
      }
      if (!updated.patio) {
        updated = {
          ...updated,
          patio: resolvePatio({ localizador: updated.localizador || c.loc1 }),
        };
      }
      dirty = true;
    } else if (c && !item.noControle) {
      updated = { ...updated, noControle: true };
      dirty = true;
    }

    if (dirty) {
      updated = {
        ...updated,
        diarias: daysBetween(updated.dataEntradaPatio, updated.dataSaidaPatio),
        atualizadoEm: new Date().toISOString(),
      };
      changed.push(updated);
    }
    return updated;
  });

  // Controle tem carros que o CRM (Locgram) ainda não tem → entram no pátio
  for (const [placa, c] of controleMap) {
    if (seen.has(placa)) continue;
    const created = occFromControle(c);
    next.push(created);
    changed.push(created);
  }

  return { pipeline: next, changed };
}

function buildCrmPayload(snapshot) {
  const today = todayIso();
  const pipeline = [...snapshot.pipeline].sort(sortFilaDesc);
  const byStatus = {};
  for (const s of CRM_STATUSES) byStatus[s] = [];
  for (const item of pipeline) {
    const key = CRM_STATUSES.includes(item.status) ? item.status : "nova";
    byStatus[key].push(item);
  }

  const followUps = pipeline
    .filter((p) => FOLLOWUP_STATUSES.has(p.status) && p.proximoContato)
    .map((p) => {
      const due = p.proximoContato;
      let urgency = "ok";
      if (due < today) urgency = "atrasado";
      else if (due === today) urgency = "hoje";
      else {
        const d = new Date(`${due}T12:00:00`);
        const t = new Date(`${today}T12:00:00`);
        const days = Math.round((d - t) / 86400000);
        if (days <= 7) urgency = "semana";
      }
      return { ...p, urgency };
    })
    .filter((p) => p.urgency !== "ok")
    .sort((a, b) => {
      const order = { atrasado: 0, hoje: 1, semana: 2 };
      if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency];
      return sortByPriority(a, b);
    });

  const patio = pipeline
    .filter(
      (p) =>
        p.status === "no_patio" ||
        (p.dataEntradaPatio && !p.dataSaidaPatio && p.status !== "removido" && p.status !== "entregue"),
    )
    .sort(sortByPriority);

  const pendingPayments = snapshot.pagamentos.filter((p) => !p.pago);
  const pendingByPlaca = {};
  for (const p of pendingPayments) {
    if (!pendingByPlaca[p.placa]) pendingByPlaca[p.placa] = [];
    pendingByPlaca[p.placa].push(p);
  }

  const counts = Object.fromEntries(
    CRM_STATUSES.map((s) => [s, byStatus[s]?.length || 0]),
  );

  const localizadores = [
    ...new Set(pipeline.map((p) => p.localizador).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const assessorias = [
    ...new Set(pipeline.map((p) => p.assessoria).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const patios = [
    ...new Set([
      ...CANONICAL_PATIOS,
      ...pipeline.map((p) => p.patio).filter(Boolean),
    ]),
  ];

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      statusLabels: CRM_STATUS_LABELS,
      statuses: CRM_STATUSES,
      patios: CANONICAL_PATIOS,
      pagamentoCategorias: PAGAMENTO_CATEGORIA_LABELS,
      pagamentoFormas: PAGAMENTO_FORMA_LABELS,
    },
    filters: { localizadores, assessorias, patios },
    counts,
    pipeline,
    byStatus,
    followUps,
    patio,
    pendingPayments,
    pendingByPlaca,
    timeline: snapshot.timeline,
    pagamentos: snapshot.pagamentos,
  };
}

export async function getCrmData(actor = null) {
  const snapshot = await loadCrmSnapshot();
  const payload = buildCrmPayload(snapshot);
  payload.enderecos = (snapshot.enderecos || []).map(({ _row, ...item }) => item);
  if (actor?.papel === "localizador") return scopeCrmForLocalizador(payload, actor);
  if (actor?.papel === "admin") payload.meta = { ...payload.meta, papel: "admin" };
  return payload;
}

export function previewWhatsapp(rawText) {
  return parseWhatsappOcorrencia(rawText);
}

function mergeOcorrenciaBody(body = {}) {
  let fields = { ...body };
  if (body.rawWhatsapp || body.whatsapp) {
    const parsed = parseWhatsappOcorrencia(body.rawWhatsapp || body.whatsapp);
    fields = { ...parsed.fields, ...body };
    if (!normalizePlaca(fields.placa) && parsed.error) {
      const err = new Error(parsed.error);
      err.status = 400;
      throw err;
    }
  }

  const placa = normalizePlaca(fields.placa);
  if (!placa) {
    const err = new Error("Informe a placa.");
    err.status = 400;
    throw err;
  }

  return {
    placa,
    dataOcorrencia: toIsoDate(fields.dataOcorrencia || fields.data) || todayIso(),
    veiculo: normalizeText(fields.veiculo),
    cor: normalizeText(fields.cor),
    origem: normalizeText(fields.origem),
    uf: normalizeText(fields.uf).toUpperCase(),
    assessoria: normalizeAssessoria(fields.assessoria),
    telefone: normalizeText(fields.telefone),
    localizador: normalizeLocalizador(fields.localizador),
    status: CRM_STATUSES.includes(fields.status) ? fields.status : "nova",
    rastreado: Boolean(fields.rastreado),
    localizado: Boolean(fields.localizado),
    processo: normalizeText(fields.processo),
    temMandado: Boolean(fields.temMandado),
    usaGuincho: Boolean(fields.usaGuincho),
    patio: resolvePatio({
      patio: fields.patio,
      localizador: fields.localizador,
    }),
    dataApreensao: toIsoDate(fields.dataApreensao),
    dataEntradaPatio: toIsoDate(fields.dataEntradaPatio),
    dataSaidaPatio: toIsoDate(fields.dataSaidaPatio),
    valorDiaria: fields.valorDiaria != null && fields.valorDiaria !== ""
      ? Number(fields.valorDiaria)
      : null,
    proximoContato: toIsoDate(fields.proximoContato) || plusDaysIso(7),
    observacoes: normalizeText(fields.observacoes),
    rawWhatsapp: normalizeText(fields.rawWhatsapp || fields.whatsapp),
    noControle: Boolean(fields.noControle),
    atualizadoEm: new Date().toISOString(),
  };
}

export async function createOcorrencia(body) {
  const record = mergeOcorrenciaBody(body);

  return withGestorWorkbook(async (_wb, sheets) => {
    const existing = readPipeline(sheets.pipeline);
    if (existing.some((p) => p.placa === record.placa) && !body.overwrite) {
      const err = new Error(`Placa ${record.placa} já existe no CRM.`);
      err.status = 409;
      err.code = "PLATE_EXISTS";
      throw err;
    }

    const prev = existing.find((p) => p.placa === record.placa);
    const merged = prev ? { ...prev, ...record, noControle: prev.noControle } : record;
    upsertPipelineRow(sheets.pipeline, merged);

    appendTimelineRow(sheets.timeline, {
      placa: merged.placa,
      tipo: merged.rawWhatsapp ? "whatsapp" : "status",
      mensagem: merged.rawWhatsapp
        ? `Ocorrência criada via WhatsApp\n${merged.rawWhatsapp.slice(0, 500)}`
        : `Ocorrência criada — status ${CRM_STATUS_LABELS[merged.status] || merged.status}`,
    });

    return { ok: true, ocorrencia: merged };
  });
}

export async function updateOcorrencia(placaInput, patch = {}, actor = null) {
  const placa = normalizePlaca(placaInput);
  if (!placa) {
    const err = new Error("Placa inválida.");
    err.status = 400;
    throw err;
  }

  return withGestorWorkbook(async (_wb, sheets) => {
    const all = readPipeline(sheets.pipeline);
    const current = all.find((p) => p.placa === placa);
    if (!current) {
      const err = new Error(`Placa ${placa} não encontrada no CRM.`);
      err.status = 404;
      throw err;
    }

    if (actor?.papel === "localizador") {
      if (!sameLocalizador(current.localizador, actor.localizador)) {
        const err = new Error("Placa não encontrada na sua fila.");
        err.status = 404;
        throw err;
      }
      const allowed = Object.keys(patch).every((key) => key === "rastreado" || key === "localizado");
      if (!allowed || !Object.keys(patch).length) {
        const err = new Error("Sem permissão.");
        err.status = 403;
        throw err;
      }
    }

    const next = { ...current };
    const assignable = [
      "veiculo",
      "cor",
      "origem",
      "telefone",
      "observacoes",
      "rawWhatsapp",
      "processo",
    ];
    for (const key of assignable) {
      if (patch[key] !== undefined) next[key] = normalizeText(patch[key]);
    }
    if (patch.assessoria !== undefined) next.assessoria = normalizeAssessoria(patch.assessoria);
    if (patch.localizador !== undefined) next.localizador = normalizeLocalizador(patch.localizador);
    if (patch.patio !== undefined) {
      next.patio = resolvePatio({
        patio: patch.patio,
        localizador: next.localizador || current.localizador,
      });
    } else if (patch.localizador !== undefined && !normalizePatio(next.patio)) {
      next.patio = resolvePatio({ localizador: next.localizador });
    }
    if (patch.uf !== undefined) next.uf = normalizeText(patch.uf).toUpperCase();
    if (patch.rastreado !== undefined) next.rastreado = Boolean(patch.rastreado);
    if (patch.localizado !== undefined) next.localizado = Boolean(patch.localizado);
    if (patch.temMandado !== undefined) {
      const was = Boolean(current.temMandado);
      next.temMandado = Boolean(patch.temMandado);
      // MDD ativo → garante data no calendário (próximo contato / prazo de trabalho)
      if (next.temMandado && !was) {
        const due = next.proximoContato || current.proximoContato;
        if (!due || due < todayIso()) next.proximoContato = plusDaysIso(7);
      }
    }
    if (patch.usaGuincho !== undefined) next.usaGuincho = Boolean(patch.usaGuincho);
    if (patch.valorDiaria !== undefined) {
      next.valorDiaria =
        patch.valorDiaria === "" || patch.valorDiaria == null
          ? null
          : Number(patch.valorDiaria);
    }
    if (patch.dataOcorrencia !== undefined) next.dataOcorrencia = toIsoDate(patch.dataOcorrencia);
    if (patch.dataApreensao !== undefined) next.dataApreensao = toIsoDate(patch.dataApreensao);
    if (patch.dataEntradaPatio !== undefined) {
      next.dataEntradaPatio = toIsoDate(patch.dataEntradaPatio);
    }
    if (patch.dataSaidaPatio !== undefined) next.dataSaidaPatio = toIsoDate(patch.dataSaidaPatio);
    if (patch.proximoContato !== undefined) next.proximoContato = toIsoDate(patch.proximoContato);

    const prevStatus = current.status;
    if (patch.status !== undefined) {
      if (!CRM_STATUSES.includes(patch.status)) {
        const err = new Error(`Status inválido: ${patch.status}`);
        err.status = 400;
        throw err;
      }
      next.status = patch.status;

      if (patch.status === "com_mandado") {
        next.temMandado = true;
        const due = next.proximoContato || current.proximoContato;
        if (!due || due < todayIso()) next.proximoContato = plusDaysIso(7);
      }

      // Apreensão → pátio; cliente busca no pátio → entregue (fim do CRM).
      // Pagamento é trilha paralela e pode ficar pendente.
      // Data do Controle / apreensão = entrada no pátio. Pátio por LOC: BIRA→BF Car, MACIEL→Ponto a Ponto.
      if (patch.status === "apreendido") {
        next.status = "no_patio";
        if (!next.dataApreensao) next.dataApreensao = todayIso();
        if (!next.dataEntradaPatio) {
          next.dataEntradaPatio = next.dataApreensao || todayIso();
        }
        if (!next.patio) {
          next.patio = resolvePatio({ localizador: next.localizador });
        }
      }
      if (patch.status === "no_patio") {
        if (!next.dataApreensao) next.dataApreensao = todayIso();
        if (!next.dataEntradaPatio) {
          next.dataEntradaPatio = next.dataApreensao || todayIso();
        }
        if (!next.patio) {
          next.patio = resolvePatio({ localizador: next.localizador });
        }
        if (
          prevStatus === "removido" ||
          prevStatus === "entregue" ||
          prevStatus === "aguardando_pagamento"
        ) {
          next.dataSaidaPatio = null;
        }
      }
      // Saída do pátio = entrega (busca no local).
      if (patch.status === "entregue" || patch.status === "removido") {
        if (!next.dataEntradaPatio && next.dataApreensao) {
          next.dataEntradaPatio = next.dataApreensao;
        }
        if (!next.dataSaidaPatio) next.dataSaidaPatio = todayIso();
      }
      if (patch.status === "entregue") {
        next.status = "entregue";
      }
      if (FOLLOWUP_STATUSES.has(next.status) && patch.proximoContato === undefined) {
        next.proximoContato = plusDaysIso(7);
      }
    }

    next.atualizadoEm = new Date().toISOString();
    upsertPipelineRow(sheets.pipeline, next);

    const flagNotes = [];
    if (patch.rastreado !== undefined && Boolean(current.rastreado) !== Boolean(next.rastreado)) {
      flagNotes.push(next.rastreado ? "Marcado como rastreado" : "Rastreado desmarcado");
    }
    if (patch.localizado !== undefined && Boolean(current.localizado) !== Boolean(next.localizado)) {
      flagNotes.push(next.localizado ? "Marcado como localizado" : "Localizado desmarcado");
    }
    const flagOnly = Object.keys(patch).every((key) => key === "rastreado" || key === "localizado");

    if (patch.status && patch.status !== prevStatus) {
      const requested = patch.status;
      let mensagem = `Status: ${CRM_STATUS_LABELS[prevStatus] || prevStatus} → ${CRM_STATUS_LABELS[next.status] || next.status}`;
      if (requested === "apreendido" && next.status === "no_patio") {
        mensagem = `Apreendido e enviado ao pátio (${CRM_STATUS_LABELS[prevStatus] || prevStatus} → No pátio)`;
      }
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "status",
        mensagem,
      });
    } else if (flagOnly && flagNotes.length) {
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "nota",
        mensagem: flagNotes.join(" · "),
      });
    } else if (Object.keys(patch).length) {
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "nota",
        mensagem: "Dados da ocorrência atualizados",
      });
    }

    return {
      ok: true,
      ocorrencia: actor?.papel === "localizador" ? publicLocalizadorCar(next) : next,
    };
  });
}

export async function addTimelineEvent(body = {}) {
  const placa = normalizePlaca(body.placa);
  if (!placa) {
    const err = new Error("Informe a placa.");
    err.status = 400;
    throw err;
  }
  const tipo = normalizeText(body.tipo) || "nota";
  const mensagem = normalizeText(body.mensagem);
  if (!mensagem) {
    const err = new Error("Informe a mensagem.");
    err.status = 400;
    throw err;
  }

  return withGestorWorkbook(async (_wb, sheets) => {
    const all = readPipeline(sheets.pipeline);
    const current = all.find((p) => p.placa === placa);
    if (!current) {
      const err = new Error(`Placa ${placa} não encontrada no CRM.`);
      err.status = 404;
      throw err;
    }

    const id = appendTimelineRow(sheets.timeline, {
      placa,
      tipo,
      mensagem,
      dataHora: body.dataHora || new Date().toISOString(),
    });

    if (tipo === "contato" || body.bumpFollowUp) {
      current.proximoContato = plusDaysIso(7);
      current.atualizadoEm = new Date().toISOString();
      upsertPipelineRow(sheets.pipeline, current);
    }

    return { ok: true, id, ocorrencia: current };
  });
}

export async function upsertPagamento(body = {}) {
  const placa = normalizePlaca(body.placa);
  if (!placa) {
    const err = new Error("Informe a placa.");
    err.status = 400;
    throw err;
  }

  let categoria = normalizeText(body.categoria).toLowerCase();
  let tipo = normalizeText(body.tipo).toLowerCase() || "pix";
  if (PAGAMENTO_CATEGORIAS.includes(tipo) && !categoria) {
    categoria = tipo;
    tipo = normalizeText(body.forma).toLowerCase() || "pix";
  }
  if (!PAGAMENTO_CATEGORIAS.includes(categoria)) categoria = "apreensao";
  if (body.forma) tipo = normalizeText(body.forma).toLowerCase() || tipo;

  const pagamento = {
    id: normalizeText(body.id) || null,
    placa,
    dataPrevista: toIsoDate(body.dataPrevista) || todayIso(),
    categoria,
    tipo,
    assessoria: normalizeAssessoria(body.assessoria || ""),
    valor: body.valor === "" || body.valor == null ? null : Number(body.valor),
    pago: Boolean(body.pago),
    dataPago: toIsoDate(body.dataPago) || (body.pago ? todayIso() : null),
    nota: normalizeText(body.nota),
  };

  return withGestorWorkbook(async (_wb, sheets) => {
    const id = upsertPagamentoRow(sheets.pagamentos, pagamento);
    const catLabel = PAGAMENTO_CATEGORIA_LABELS[pagamento.categoria] || pagamento.categoria;
    const formaLabel = PAGAMENTO_FORMA_LABELS[pagamento.tipo] || pagamento.tipo.toUpperCase();
    appendTimelineRow(sheets.timeline, {
      placa,
      tipo: "pagamento",
      mensagem: pagamento.pago
        ? `${catLabel} (${formaLabel}) marcado como pago (${pagamento.dataPrevista})`
        : `${catLabel} (${formaLabel}) previsto para ${pagamento.dataPrevista}`,
    });

    return { ok: true, id, pagamento: { ...pagamento, id } };
  });
}

export async function sendToControle(body = {}) {
  const placa = normalizePlaca(body.placa);
  if (!placa) {
    const err = new Error("Informe a placa.");
    err.status = 400;
    throw err;
  }

  const snapshot = await loadCrmSnapshot();
  const occ = snapshot.pipeline.find((p) => p.placa === placa);
  if (!occ) {
    const err = new Error(`Placa ${placa} não encontrada no CRM.`);
    err.status = 404;
    throw err;
  }
  if (!CONTROLE_BRIDGE_STATUSES.has(occ.status) && !body.force) {
    const err = new Error(
      "Envie ao Controle apenas após apreensão / pátio / pagamento. Use force=true para forçar.",
    );
    err.status = 400;
    throw err;
  }

  const result = await addVehicleToGestor(
    {
      placa: occ.placa,
      // Data do Controle = entrada no pátio (mesma data usada no CRM)
      data: occ.dataEntradaPatio || occ.dataApreensao || occ.dataOcorrencia || todayIso(),
      loc1: occ.localizador,
      assessoria: occ.assessoria,
      contato: "",
      premio: body.premio,
      apoio: body.apoio,
      loc2: body.loc2,
      guincho: body.guincho ?? (occ.usaGuincho ? undefined : null),
      nfNr: body.nfNr || "",
      overwrite: Boolean(body.overwrite),
    },
    { overwrite: Boolean(body.overwrite) },
  );

  await withGestorWorkbook(async (_wb, sheets) => {
    const all = readPipeline(sheets.pipeline);
    const current = all.find((p) => p.placa === placa);
    if (current) {
      current.noControle = true;
      if (!current.dataEntradaPatio) {
        current.dataEntradaPatio =
          occ.dataEntradaPatio || occ.dataApreensao || occ.dataOcorrencia || todayIso();
      }
      if (!current.patio) {
        current.patio = resolvePatio({ localizador: current.localizador });
      }
      if (current.status !== "entregue" && current.status !== "cancelado") {
        current.status = "no_patio";
      }
      current.atualizadoEm = new Date().toISOString();
      upsertPipelineRow(sheets.pipeline, current);
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "status",
        mensagem: `Enviado ao Controle Diligências · pátio ${current.patio || "—"} · entrada ${current.dataEntradaPatio || "—"}`,
      });
    }
  });

  return { ok: true, controle: result, placa };
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function sameLocalizador(a, b) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}

export async function createLocalizadorOcorrencia({ placa, endereco, localizador, autor }) {
  const plate = normalizePlaca(placa);
  const texto = normalizeText(endereco);
  const loc = normalizeLocalizador(localizador);
  if (!plate) throw httpError("Informe a placa.", 400);
  if (!texto) throw httpError("Informe o endereço.", 400);
  if (!loc) throw httpError("Localizador inválido.", 400);

  return withGestorWorkbook(async (_wb, sheets) => {
    const prev = readPipeline(sheets.pipeline).find((item) => item.placa === plate);
    if (prev) {
      throw httpError(
        sameLocalizador(prev.localizador, loc)
          ? "Esta placa já está na sua fila. Abra o card para alterar o endereço."
          : "Não foi possível abrir esta ocorrência.",
        sameLocalizador(prev.localizador, loc) ? 409 : 403,
      );
    }

    const now = new Date().toISOString();
    const record = {
      placa: plate,
      dataOcorrencia: todayIso(),
      veiculo: "",
      cor: "",
      origem: "",
      uf: "",
      assessoria: "",
      telefone: "",
      localizador: loc,
      status: "nova",
      rastreado: false,
      localizado: false,
      processo: "",
      temMandado: false,
      usaGuincho: false,
      patio: "",
      dataApreensao: null,
      dataEntradaPatio: null,
      dataSaidaPatio: null,
      valorDiaria: null,
      proximoContato: plusDaysIso(7),
      observacoes: "",
      rawWhatsapp: "",
      noControle: false,
      atualizadoEm: now,
    };
    upsertPipelineRow(sheets.pipeline, record);
    const enderecoRow = {
      id: `e-${Date.now()}`,
      placa: plate,
      ordem: 1,
      texto,
      atualizadoEm: now,
      atualizadoPor: autor || loc,
    };
    upsertEnderecoRow(sheets.enderecos, enderecoRow);
    appendTimelineRow(sheets.timeline, {
      placa: plate,
      tipo: "status",
      mensagem: "Ocorrência criada — status Nova ocorrência",
    });
    appendTimelineRow(sheets.timeline, {
      placa: plate,
      tipo: "endereco",
      mensagem: `END 1 adicionado: ${texto}`,
    });
    return {
      ok: true,
      ocorrencia: publicLocalizadorCar(record),
      endereco: {
        id: enderecoRow.id,
        placa: plate,
        ordem: 1,
        texto,
        atualizadoEm: now,
        atualizadoPor: enderecoRow.atualizadoPor,
      },
    };
  });
}

export async function saveEndereco({ placa, ordem, texto, autor, actor }) {
  const plate = normalizePlaca(placa);
  const text = normalizeText(texto);
  if (!plate) throw httpError("Informe a placa.", 400);
  if (!text) throw httpError("Informe o endereço.", 400);
  if (text.length > 500) throw httpError("Endereço muito longo.", 400);

  return withGestorWorkbook(async (_wb, sheets) => {
    const car = readPipeline(sheets.pipeline).find((item) => item.placa === plate);
    const allowed =
      car &&
      (actor?.papel !== "localizador" || sameLocalizador(car.localizador, actor.localizador));
    if (!allowed) {
      throw httpError(
        actor?.papel === "localizador" ? "Placa não encontrada na sua fila." : "Placa não encontrada no CRM.",
        404,
      );
    }

    const all = readEnderecos(sheets.enderecos).filter((item) => item.placa === plate);
    let ordemNum = Number(ordem);
    if (!Number.isInteger(ordemNum) || ordemNum < 1) {
      ordemNum = all.reduce((max, item) => Math.max(max, item.ordem), 0) + 1;
    }
    const existing = all.find((item) => item.ordem === ordemNum);
    const before = existing?.texto || "";
    const now = new Date().toISOString();
    const row = {
      id: existing?.id || `e-${Date.now()}`,
      placa: plate,
      ordem: ordemNum,
      texto: text,
      atualizadoEm: now,
      atualizadoPor: autor || actor?.usuario || "",
    };
    if (!existing || before !== text) {
      upsertEnderecoRow(sheets.enderecos, row);
      appendTimelineRow(sheets.timeline, {
        placa: plate,
        tipo: "endereco",
        mensagem: before
          ? `END ${ordemNum} alterado: "${before}" → "${text}"`
          : `END ${ordemNum} adicionado: ${text}`,
      });
    }
    return {
      ok: true,
      endereco: {
        id: row.id,
        placa: row.placa,
        ordem: row.ordem,
        texto: row.texto,
        atualizadoEm: row.atualizadoEm,
        atualizadoPor: row.atualizadoPor,
      },
    };
  });
}

export async function dispatchCrmAction(body = {}, actor) {
  if (!actor) throw httpError("Faça login.", 401);
  const action = body.action || body.op;

  if (actor.papel === "localizador") {
    if (action === "create" || action === "create_ocorrencia") {
      return {
        status: 201,
        data: await createLocalizadorOcorrencia({
          placa: body.placa,
          endereco: body.endereco,
          localizador: actor.localizador,
          autor: actor.usuario,
        }),
      };
    }
    if (action === "endereco" || action === "update_endereco") {
      return {
        status: 200,
        data: await saveEndereco({
          placa: body.placa,
          ordem: body.ordem,
          texto: body.texto || body.endereco,
          autor: actor.usuario,
          actor,
        }),
      };
    }
    if (action === "update" || action === "update_ocorrencia") {
      const patch = {};
      if (body.rastreado !== undefined) patch.rastreado = body.rastreado;
      if (body.localizado !== undefined) patch.localizado = body.localizado;
      return { status: 200, data: await updateOcorrencia(body.placa, patch, actor) };
    }
    throw httpError("Sem permissão.", 403);
  }

  if (action === "preview") return { status: 200, data: previewWhatsapp(body.text || body.whatsapp || body.rawWhatsapp) };
  if (action === "create" || action === "create_ocorrencia") {
    return { status: 201, data: await createOcorrencia(body) };
  }
  if (action === "update" || action === "update_ocorrencia") {
    const { action: _a, op: _o, placa, ...patch } = body;
    return { status: 200, data: await updateOcorrencia(placa, patch) };
  }
  if (action === "timeline" || action === "add_timeline") {
    return { status: 201, data: await addTimelineEvent(body) };
  }
  if (action === "pagamento" || action === "upsert_pagamento") {
    return { status: 200, data: await upsertPagamento(body) };
  }
  if (action === "bridge" || action === "send_controle") {
    return { status: 200, data: await sendToControle(body) };
  }
  if (action === "endereco" || action === "update_endereco") {
    return {
      status: 200,
      data: await saveEndereco({
        placa: body.placa,
        ordem: body.ordem,
        texto: body.texto || body.endereco,
        autor: actor.usuario,
        actor,
      }),
    };
  }

  throw httpError(
    "action inválida. Use: create | update | timeline | pagamento | bridge | preview | endereco",
    400,
  );
}
