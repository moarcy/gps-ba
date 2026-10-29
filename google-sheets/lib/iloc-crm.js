import { editarPlanilha } from "../excel-drive-client.js";
import { normalizeAssessoria } from "./assessoria-rules.js";
import {
  appendIlocEvento,
  appendTimelineRow,
  ensureCrmSheets,
  ensureIlocEventosSheet,
  listarIlocEventos,
  readPipeline,
  upsertPipelineRow,
} from "./crm-sheets.js";
import { normalizePlaca, normalizeText } from "./excel-utils.js";
import { normalizeLocalizador } from "./localizador-rules.js";

const FUSO = "America/Bahia";
const CHAVES_NOME = ["nome", "name", "razaoSocial", "razao", "fantasia", "apelido", "label", "titulo"];

function dataBrasilDeMs(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function dataBrasil(valor) {
  if (valor == null || valor === "") return "";
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return valor.trim();
  const ms = valor instanceof Date ? valor.getTime() : Date.parse(String(valor));
  if (!Number.isFinite(ms)) return "";
  return dataBrasilDeMs(ms);
}

function hojeBrasil() {
  return dataBrasilDeMs(Date.now());
}

export function textoCampo(valor) {
  if (valor == null || typeof valor === "boolean") return "";
  if (typeof valor === "string" || typeof valor === "number") return normalizeText(valor);
  if (Array.isArray(valor)) return valor.map(textoCampo).filter(Boolean).join(", ");
  if (typeof valor === "object") {
    for (const chave of CHAVES_NOME) {
      const texto = textoCampo(valor[chave]);
      if (texto) return texto;
    }
  }
  return "";
}

function pedacos(texto) {
  return normalizeText(texto)
    .split(/\s*(?:,|;|\/|\||\s+e\s+)\s*/i)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

function pessoasDe(valor, profundidade = 0) {
  if (profundidade > 4 || valor == null || typeof valor === "boolean") return [];
  if (typeof valor === "string" || typeof valor === "number") {
    return pedacos(valor).map((nome) => ({ nome, papel: "" }));
  }
  if (Array.isArray(valor)) return valor.flatMap((item) => pessoasDe(item, profundidade + 1));
  if (typeof valor !== "object") return [];

  const marcados = [];
  if (valor.assistente) {
    marcados.push(...pessoasDe(valor.assistente).map((p) => ({ nome: p.nome, papel: "assistente" })));
  }
  if (valor.responsavel != null && valor.responsavel !== valor.assistente) {
    marcados.push(...pessoasDe(valor.responsavel).map((p) => ({ nome: p.nome, papel: p.papel || "assistente" })));
  }
  if (marcados.length) return marcados;

  const nome = textoCampo(valor.nome ?? valor.name ?? valor.usuario);
  if (nome) {
    const papel = textoCampo(valor.papel || valor.tipo || valor.funcao || valor.cargo);
    return pedacos(nome).map((parte) => ({ nome: parte, papel }));
  }
  for (const chave of ["localizadores", "localizador", "equipe"]) {
    if (valor[chave] != null) return pessoasDe(valor[chave], profundidade + 1);
  }
  return [];
}

function ehEndrigo(nome) {
  return normalizeLocalizador(nome) === "ENDRIGO";
}

/** O iLoc manda o dono (Endrigo) e o assistente. No CRM fica o assistente. */
export function localizadorResponsavel(valor) {
  const pessoas = pessoasDe(valor).filter((p) => p.nome && !ehEndrigo(p.nome));
  const assistente = pessoas.find((p) => /assist/i.test(p.papel));
  const escolhido = assistente || pessoas.find((p) => !/dono|propriet|titular/i.test(p.papel));
  if (!escolhido) return "";
  const nome = normalizeLocalizador(escolhido.nome);
  if (!nome || /object/i.test(nome)) return "";
  return nome;
}

export function assessoriaDe(valor) {
  const texto = textoCampo(valor);
  if (!texto || /object object/i.test(texto)) return "";
  const nome = normalizeAssessoria(texto);
  if (!nome || /object object/i.test(nome)) return "";
  return nome;
}

export function placaDoEvento(evento) {
  return normalizePlaca(evento?.caso?.placa || evento?.dados?.placa || evento?.dados?.depois?.placa);
}

export function fichaDoEvento(evento) {
  const fontes = [evento?.dados?.depois, evento?.dados, evento?.caso].filter(
    (fonte) => fonte && typeof fonte === "object",
  );
  let assessoria = "";
  let localizador = "";
  let criadoEm = "";
  for (const fonte of fontes) {
    if (!assessoria) assessoria = assessoriaDe(fonte.escritorio ?? fonte.assessoria);
    if (!localizador) {
      localizador = localizadorResponsavel(
        fonte.localizador ?? fonte.localizadores ?? fonte.responsavel ?? fonte.assistente,
      );
    }
    if (!criadoEm) criadoEm = fonte.criadoEm || "";
  }
  return {
    placa: placaDoEvento(evento),
    assessoria,
    localizador,
    data: dataBrasil(criadoEm),
  };
}

function vazioOuLixo(valor) {
  const texto = normalizeText(valor);
  if (!texto) return true;
  return /object/i.test(texto);
}

function novaOcorrencia(placa, ficha, evento) {
  return {
    placa,
    dataOcorrencia: ficha.data || dataBrasil(evento?.ocorridoEm) || hojeBrasil(),
    veiculo: "",
    cor: "",
    origem: "iLoc",
    uf: "",
    assessoria: ficha.assessoria || "",
    telefone: "",
    localizador: ficha.localizador || "",
    status: "nova",
    rastreado: false,
    temMandado: false,
    usaGuincho: false,
    patio: "",
    dataApreensao: null,
    dataEntradaPatio: null,
    dataSaidaPatio: null,
    valorDiaria: null,
    proximoContato: null,
    observacoes: "",
    rawWhatsapp: "",
    noControle: false,
    atualizadoEm: new Date().toISOString(),
  };
}

function mensagemFicha(ficha, criado) {
  const partes = [criado ? "iLoc abriu o caso" : "iLoc completou o caso"];
  if (ficha.assessoria) partes.push(ficha.assessoria);
  if (ficha.localizador) partes.push(ficha.localizador);
  return partes.join(" · ");
}

function registrarEvento(ws, evento, meta, placa) {
  appendIlocEvento(ws, {
    id: evento.id,
    ocorridoEm: evento.ocorridoEm || "",
    tipo: evento.tipo,
    placa: placa || "",
    entrega: meta?.entrega || "",
    recebidoEm: new Date().toISOString(),
  });
}

export async function aplicarEventoIloc(evento, meta = {}) {
  if (evento?.tipo === "webhook.ping") return { ok: true, ping: true };

  const gestorId = process.env.SPREADSHEET_ID_1?.trim();
  if (!gestorId) {
    throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });
  }

  const ficha = fichaDoEvento(evento);
  return editarPlanilha(gestorId, async (workbook) => {
    const sheets = ensureCrmSheets(workbook);
    const wsEventos = ensureIlocEventosSheet(workbook);
    const eventos = listarIlocEventos(wsEventos);
    if (eventos.some((item) => item.id === evento.id)) {
      return { skipUpload: true, value: { duplicate: true, placa: ficha.placa } };
    }

    if (!ficha.placa) {
      registrarEvento(wsEventos, evento, meta, "");
      return { ok: true, semPlaca: true };
    }

    const atual = readPipeline(sheets.pipeline).find((item) => item.placa === ficha.placa);
    let current;
    let criado = false;
    let mudou = false;
    if (!atual) {
      current = novaOcorrencia(ficha.placa, ficha, evento);
      criado = true;
      mudou = true;
    } else {
      current = { ...atual };
      if (ficha.assessoria && vazioOuLixo(current.assessoria)) {
        current.assessoria = ficha.assessoria;
        mudou = true;
      }
      if (ficha.localizador && vazioOuLixo(current.localizador)) {
        current.localizador = ficha.localizador;
        mudou = true;
      }
      if (ficha.data && !current.dataOcorrencia) {
        current.dataOcorrencia = ficha.data;
        mudou = true;
      }
      if (current.assessoria && vazioOuLixo(current.assessoria)) {
        current.assessoria = "";
        mudou = true;
      }
      if (current.localizador && vazioOuLixo(current.localizador)) {
        current.localizador = "";
        mudou = true;
      }
    }

    if (mudou) {
      current.atualizadoEm = new Date().toISOString();
      if (!current.origem) current.origem = "iLoc";
      upsertPipelineRow(sheets.pipeline, current);
      appendTimelineRow(sheets.timeline, {
        id: evento.id,
        placa: ficha.placa,
        tipo: "iloc",
        dataHora: evento.ocorridoEm || new Date().toISOString(),
        mensagem: mensagemFicha(ficha, criado),
      });
    }
    registrarEvento(wsEventos, evento, meta, ficha.placa);
    return {
      ok: true,
      placa: ficha.placa,
      criado,
      preenchido: mudou && !criado,
      assessoria: current.assessoria,
      localizador: current.localizador,
      data: current.dataOcorrencia,
    };
  });
}
