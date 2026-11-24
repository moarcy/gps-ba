import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { linhaUnica, motivoSubstituicao, tributacaoNacional } from "../lib/nfse-nota.js";
import { aliquotaSimples, signDpsXml } from "./sign-dps.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTADOR = path.join(__dirname, "data", "dps-contador.json");
const PRESTADOR = {
  cnpj: "10348519000119",
  fone: "7199993986",
  email: "ENDRIGO@GPSBAHIA.COM.BR",
  cMun: "2905701",
};

function soDigitos(value) {
  return String(value || "").replace(/\D/g, "");
}

function xml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tag(name, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<${name}>${xml(text)}</${name}>`;
}

function money(value) {
  return (Number(value) || 0).toFixed(2);
}

function serieDps() {
  const serie = Number(process.env.NFSE_SERIE_DPS || 1);
  if (!Number.isInteger(serie) || serie < 1 || serie > 49999) {
    throw new Error("NFSE_SERIE_DPS precisa ficar entre 1 e 49999.");
  }
  return serie;
}

function sefinBase() {
  return (process.env.NFSE_SEFIN_URL || "https://sefin.nfse.gov.br/SefinNacional").replace(/\/$/, "");
}

function tpAmb() {
  return String(process.env.NFSE_TP_AMB || "1") === "2" ? "2" : "1";
}

export function identDps({ cMun, cnpj, serie, nDps }) {
  const digits = soDigitos(cnpj);
  const tp = digits.length <= 11 ? "1" : "2";
  const corpo = `${cMun}${tp}${digits.padStart(14, "0")}${String(serie).padStart(5, "0")}${String(nDps).padStart(15, "0")}`;
  if (corpo.length !== 42) throw new Error("Identificador da DPS incompleto.");
  return { corpo, id: `DPS${corpo}` };
}

function agoraBahia() {
  // A Sefin recusa a DPS quando o relógio deste PC está à frente do dela (E0008).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() - 120_000));
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

function certMaterial() {
  const configured = process.env.NFSE_CERT_PATH?.trim() || "certs/gps-bahia.pfx";
  const pfx = fs.readFileSync(path.resolve(__dirname, configured));
  const passphrase = process.env.NFSE_CERT_PASSWORD || "";
  if (!passphrase) throw new Error("Certificado A1 não configurado.");
  return { pfx, passphrase };
}

function sefinHttp(method, pathname, body) {
  const { pfx, passphrase } = certMaterial();
  const url = `${sefinBase()}${pathname}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      pfx,
      passphrase,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
      },
      timeout: 40000,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("A Sefin Nacional não respondeu a tempo."));
    });
    if (body) req.write(body);
    req.end();
  });
}

function lerContador(serie) {
  if (!fs.existsSync(CONTADOR)) return 0;
  try {
    return Number(JSON.parse(fs.readFileSync(CONTADOR, "utf8"))[String(serie)]) || 0;
  } catch {
    return 0;
  }
}

function gravarContador(serie, ultimo) {
  fs.mkdirSync(path.dirname(CONTADOR), { recursive: true });
  const atual = fs.existsSync(CONTADOR) ? JSON.parse(fs.readFileSync(CONTADOR, "utf8")) : {};
  atual[String(serie)] = ultimo;
  fs.writeFileSync(CONTADOR, JSON.stringify(atual));
}

async function proximoNumero(cnpj, cMun) {
  const serie = serieDps();
  let ultimo = lerContador(serie);
  for (let nDps = ultimo + 1; nDps <= ultimo + 30; nDps += 1) {
    const { corpo } = identDps({ cMun, cnpj, serie, nDps });
    const resposta = await sefinHttp("HEAD", `/dps/${corpo}`);
    if (resposta.status === 404) return nDps;
    if (resposta.status === 200) {
      ultimo = nDps;
      continue;
    }
    throw new Error(`Não consultei a numeração da DPS (HTTP ${resposta.status}).`);
  }
  gravarContador(serie, ultimo);
  throw new Error("Não achei um número livre de DPS.");
}

