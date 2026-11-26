import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadExcel, editarPlanilha, uploadExcel } from "../excel-drive-client.js";
import { asNumber, normalizePlaca, normalizeText } from "./excel-utils.js";
import { buildDescricaoNota, buildNomeArquivo, linhaUnica, motivoSubstituicao, tipoNota } from "./nfse-nota.js";
import { certificadoConfigurado } from "../nfse-worker/cert.js";

const NOTAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../nfse-worker/notas");

export function arquivoPdfNfse(nomeArquivo) {
  const bruto = String(nomeArquivo || "").trim();
  const nome = path.basename(bruto).replace(/\.pdf$/i, "").trim();
  if (!nome || nome !== bruto.replace(/\.pdf$/i, "").trim()) return "";
  if (nome === "." || nome === "..") return "";
  const file = path.join(NOTAS_DIR, `${nome}.pdf`);
  if (!file.startsWith(`${NOTAS_DIR}${path.sep}`)) return "";
  if (!fs.existsSync(file)) return "";
  const bytes = fs.readFileSync(file);
  if (bytes.length < 1000 || bytes.slice(0, 4).toString() !== "%PDF") return "";
  return file;
}
import {
  appendEmitidaRow,
  buildEmissionItems,
  ensureNfseSheets,
  readConfig,
  readEmitidas,
  readServicos,
  readTomadores,
  updateEmitidaRow,
  upsertTomadorRow,
} from "./nfse-sheets.js";

