import ExcelJS from "exceljs";
import { addVehicleToGestor } from "./add-vehicle.js";
import { normalizeAssessoria } from "./assessoria-rules.js";
import {
  CONTROLE_BRIDGE_STATUSES,
  CRM_STATUS_LABELS,
  CRM_STATUSES,
  FOLLOWUP_STATUSES,
} from "./crm-constants.js";
import {
  appendTimelineRow,
  ensureCrmSheets,
  readPagamentos,
  readPipeline,
  readTimeline,
  toIsoDate,
  upsertPagamentoRow,
  upsertPipelineRow,
} from "./crm-sheets.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import { parseWhatsappOcorrencia } from "./parse-whatsapp-ocorrencia.js";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";

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

async function withGestorWorkbook(mutator) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const sheets = ensureCrmSheets(workbook);

  const result = await mutator(workbook, sheets);

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);
  return result;
}

async function loadCrmSnapshot({ persistIfCreated = true } = {}) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);

  const hadPipeline = Boolean(workbook.getWorksheet("CRM Pipeline"));
  const hadTimeline = Boolean(workbook.getWorksheet("CRM Timeline"));
  const hadPagamentos = Boolean(workbook.getWorksheet("CRM Pagamentos"));
  const sheets = ensureCrmSheets(workbook);
  const created = !hadPipeline || !hadTimeline || !hadPagamentos;

  if (created && persistIfCreated) {
    workbook.calcProperties.fullCalcOnLoad = true;
    await workbook.xlsx.writeFile(localPath);
    await uploadExcel(gestorId, localPath);
  }

  return {
    pipeline: readPipeline(sheets.pipeline),
    timeline: readTimeline(sheets.timeline),
    pagamentos: readPagamentos(sheets.pagamentos),
  };
}

function buildCrmPayload(snapshot) {
  const today = todayIso();
  const pipeline = [...snapshot.pipeline].sort(sortByPriority);
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

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      statusLabels: CRM_STATUS_LABELS,
      statuses: CRM_STATUSES,
    },
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

export async function getCrmData() {
  const snapshot = await loadCrmSnapshot();
  return buildCrmPayload(snapshot);
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
    localizador: normalizeText(fields.localizador),
    status: CRM_STATUSES.includes(fields.status) ? fields.status : "nova",
    rastreado: Boolean(fields.rastreado),
    temMandado: Boolean(fields.temMandado),
    usaGuincho: Boolean(fields.usaGuincho),
    patio: normalizeText(fields.patio),
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

export async function updateOcorrencia(placaInput, patch = {}) {
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

    const next = { ...current };
    const assignable = [
      "veiculo",
      "cor",
      "origem",
      "uf",
      "assessoria",
      "telefone",
      "localizador",
      "patio",
      "observacoes",
      "rawWhatsapp",
    ];
    for (const key of assignable) {
      if (patch[key] !== undefined) next[key] = normalizeText(patch[key]);
    }
    if (patch.assessoria !== undefined) next.assessoria = normalizeAssessoria(patch.assessoria);
    if (patch.uf !== undefined) next.uf = normalizeText(patch.uf).toUpperCase();
    if (patch.rastreado !== undefined) next.rastreado = Boolean(patch.rastreado);
    if (patch.temMandado !== undefined) next.temMandado = Boolean(patch.temMandado);
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

      if (patch.status === "com_mandado") next.temMandado = true;

      // Apreensão → pátio; cliente busca no pátio → entregue (fim do CRM).
      // Pagamento é trilha paralela e pode ficar pendente.
      if (patch.status === "apreendido") {
        next.status = "no_patio";
        if (!next.dataApreensao) next.dataApreensao = todayIso();
        if (!next.dataEntradaPatio) next.dataEntradaPatio = todayIso();
      }
      if (patch.status === "no_patio") {
        if (!next.dataApreensao) next.dataApreensao = todayIso();
        if (!next.dataEntradaPatio) next.dataEntradaPatio = todayIso();
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
    } else if (Object.keys(patch).length) {
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "nota",
        mensagem: "Dados da ocorrência atualizados",
      });
    }

    return { ok: true, ocorrencia: next };
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

  const pagamento = {
    id: normalizeText(body.id) || null,
    placa,
    dataPrevista: toIsoDate(body.dataPrevista) || todayIso(),
    tipo: normalizeText(body.tipo).toLowerCase() || "pix",
    assessoria: normalizeAssessoria(body.assessoria || ""),
    valor: body.valor === "" || body.valor == null ? null : Number(body.valor),
    pago: Boolean(body.pago),
    dataPago: toIsoDate(body.dataPago) || (body.pago ? todayIso() : null),
    nota: normalizeText(body.nota),
  };

  return withGestorWorkbook(async (_wb, sheets) => {
    const id = upsertPagamentoRow(sheets.pagamentos, pagamento);
    appendTimelineRow(sheets.timeline, {
      placa,
      tipo: "pagamento",
      mensagem: pagamento.pago
        ? `Pagamento ${pagamento.tipo.toUpperCase()} marcado como pago (${pagamento.dataPrevista})`
        : `Pagamento ${pagamento.tipo.toUpperCase()} previsto para ${pagamento.dataPrevista} (independente do pátio)`,
    });

    // Pagamento não altera o status do funil: o carro pode estar no pátio ou já removido
    // com recebimento ainda em aberto por prazo.

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
      data: occ.dataApreensao || occ.dataOcorrencia || todayIso(),
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
      current.atualizadoEm = new Date().toISOString();
      upsertPipelineRow(sheets.pipeline, current);
      appendTimelineRow(sheets.timeline, {
        placa,
        tipo: "status",
        mensagem: "Enviado ao Controle Diligências",
      });
    }
  });

  return { ok: true, controle: result, placa };
}