async function municipioDoTomador(tomador) {
  const cep = soDigitos(tomador.cep);
  if (cep.length === 8) {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (res.ok) {
      const data = await res.json();
      const cMun = String(data?.ibge?.city || "");
      if (cMun.length === 7) {
        return {
          cMun,
          cidade: data.city || "",
          uf: data.state || "",
          logradouro: tomador.logradouro || data.street || "",
          bairro: tomador.bairro || data.neighborhood || "",
        };
      }
    }
  }
  const uf = String(tomador.uf || "").trim().toUpperCase();
  const nome = String(tomador.municipio || "").trim();
  if (uf.length === 2 && nome) {
    const res = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`);
    if (res.ok) {
      const lista = await res.json();
      const alvo = nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const achado = lista.find((item) =>
        String(item.nome || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === alvo
      );
      if (achado?.codigo_ibge) {
        return { cMun: String(achado.codigo_ibge), cidade: achado.nome, uf, logradouro: tomador.logradouro || "", bairro: tomador.bairro || "" };
      }
    }
  }
  throw new Error("O tomador precisa de CEP ou município para a NFS-e.");
}

export function xmlSubstituicao(substituicao = {}) {
  const chave = soDigitos(substituicao.chave);
  if (chave.length !== 50) throw new Error("A nota original não tem chave de acesso válida.");
  const { codigo, xMotivo } = motivoSubstituicao(substituicao.motivo, substituicao.texto);
  return `<subst><chSubstda>${chave}</chSubstda><cMotivo>${codigo}</cMotivo>${xMotivo ? `<xMotivo>${xml(xMotivo)}</xMotivo>` : ""}</subst>`;
}

export async function montarDpsXml(payload, { nDps, serie } = {}) {
  const config = payload.config || {};
  const tomador = payload.tomador || {};
  const item = (payload.items || []).find((entry) => Number(entry.valorTotal) > 0) || {};
  const bancos = (payload.items || []).find((entry) => Number(entry.valorTotal) === 0 && entry.descricao);
  const descricao = linhaUnica(item.descricao);
  if (!descricao) throw new Error("Descrição do serviço vazia.");
  const valor = Number(item.valorTotal ?? item.valorUnitario);
  if (!valor) throw new Error("Valor do serviço zerado.");
  const documento = soDigitos(tomador.documento);
  if (![11, 14].includes(documento.length)) throw new Error("Tomador sem CPF/CNPJ.");
  const cnpj = soDigitos(config.prestadorCnpj) || PRESTADOR.cnpj;
  const cMun = soDigitos(config.codigoMunicipio) || PRESTADOR.cMun;
  const local = await municipioDoTomador(tomador);
  const servico = tributacaoNacional(payload.servico?.codigo || payload.tipo);
  if (!servico.codigo || !servico.nbs) throw new Error("Serviço sem código nacional.");
  const retido = /^(1|sim|s|true)$/i.test(String(payload.issRetido || config.issRetido || ""));
  if (retido) throw new Error("Esta nota está com ISS retido. Informe a alíquota de ISS antes de emitir.");
  const numero = nDps ?? 1;
  const faixa = serie ?? serieDps();
  const ident = identDps({ cMun, cnpj, serie: faixa, nDps: numero });
  const competencia = String(payload.dataFato || agoraBahia()).slice(0, 10);
  const rtc = tpAmb() === "2";
  const complemento = linhaUnica(bancos?.descricao || config.dadosBancarios || "");
  const nomeTomador = tomador.razaoSocial || tomador.nome || "";
  const numeroEndereco = String(tomador.numero || "SN").trim();
  const subst = payload.substituicao?.chave ? xmlSubstituicao(payload.substituicao) : "";

  return `<?xml version="1.0" encoding="utf-8"?><DPS versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="${ident.id}"><tpAmb>${tpAmb()}</tpAmb><dhEmi>${agoraBahia()}</dhEmi><verAplic>GPSBA_1.0.0</verAplic><serie>${Number(faixa)}</serie><nDPS>${Number(numero)}</nDPS><dCompet>${competencia}</dCompet><tpEmit>1</tpEmit>${rtc ? "<finNFSe>0</finNFSe>" : ""}<cLocEmi>${cMun}</cLocEmi>${subst}<prest><CNPJ>${cnpj}</CNPJ><fone>${PRESTADOR.fone}</fone><email>${PRESTADOR.email}</email><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest><toma>${documento.length <= 11 ? tag("CPF", documento.padStart(11, "0")) : tag("CNPJ", documento)}<xNome>${xml(nomeTomador)}</xNome><end><endNac><cMun>${local.cMun}</cMun>${tag("CEP", soDigitos(tomador.cep))}</endNac>${tag("xLgr", local.logradouro || tomador.logradouro)}${tag("nro", numeroEndereco)}${tag("xBairro", local.bairro || tomador.bairro)}</end></toma><serv><locPrest><cLocPrestacao>${cMun}</cLocPrestacao></locPrest><cServ><cTribNac>${servico.codigo}</cTribNac>${rtc ? "" : "<cTribMun>001</cTribMun>"}${rtc ? `<cNBS>${servico.nbs}</cNBS><xDescServ>${xml(descricao)}</xDescServ>` : `<xDescServ>${xml(descricao)}</xDescServ><cNBS>${servico.nbs}</cNBS>`}</cServ>${complemento ? `<infoCompl><xInfComp>${xml(complemento)}</xInfComp></infoCompl>` : ""}</serv><valores><vServPrest><vServ>${money(valor)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>${aliquotaSimples()}</pTotTribSN></totTrib></trib></valores></infDPS></DPS>`;
}

function erroSefin(status, text) {
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  const erros = json.erros || json.Erros || [];
  if (Array.isArray(erros) && erros.length) {
    return erros.map((erro) => [erro.Codigo || erro.codigo, erro.Descricao || erro.descricao, erro.Complemento || erro.complemento].filter(Boolean).join(" ")).join(" | ");
  }
  return `A Sefin Nacional recusou a DPS (HTTP ${status}). ${text.slice(0, 300)}`;
}

export async function emitirNaSefin(payload) {
  const cnpj = soDigitos(payload.config?.prestadorCnpj) || PRESTADOR.cnpj;
  const cMun = soDigitos(payload.config?.codigoMunicipio) || PRESTADOR.cMun;
  const serie = serieDps();
  const nDps = await proximoNumero(cnpj, cMun);
  const assinado = signDpsXml(await montarDpsXml(payload, { nDps, serie }));
  const dpsXmlGZipB64 = zlib.gzipSync(Buffer.from(assinado, "utf8")).toString("base64");
  const resposta = await sefinHttp("POST", "/nfse", JSON.stringify({ dpsXmlGZipB64 }));
  if (resposta.status < 200 || resposta.status >= 300) {
    const error = new Error(erroSefin(resposta.status, resposta.body));
    error.dpsUsada = /já informad|duplic|E0014/i.test(error.message);
    if (error.dpsUsada) gravarContador(serie, nDps);
    throw error;
  }
  const json = JSON.parse(resposta.body);
  if (!json.chaveAcesso || !json.nfseXmlGZipB64) {
    throw new Error(erroSefin(resposta.status, resposta.body));
  }
  gravarContador(serie, nDps);
  const chave = String(json.chaveAcesso);
  return {
    chave,
    numeroNf: chave.length === 50 ? String(Number(chave.slice(23, 36))) : "",
    xml: zlib.gunzipSync(Buffer.from(json.nfseXmlGZipB64, "base64")).toString("utf8"),
    nDps,
    serie,
  };
}
