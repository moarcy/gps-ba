import QRCode from "qrcode";
import { NFSE_LOGO_BASE64 } from "./logo-data.js";

const UF_POR_IBGE = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
  31: "MG", 32: "ES", 33: "RJ", 35: "SP",
  41: "PR", 42: "SC", 43: "RS",
  50: "MS", 51: "MT", 52: "GO", 53: "DF",
};

const MUNICIPIO = {
  2905701: "Camaçari",
  4209102: "Joinville",
};

const AMB_GER = { 1: "Município", 2: "Sefin Nacional NFS-e" };
const TP_AMB = { 1: "Produção", 2: "Homologação" };
const CSTAT = { 100: "NFS-e Gerada", 101: "NFS-e Cancelada", 102: "NFS-e Substituída" };
const TP_EMIT = { 1: "Prestador", 2: "Tomador", 3: "Intermediário" };
const TRIB_ISS = {
  1: "Operação tributável",
  2: "Imunidade",
  3: "Exportação de serviço",
  4: "Não incidência",
};
const RET_ISS = { 1: "Não Retido", 2: "Retido pelo Tomador", 3: "Retido pelo Intermediário" };
const SIMPLES = {
  1: "Não Optante",
  2: "Optante — Microempreendedor Individual (MEI)",
  3: "Optante — Microempresa ou Empresa de Pequeno Porte (ME/EPP)",
};
const REG_AP = {
  1: "Tributos federais e municipal pelo Simples Nacional",
  2: "Federais pelo Simples Nacional e ISSQN fora do SN",
  3: "Federais e municipal fora do Simples Nacional",
};

function decodeXml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripSignatures(xml) {
  return String(xml || "").replace(/<Signature\b[\s\S]*?<\/Signature>/g, "");
}

function block(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1] || "";
}

function text(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return decodeXml(match?.[1] || "").trim();
}

function codigo(mapa, valor) {
  if (!valor) return "";
  const nome = mapa[valor] || mapa[Number(valor)];
  return nome ? `${valor} - ${nome}` : String(valor);
}

