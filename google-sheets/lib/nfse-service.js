import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "../excel-drive-client.js";
import { asNumber, normalizeText } from "./excel-utils.js";
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

  const localPath = await downloadExcel(gestorId, { useCache: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  const sheets = ensureNfseSheets(workbook);

  const result = await mutator(workbook, sheets);

  workbook.calcProperties.fullCalcOnLoad = true;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(gestorId, localPath);
  return result;
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
    emitidas: readEmitidas(sheets.emitidas),
    workerConfigured: Boolean(process.env.NFSE_WORKER_URL?.trim()),
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

async function callWorker(payload) {
  const url = process.env.NFSE_WORKER_URL?.trim();
  const secret = process.env.NFSE_WORKER_SECRET?.trim();
  if (!url) {
    const err = new Error(
      "NFSE_WORKER_URL não configurado. Suba o worker Playwright (local ou Fly) e aponte a URL.",
    );
    err.status = 503;
    throw err;
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.NFSE_WORKER_TIMEOUT_MS || 180000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.replace(/\/$/, "") + "/emit", {
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
    const err = new Error("Selecione ou informe o tomador.");
    err.status = 400;
    throw err;
  }

  const servicoCodigo = normalizeText(body.servicoCodigo || body.servico_codigo || body.codigo);
  const servico = snapshot.servicos.find((s) => s.codigo === servicoCodigo);
  if (!servico) {
    const err = new Error("Selecione um serviço válido (001414, 001104 ou 001722).");
    err.status = 400;
    throw err;
  }

  const descricao = normalizeText(body.descricao);
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
  if (valorUnitario == null || valorUnitario < 0) {
    const err = new Error("Informe o valor unitário.");
    err.status = 400;
    throw err;
  }

  const aliquota = asNumber(body.aliquota) ?? asNumber(config.aliquota) ?? 0;
  const dataFato = normalizeText(body.dataFato || body.data_fato) || new Date().toISOString().slice(0, 10);
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
  const updated = await withGestorWorkbook((_wb, sheets) =>
    updateEmitidaRow(sheets.emitidas, id, {
      status,
      numeroNf: workerResult.numeroNf || "",
      erro: workerResult.error || "",
    }),
  );

  return {
    emitida: updated,
    worker: workerResult,
  };
}