function newId(prefix = "nf") {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${t}_${r}`;
}

async function withGestorWorkbook(mutator) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) {
    throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });
  }

  return editarPlanilha(gestorId, async (workbook) => {
    const sheets = ensureNfseSheets(workbook);
    return mutator(workbook, sheets);
  });
}

async function loadNfseSnapshot({ persistIfCreated = true } = {}) {
  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) {
    throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });
  }

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);

  const hadTomadores = Boolean(workbook.getWorksheet("NFS-e Tomadores"));
  const hadServicos = Boolean(workbook.getWorksheet("NFS-e Servicos"));
  const hadConfig = Boolean(workbook.getWorksheet("NFS-e Config"));
  const hadEmitidas = Boolean(workbook.getWorksheet("NFS-e Emitidas"));
  const sheets = ensureNfseSheets(workbook);
  const created = !hadTomadores || !hadServicos || !hadConfig || !hadEmitidas;

  if (created && persistIfCreated) {
    try {
      workbook.calcProperties.fullCalcOnLoad = true;
      await workbook.xlsx.writeFile(localPath);
      await uploadExcel(gestorId, localPath);
    } catch (err) {
      console.warn("NFS-e: não foi possível persistir abas novas:", err.message);
    }
  }

  return {
    config: readConfig(sheets.config),
    tomadores: readTomadores(sheets.tomadores),
    servicos: readServicos(sheets.servicos),
    emitidas: readEmitidas(sheets.emitidas, { limit: 1000 }).map((emitida) => ({
      ...emitida,
      pdf: Boolean(arquivoPdfNfse(emitida.nomeArquivo) || String(emitida.chaveAcesso || "").replace(/\D/g, "").length === 50),
    })),
    workerConfigured: Boolean(process.env.NFSE_WORKER_URL?.trim() || certificadoConfigurado()),
  };
}

export async function getNfseData() {
  return loadNfseSnapshot();
}

export async function upsertTomador(body) {
  return withGestorWorkbook((_wb, sheets) => {
    const tomador = upsertTomadorRow(sheets.tomadores, body || {});
    return { tomador };
  });
}

function pisoDasNotas(emitidas) {
  return (emitidas || []).reduce((max, item) => {
    const numero = Number(String(item.numeroNf || "").replace(/\D/g, ""));
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
}

async function cancelarNaSefinDireto(payload) {
  if (!certificadoConfigurado()) {
    const err = new Error("Certificado da NFS-e não configurado neste ambiente.");
    err.status = 503;
    throw err;
  }
  const { cancelarNaSefin } = await import("../nfse-worker/dps.js");
  return cancelarNaSefin(payload);
}

async function emitirNaSefinDireto(payload) {
  if (!certificadoConfigurado()) {
    const err = new Error("Certificado da NFS-e não configurado neste ambiente.");
    err.status = 503;
    throw err;
  }
  const { emitirNaSefin } = await import("../nfse-worker/dps.js");
  let emitida;
  try {
    emitida = await emitirNaSefin(payload);
  } catch (error) {
    if (!error.dpsUsada) throw error;
    emitida = await emitirNaSefin(payload);
  }
  return {
    ok: true,
    numeroNf: emitida.numeroNf,
    chave: emitida.chave,
    nomeArquivo: buildNomeArquivo({ ...(payload.arquivo || {}), numero: emitida.numeroNf }),
    message: "NFS-e autorizada na Sefin Nacional.",
  };
}

async function callWorker(payload, pathname = "/emit") {
  const url = process.env.NFSE_WORKER_URL?.trim();
  const secret = process.env.NFSE_WORKER_SECRET?.trim();
  if (!url) {
    if (pathname === "/baixar") return { ok: true, nomeArquivo: payload.nomeArquivo || "" };
    if (pathname === "/cancelar") return cancelarNaSefinDireto(payload);
    return emitirNaSefinDireto(payload);
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.NFSE_WORKER_TIMEOUT_MS || 180000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.replace(/\/$/, "") + pathname, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Worker HTTP ${res.status}`);
      err.status = 502;
      err.details = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      const timeout = new Error("Timeout ao chamar o worker NFS-e.");
      timeout.status = 504;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function emitNfse(body = {}) {
  const snapshot = await loadNfseSnapshot();
  const config = snapshot.config;

  const tomadorId = normalizeText(body.tomadorId || body.tomador_id);
  const tomador =
    snapshot.tomadores.find((t) => t.id === tomadorId || t.documento === tomadorId) ||
    (body.tomador ? body.tomador : null);

  if (!tomador?.documento) {
    const err = new Error("Selecione a assessoria.");
    err.status = 400;
    throw err;
  }

  const placa = normalizePlaca(body.placa);
  const financiado = normalizeText(body.financiado);
  if (!placa) {
    const err = new Error("Informe a placa.");
    err.status = 400;
    throw err;
  }
  if (!financiado) {
    const err = new Error("Informe o financiado.");
    err.status = 400;
    throw err;
  }

  const spec = tipoNota(body.tipo);
  const servicoCodigo = spec?.codigo || normalizeText(body.servicoCodigo || body.servico_codigo || body.codigo);
  const servico = snapshot.servicos.find((s) => s.codigo === servicoCodigo);
  if (!servico) {
    const err = new Error("Selecione um serviço válido (001414, 001104 ou 001722).");
    err.status = 400;
    throw err;
  }

  const descricao = linhaUnica(body.descricao);
  if (!descricao) {
    const err = new Error("Informe a descrição do serviço.");
    err.status = 400;
    throw err;
  }

  const quantidade = asNumber(body.quantidade);
  const valorUnitario = asNumber(body.valorUnitario ?? body.valor_unitario);
  if (quantidade == null || quantidade <= 0) {
    const err = new Error("Informe a quantidade.");
    err.status = 400;
    throw err;
  }
  if (valorUnitario == null || valorUnitario <= 0) {
    const err = new Error("Informe o valor.");
    err.status = 400;
    throw err;
  }

  const aliquota = asNumber(body.aliquota) ?? asNumber(config.aliquota) ?? 0;
  const dataFato = normalizeText(body.dataFato || body.data_fato) || new Date().toISOString().slice(0, 10);
  const substituirId = normalizeText(body.substituirId || body.substituir_id);
  let substituicao = null;
  if (substituirId) {
    const original = snapshot.emitidas.find((item) => item.id === substituirId);
    if (!original) {
      const err = new Error("Nota original não encontrada.");
      err.status = 404;
      throw err;
    }
    if (original.status !== "authorized") {
      const err = new Error("Só uma nota autorizada pode ser substituída.");
      err.status = 400;
      throw err;
    }
    const chave = String(original.chaveAcesso || "").replace(/\D/g, "");
    if (chave.length !== 50) {
      const err = new Error("Essa nota não tem chave de acesso para substituir.");
      err.status = 400;
      throw err;
    }
    const motivo = motivoSubstituicao(body.motivoSubst, body.motivoTexto);
    substituicao = { id: original.id, chave, motivo: motivo.codigo, texto: motivo.xMotivo };
  }
  const items = buildEmissionItems({ descricao, quantidade, valorUnitario, config });
  const valorTotal = items[0].valorTotal;
  const id = newId("nfse");

  await withGestorWorkbook((_wb, sheets) => {
    appendEmitidaRow(sheets.emitidas, {
      id,
      criadoEm: new Date().toISOString(),
      status: "pending",
      numeroNf: "",
      tomadorId: tomador.id || tomador.documento,
      tomadorNome: tomador.razaoSocial,
      servicoCodigo: servico.codigo,
      cnae: servico.cnae,
      descricao,
      quantidade,
      valorUnitario,
      valorTotal,
      aliquota,
      dataFato,
      erro: "",
      tipo: spec?.id || "",
      placa,
      financiado,
      nomeArquivo: buildNomeArquivo({
        placa,
        financiado,
        assessoria: tomador.id || tomador.razaoSocial,
      }),
      chaveSubstituida: substituicao?.chave || "",
    });
    return true;
  });

  const workerPayload = {
    id,
    config: {
      prestadorNome: config.prestador_nome,
      prestadorCnpj: config.prestador_cnpj,
      inscricaoMunicipal: config.inscricao_municipal,
      ufPrestacao: config.uf_prestacao,
      municipioPrestacao: config.municipio_prestacao,
      codigoMunicipio: config.codigo_municipio || "2905701",
      issRetido: config.iss_retido,
      exigibilidade: config.exigibilidade,
      tributacao: config.tributacao,
      imprimeNota: config.imprime_nota,
      dadosBancarios: config.dados_bancarios,
    },
    tomador,
    servico,
    aliquota,
    dataFato,
    items,
    dryRun: Boolean(body.dryRun),
    ...(substituicao
      ? { substituicao: { chave: substituicao.chave, motivo: substituicao.motivo, texto: substituicao.texto } }
      : {}),
    arquivo: {
      placa,
      financiado,
      assessoria: tomador.id || tomador.razaoSocial,
    },
    pisoDps: pisoDasNotas(snapshot.emitidas),
  };

  let workerResult;
  try {
    workerResult = await callWorker(workerPayload);
  } catch (err) {
    await withGestorWorkbook((_wb, sheets) =>
      updateEmitidaRow(sheets.emitidas, id, {
        status: "error",
        erro: err.message || "Falha no worker",
      }),
    );
    throw err;
  }

  const status = workerResult.ok
    ? workerResult.dryRun
      ? "dry_run"
      : "authorized"
    : "error";
  const nomeArquivo =
    workerResult.nomeArquivo ||
    buildNomeArquivo({
      numero: workerResult.numeroNf,
      placa,
      financiado,
      assessoria: tomador.id || tomador.razaoSocial,
    });
  const updated = await withGestorWorkbook((_wb, sheets) =>
    updateEmitidaRow(sheets.emitidas, id, {
      status,
      numeroNf: workerResult.numeroNf || "",
      erro: workerResult.error || "",
      nomeArquivo,
      chaveSubstituida: substituicao?.chave || "",
      ...(workerResult.chave ? { chaveAcesso: workerResult.chave } : {}),
    }),
  );

  let avisoSubstituicao = "";
  if (substituicao && status === "authorized") {
    try {
      await withGestorWorkbook((_wb, sheets) =>
        updateEmitidaRow(sheets.emitidas, substituicao.id, {
          status: "substituida",
          substituidaPor: workerResult.numeroNf || id,
        }),
      );
    } catch (err) {
      avisoSubstituicao = err.message || "A nota nova saiu, mas a original não foi marcada como substituída.";
    }
  }

  return {
    emitida: updated,
    worker: workerResult,
    nomeArquivo,
    substituidaId: status === "authorized" ? substituicao?.id || "" : "",
    avisoSubstituicao,
  };
}

