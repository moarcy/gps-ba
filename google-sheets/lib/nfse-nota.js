/** Tipos de nota que a GPS emite para o mesmo caso.
 * `codigo` é o item antigo de Camaçari. `codigoNacional` é o do Emissor Nacional. */
export const TIPOS_NOTA = [
  {
    id: "apreensao",
    label: "Apreensão",
    codigo: "001722",
    codigoNacional: "172201",
    nbs: "118062000",
    prefixo: "SERVIÇO DE BUSCA E APREENSÃO REFERENTE AO",
  },
  {
    id: "guincho",
    label: "Guincho",
    codigo: "001414",
    codigoNacional: "141401",
    nbs: "106019000",
    prefixo: "SERVIÇO DE GUINCHO REFERENTE AO",
  },
  {
    id: "estadias",
    label: "Estadias",
    codigo: "001104",
    codigoNacional: "110401",
    nbs: "106029000",
    prefixo: "SERVIÇO DE ESTADIAS REFERENTE AO",
  },
  {
    id: "chaveiro",
    label: "Chaveiro",
    codigo: "001722",
    codigoNacional: "172201",
    nbs: "118062000",
    prefixo: "SERVIÇO DE CHAVEIRO REFERENTE AO",
  },
];

const TRIBUTACAO_NACIONAL = {};
for (const tipo of TIPOS_NOTA) {
  for (const codigo of [tipo.codigo, tipo.codigoNacional]) {
    if (!TRIBUTACAO_NACIONAL[codigo]) TRIBUTACAO_NACIONAL[codigo] = tipo;
  }
}

/** O XML nacional recusa quebra de linha. O texto da nota sai em uma linha só. */
export function linhaUnica(value) {
  return String(value || "")
    .replace(/\s*[\r\n]+\s*/g, " | ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(?: \| ){2,}/g, " | ")
    .trim();
}

export function tributacaoNacional(codigo) {
  const digits = String(codigo || "").replace(/\D/g, "");
  const tipo = TRIBUTACAO_NACIONAL[digits] || TIPOS_NOTA.find((item) => item.id === codigo);
  if (tipo) return { codigo: tipo.codigoNacional, nbs: tipo.nbs, tipo: tipo.id };
  return { codigo: digits, nbs: "", tipo: "" };
}

export function labelCodigoNacional(codigo) {
  const { codigo: nacional } = tributacaoNacional(codigo);
  if (nacional.length !== 6) return `Código ${codigo || ""}`.trim();
  return `Nacional ${nacional.slice(0, 2)}.${nacional.slice(2, 4)}.${nacional.slice(4)}`;
}

export function tipoNota(id) {
  return TIPOS_NOTA.find((t) => t.id === id) || null;
}

/** Códigos oficiais de substituição da NFS-e Nacional. 99 é correção de dados. */
export const MOTIVOS_SUBSTITUICAO = [
  { id: "99", label: "Correção dos dados" },
  { id: "01", label: "Desenquadramento do Simples Nacional" },
  { id: "02", label: "Enquadramento no Simples Nacional" },
  { id: "03", label: "Inclusão retroativa de imunidade ou isenção" },
  { id: "04", label: "Exclusão retroativa de imunidade ou isenção" },
  { id: "05", label: "Rejeição pelo tomador" },
];

export function motivoSubstituicao(motivo, texto) {
  const codigo = MOTIVOS_SUBSTITUICAO.some((item) => item.id === String(motivo || ""))
    ? String(motivo)
    : "99";
  let xMotivo = "";
  if (codigo === "99") {
    xMotivo = String(texto || "").replace(/\s+/g, " ").trim();
    if (xMotivo.length < 15) xMotivo = "Correção dos dados da nota.";
    if (xMotivo.length > 255) xMotivo = xMotivo.slice(0, 255);
  }
  return { codigo, xMotivo };
}

export function buildDescricaoNota({ tipo, texto, colada = false, km = "", diarias = "" } = {}) {
  const corpo = linhaUnica(texto);
  if (!corpo) return "";
  if (colada) return corpo;

  const spec = tipoNota(tipo);
  if (!spec) return corpo;

  let desc = `${spec.prefixo} ${corpo}`.trim();
  const kmText = String(km || "").trim();
  const dias = String(diarias || "").trim();
  if (tipo === "guincho" && kmText) desc += ` - KM: ${kmText}`;
  if (tipo === "estadias" && dias) desc += ` - ${dias} DIÁRIAS`;
  return linhaUnica(desc);
}

export function buildNomeArquivo({ numero, placa, financiado, assessoria } = {}) {
  const clean = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return [clean(numero), clean(placa), clean(financiado), clean(assessoria)]
    .filter(Boolean)
    .join(" - ");
}