function soDigitos(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCnpj(value) {
  const digits = soDigitos(value);
  if (digits.length !== 14) return value || "";
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatCep(value) {
  const digits = soDigitos(value);
  if (digits.length !== 8) return value || "";
  return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
}

function formatFone(value) {
  const digits = soDigitos(value);
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || "";
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatData(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return iso || "";
  const data = `${match[3]}/${match[2]}/${match[1]}`;
  return match[4] ? `${data} ${match[4]}:${match[5]}:${match[6]}` : data;
}

function formatCompetencia(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso || "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function codigoNacional(value) {
  const digits = soDigitos(value);
  if (digits.length !== 6) return value || "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function localIbge(codigoMunicipio, nomeXml, ufXml) {
  const codigo = soDigitos(codigoMunicipio);
  const uf = ufXml || UF_POR_IBGE[Number(codigo.slice(0, 2))] || "";
  const nome = nomeXml || MUNICIPIO[Number(codigo)] || (codigo ? `IBGE ${codigo}` : "");
  return [nome, uf].filter(Boolean).join("/");
}

function chaveFormatada(chave) {
  return soDigitos(chave).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseNfseXml(xml) {
  const clean = stripSignatures(xml);
  const inf = block(clean, "infNFSe");
  const dps = block(inf, "infDPS");
  const emit = block(inf, "emit");
  const emitEnd = block(emit, "enderNac");
  const prest = block(dps, "prest");
  const reg = block(prest, "regTrib");
  const toma = block(dps, "toma");
  const tomaEnd = block(toma, "end") || block(toma, "endNac");
  const serv = block(dps, "serv");
  const cServ = block(serv, "cServ");
  const valoresDps = block(dps, "valores");
  const tribMun = block(block(valoresDps, "trib"), "tribMun");
  const totTrib = block(block(valoresDps, "trib"), "totTrib");
  const id = clean.match(/<infNFSe\b[^>]*\bId="NFS(\d{50})"/)?.[1] || "";
  const chave = id || soDigitos(text(inf, "chaveAcesso"));

  return {
    versao: clean.match(/\bversao="([^"]+)"/)?.[1] || "",
    chave,
    consulta: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`,
    numero: text(inf, "nNFSe"),
    competencia: formatCompetencia(text(dps, "dCompet")),
    emissaoNfse: formatData(text(inf, "dhProc") || text(dps, "dhEmi")),
    numeroDps: text(dps, "nDPS"),
    serieDps: text(dps, "serie"),
    emissaoDps: formatData(text(dps, "dhEmi")),
    emitente: codigo(TP_EMIT, text(dps, "tpEmit")),
    situacao: codigo(CSTAT, text(inf, "cStat")),
    municipioEmitente: text(inf, "xLocEmi"),
    ambienteGerador: codigo(AMB_GER, text(inf, "ambGer")),
    tipoAmbiente: codigo(TP_AMB, text(dps, "tpAmb")),
    homologacao: text(dps, "tpAmb") === "2",
    prestador: {
      cnpj: formatCnpj(text(emit, "CNPJ") || text(prest, "CNPJ")),
      im: text(emit, "IM") || text(prest, "IM"),
      nome: text(emit, "xNome"),
      fone: formatFone(text(emit, "fone") || text(prest, "fone")),
      email: text(emit, "email") || text(prest, "email"),
      logradouro: text(emitEnd, "xLgr"),
      numero: text(emitEnd, "nro"),
      bairro: text(emitEnd, "xBairro"),
      cep: formatCep(text(emitEnd, "CEP")),
      local: localIbge(text(emitEnd, "cMun"), text(inf, "xLocEmi"), text(emitEnd, "UF")),
      ibge: text(emitEnd, "cMun"),
      simples: codigo(SIMPLES, text(reg, "opSimpNac")),
      regime: codigo(REG_AP, text(reg, "regApTribSN")),
    },
    tomador: {
      cnpj: formatCnpj(text(toma, "CNPJ") || text(toma, "CPF")),
      im: text(toma, "IM"),
      nome: text(toma, "xNome"),
      fone: formatFone(text(toma, "fone")),
      email: text(toma, "email"),
      logradouro: text(tomaEnd, "xLgr"),
      numero: text(tomaEnd, "nro"),
      bairro: text(tomaEnd, "xBairro"),
      cep: formatCep(text(tomaEnd, "CEP") || text(block(tomaEnd, "endNac"), "CEP")),
      local: localIbge(text(block(tomaEnd, "endNac"), "cMun") || text(tomaEnd, "cMun"), "", ""),
      ibge: text(block(tomaEnd, "endNac"), "cMun") || text(tomaEnd, "cMun"),
    },
    servico: {
      nacional: codigoNacional(text(cServ, "cTribNac")),
      municipal: text(cServ, "cTribMun"),
      nbs: text(cServ, "cNBS"),
      descricaoCodigo: text(inf, "xTribNac"),
      nbsDescricao: text(inf, "xNBS"),
      local: localIbge(text(block(serv, "locPrest"), "cLocPrestacao"), text(inf, "xLocPrestacao"), ""),
      descricao: text(cServ, "xDescServ"),
      complementares: text(block(serv, "infoCompl"), "xInfComp"),
    },
    iss: {
      tributacao: codigo(TRIB_ISS, text(tribMun, "tribISSQN")),
      incidencia: localIbge(text(inf, "cLocIncid"), text(inf, "xLocIncid"), ""),
      retencao: codigo(RET_ISS, text(tribMun, "tpRetISSQN")),
      aliquota: text(tribMun, "pAliq"),
      valor: text(tribMun, "vISSQN"),
    },
    totais: {
      servico: formatMoney(text(block(valoresDps, "vServPrest"), "vServ")),
      liquido: formatMoney(text(block(inf, "valores"), "vLiq")),
      simples: text(totTrib, "pTotTribSN"),
    },
  };
}

function campo(label, valor, largo = false) {
  return `<div class="campo${largo ? " largo" : ""}"><span>${esc(label)}</span><strong>${esc(valor || "—")}</strong></div>`;
}

function bloco(titulo, miolo, classe = "") {
  return `<section class="bloco ${classe}"><h2>${esc(titulo)}</h2><div class="miolo">${miolo}</div></section>`;
}

export async function htmlDanfse(xml) {
  const nota = parseNfseXml(xml);
  if (nota.chave.length !== 50) throw new Error("XML da NFS-e sem chave de acesso.");
  const qr = await QRCode.toDataURL(nota.consulta, { margin: 0, width: 180, errorCorrectionLevel: "M" });
  const logo = NFSE_LOGO_BASE64;
  const enderecoPrestador = [nota.prestador.logradouro, nota.prestador.numero, nota.prestador.bairro].filter(Boolean).join(", ");
  const enderecoTomador = [nota.tomador.logradouro, nota.tomador.numero, nota.tomador.bairro].filter(Boolean).join(", ");
  const complementares = [
    nota.servico.complementares,
    nota.totais.simples ? `Totais aproximados dos tributos (Lei 12.741/2012): ${formatMoney(nota.totais.simples)}% — Simples Nacional.` : "",
  ].filter(Boolean).join(" ");

  const prestador = [
    campo("CNPJ", nota.prestador.cnpj),
    campo("Inscrição Municipal", nota.prestador.im),
    campo("Telefone", nota.prestador.fone),
    campo("Nome / Nome Empresarial", nota.prestador.nome, true),
    campo("Endereço", enderecoPrestador, true),
    campo("Município / UF", nota.prestador.local),
    campo("CEP", nota.prestador.cep),
    campo("Código IBGE", nota.prestador.ibge),
    campo("E-mail", nota.prestador.email, true),
    campo("Simples Nacional na Competência", nota.prestador.simples, true),
    campo("Regime de Apuração pelo SN", nota.prestador.regime, true),
  ].join("");

  const tomador = nota.tomador.nome
    ? [
        campo("CNPJ / CPF", nota.tomador.cnpj),
        campo("Inscrição Municipal", nota.tomador.im),
        campo("Telefone", nota.tomador.fone),
        campo("Nome / Nome Empresarial", nota.tomador.nome, true),
        campo("Endereço", enderecoTomador, true),
        campo("Município / UF", nota.tomador.local),
        campo("CEP", nota.tomador.cep),
        campo("Código IBGE", nota.tomador.ibge),
        campo("E-mail", nota.tomador.email, true),
      ].join("")
    : `<p class="aviso">TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>DANFSe ${esc(nota.numero)}</title>
<style>
  @page { size: A4 portrait; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Microsoft Sans Serif", Arial, sans-serif; font-size: 7pt; }
  .folha {
    border: 1pt solid #000;
    min-height: 289mm;
    display: flex;
    flex-direction: column;
  }
  header {
    display: grid;
    grid-template-columns: 58mm 1fr 38mm;
    gap: 2mm;
    align-items: center;
    padding: 1.5mm 2mm;
    border-bottom: 0.5pt solid #000;
    background: #f2f2f2;
  }
  header img.logo { width: 54mm; height: auto; }
  .titulo { text-align: center; font-family: Arial, sans-serif; }
  .titulo strong { display: block; font-size: 9pt; }
  .titulo span { display: block; font-size: 9pt; font-weight: 700; }
  .aviso-homolog { color: #e10600; font-family: Arial, sans-serif; font-size: 9pt; font-weight: 700; }
  .ambiente { text-align: right; font-size: 6pt; line-height: 1.25; }
  .ambiente b { display: block; font-size: 8pt; font-weight: 400; }
  .ident {
    display: grid;
    grid-template-columns: 1fr 22mm;
    border-bottom: 0.5pt solid #000;
  }
  .ident-campos { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  .qr { padding: 1mm; text-align: center; border-left: 0.5pt solid #000; }
  .qr img { width: 16mm; height: 16mm; }
  .qr p { margin: 0.6mm 0 0; font-size: 5.5pt; line-height: 1.15; }
  h2 {
    margin: 0;
    padding: 0.5mm 1.5mm;
    background: #f2f2f2;
    border-top: 0.5pt solid #000;
    border-bottom: 0.5pt solid #000;
    font-family: Arial, sans-serif;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .miolo { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  .campo { padding: 0.5mm 1.5mm 0.8mm; border-bottom: 0.5pt solid #ddd; min-width: 0; }
  .campo.largo { grid-column: 1 / -1; }
  .campo span { display: block; font-family: Arial, sans-serif; font-size: 6pt; font-weight: 700; }
  .campo strong { display: block; font-weight: 400; font-size: 7pt; word-break: break-word; }
  .chave { grid-column: 1 / -1; }
  .chave strong { font-size: 8pt; letter-spacing: 0.02em; }
  .texto { padding: 1.2mm 1.5mm; white-space: pre-wrap; line-height: 1.3; flex: 1; }
  .aviso { margin: 0; padding: 1.4mm 1.5mm; font-family: Arial, sans-serif; font-size: 7pt; font-weight: 700; }
  .totais .miolo { grid-template-columns: 1fr 1fr; }
  .liquido { background: #f2f2f2; }
</style>
</head>
<body>
<article class="folha">
  <header>
    <img class="logo" alt="NFS-e" src="data:image/png;base64,${logo}">
    <div class="titulo">
      <strong>DANFSe v2.0</strong>
      <span>Documento Auxiliar da NFS-e</span>
      ${nota.homologacao ? '<div class="aviso-homolog">NFS-e SEM VALIDADE JURÍDICA</div>' : ""}
    </div>
    <div class="ambiente">
      <b>${esc(nota.municipioEmitente)}</b>
      ${esc(nota.ambienteGerador)}<br>
      ${esc(nota.tipoAmbiente)}
    </div>
  </header>
  <div class="ident">
    <div class="ident-campos">
      <div class="campo chave"><span>CHAVE DE ACESSO</span><strong>${esc(chaveFormatada(nota.chave))}</strong></div>
      ${campo("NÚMERO DA NFS-e", nota.numero)}
      ${campo("COMPETÊNCIA", nota.competencia)}
      ${campo("EMISSÃO DA NFS-e", nota.emissaoNfse)}
      ${campo("NÚMERO DA DPS", nota.numeroDps)}
      ${campo("SÉRIE DA DPS", nota.serieDps)}
      ${campo("EMISSÃO DA DPS", nota.emissaoDps)}
      ${campo("EMITENTE", nota.emitente)}
      ${campo("SITUAÇÃO", nota.situacao)}
    </div>
    <div class="qr">
      <img alt="QR Code da consulta pública" src="${qr}">
      <p>A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</p>
    </div>
  </div>
  ${bloco("Prestador / Fornecedor", prestador)}
  ${bloco("Tomador / Adquirente", tomador)}
  ${bloco("Intermediário da Operação", '<p class="aviso">INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</p>')}
  ${bloco("Serviço Prestado", [
    campo("Código de Tributação Nacional", nota.servico.nacional),
    campo("Código Municipal", nota.servico.municipal),
    campo("NBS", nota.servico.nbs),
    campo("Descrição do Código Nacional", nota.servico.descricaoCodigo, true),
    campo("Local da Prestação", nota.servico.local),
    campo("Descrição da NBS", nota.servico.nbsDescricao, true),
  ].join(""))}
  <section class="bloco cresce">
    <h2>Descrição do Serviço</h2>
    <div class="texto">${esc(nota.servico.descricao)}</div>
  </section>
  ${bloco("Tributação Municipal (ISSQN)", [
    campo("Tipo de Tributação do ISSQN", nota.iss.tributacao, true),
    campo("Município de Incidência", nota.iss.incidencia),
    campo("Retenção do ISSQN", nota.iss.retencao),
    campo("Alíquota Aplicada", nota.iss.aliquota ? `${formatMoney(nota.iss.aliquota)}%` : ""),
    campo("ISSQN Apurado", nota.iss.valor ? formatMoney(nota.iss.valor) : ""),
  ].join(""))}
  <section class="bloco totais">
    <h2>Valor da NFS-e</h2>
    <div class="miolo">
      ${campo("Valor do Serviço", nota.totais.servico ? `R$ ${nota.totais.servico}` : "")}
      <div class="campo liquido"><span>Valor Líquido da NFS-e</span><strong>${nota.totais.liquido ? `R$ ${esc(nota.totais.liquido)}` : "—"}</strong></div>
    </div>
  </section>
  <section class="bloco">
    <h2>Informações Complementares</h2>
    <div class="texto">${esc(complementares)}</div>
  </section>
</article>
</body>
</html>`;
}