export async function emitNfseLote(body = {}) {
  const notas = Array.isArray(body.notas) ? body.notas : [];
  if (!notas.length) {
    const err = new Error("Marque ao menos um tipo de nota.");
    err.status = 400;
    throw err;
  }

  const referente = normalizeText(body.referente);
  if (!referente) {
    const err = new Error("Cole a descrição do caso.");
    err.status = 400;
    throw err;
  }

  const built = notas.map((nota) => {
    const spec = tipoNota(nota?.tipo);
    if (!spec) {
      const err = new Error("Tipo de nota inválido.");
      err.status = 400;
      throw err;
    }
    const valor = asNumber(nota.valor ?? nota.valorUnitario);
    if (valor == null || valor <= 0) {
      const err = new Error(`Informe o valor da nota de ${spec.label.toLowerCase()}.`);
      err.status = 400;
      throw err;
    }
    return {
      tomadorId: body.tomadorId,
      placa: body.placa,
      financiado: body.financiado,
      aliquota: body.aliquota,
      dataFato: body.dataFato,
      dryRun: body.dryRun,
      tipo: spec.id,
      quantidade: 1,
      valorUnitario: valor,
      descricao: buildDescricaoNota({
        tipo: spec.id,
        texto: referente,
        km: nota.km,
        diarias: nota.diarias,
      }),
    };
  });

  const resultados = [];
  for (const nota of built) {
    try {
      const result = await emitNfse(nota);
      resultados.push({ ok: true, tipo: nota.tipo, ...result });
    } catch (err) {
      resultados.push({
        ok: false,
        tipo: nota.tipo,
        error: err.message || "Falha ao emitir",
      });
      break;
    }
  }

  return { resultados };
}

const JA_CANCELADA = /j[aá] cancelad|evento de cancelamento j[aá]|E2020/i;

export async function cancelarNfse(body = {}) {
  const snapshot = await loadNfseSnapshot();
  const id = normalizeText(body.id);
  const emitida = snapshot.emitidas.find((item) => item.id === id);
  if (!emitida) {
    const err = new Error("Nota não encontrada.");
    err.status = 404;
    throw err;
  }
  if (emitida.status === "cancelada") {
    return { emitida, jaCancelada: true };
  }
  if (emitida.status !== "authorized") {
    const err = new Error("Só uma nota autorizada pode ser cancelada.");
    err.status = 400;
    throw err;
  }
  const chave = String(emitida.chaveAcesso || "").replace(/\D/g, "");
  if (chave.length !== 50) {
    const err = new Error("Essa nota não tem chave de acesso para cancelar.");
    err.status = 400;
    throw err;
  }

  try {
    await callWorker(
      {
        chave,
        motivo: body.motivo || body.xMotivo || "",
        cMotivo: body.cMotivo || body.motivoCodigo || "1",
        config: { prestadorCnpj: snapshot.config?.prestador_cnpj },
      },
      "/cancelar",
    );
  } catch (err) {
    if (!JA_CANCELADA.test(err.message || "")) throw err;
  }

  const updated = await withGestorWorkbook((_wb, sheets) =>
    updateEmitidaRow(sheets.emitidas, id, { status: "cancelada", erro: "" }),
  );
  return { emitida: updated, jaCancelada: false };
}

export async function pdfEmitida(id) {
  const snapshot = await loadNfseSnapshot({ persistIfCreated: false });
  const emitida = snapshot.emitidas.find((item) => item.id === normalizeText(id));
  const file = arquivoPdfNfse(emitida?.nomeArquivo);
  if (!emitida || !file) return null;
  return { nomeArquivo: emitida.nomeArquivo, file };
}

export async function prepararPdf(id) {
  const snapshot = await loadNfseSnapshot({ persistIfCreated: false });
  const emitida = snapshot.emitidas.find((item) => item.id === normalizeText(id));
  if (!emitida) return null;
  const filename = `${emitida.nomeArquivo || emitida.numeroNf || "nfse"}.pdf`;
  const file = arquivoPdfNfse(emitida.nomeArquivo);
  if (file) return { filename, buffer: fs.readFileSync(file) };
  const chave = String(emitida.chaveAcesso || "").replace(/\D/g, "");
  if (chave.length !== 50) return null;
  const { buscarXmlNfse } = await import("../nfse-worker/sefin-xml.js");
  const { htmlDanfse } = await import("../nfse-worker/danfse-html.js");
  return { filename, html: await htmlDanfse(await buscarXmlNfse(chave)) };
}

export async function baixarPdfEmitida(body = {}) {
  const id = normalizeText(body.id);
  const snapshot = await loadNfseSnapshot({ persistIfCreated: false });
  const emitida = snapshot.emitidas.find((item) => item.id === id);
  if (!emitida) {
    const err = new Error("Nota não encontrada.");
    err.status = 404;
    throw err;
  }
  if (arquivoPdfNfse(emitida.nomeArquivo)) {
    return { ok: true, id, nomeArquivo: emitida.nomeArquivo, pdf: true };
  }
  if (!emitida.chaveAcesso) {
    const err = new Error("Essa nota não tem a chave para buscar o PDF.");
    err.status = 404;
    throw err;
  }
  const workerResult = await callWorker(
    { chave: emitida.chaveAcesso, nomeArquivo: emitida.nomeArquivo },
    "/baixar",
  );
  if (!workerResult.ok || !arquivoPdfNfse(emitida.nomeArquivo)) {
    const err = new Error(workerResult.error || "O PDF não foi salvo.");
    err.status = 502;
    throw err;
  }
  return { ok: true, id, nomeArquivo: emitida.nomeArquivo, pdf: true };
}
