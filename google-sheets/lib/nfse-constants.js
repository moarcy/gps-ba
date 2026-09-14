export const NFSE_TOMADORES_SHEET = "NFS-e Tomadores";
export const NFSE_SERVICOS_SHEET = "NFS-e Servicos";
export const NFSE_CONFIG_SHEET = "NFS-e Config";
export const NFSE_EMITIDAS_SHEET = "NFS-e Emitidas";

export const HEADER_ROW = 1;
export const DATA_START = 2;

export const TOMADOR_HEADERS = [
  "id",
  "tipo",
  "documento",
  "razao_social",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "municipio",
  "uf",
  "cep",
  "pais",
  "telefone",
  "email",
];

export const SERVICO_HEADERS = [
  "codigo",
  "cnae",
  "cnae_descricao",
  "servico_descricao",
  "descricao_padrao",
];

export const CONFIG_HEADERS = ["chave", "valor"];

export const EMITIDA_HEADERS = [
  "id",
  "criado_em",
  "status",
  "numero_nf",
  "tomador_id",
  "tomador_nome",
  "servico_codigo",
  "cnae",
  "descricao",
  "quantidade",
  "valor_unitario",
  "valor_total",
  "aliquota",
  "data_fato",
  "erro",
];

export const DEFAULT_BANK_TEXT = `DADOS BANCÁRIOS:
*BANCO DO BASIL - AGÊNCIA: 2976-9 CC: 177000-4
FAVORECIDO: GPS BAHIA - PIX: 10.348.519/0001-19`;

export const DEFAULT_CONFIG = {
  prestador_nome: "GPS BAHIA LTDA",
  prestador_cnpj: "10.348.519/0001-19",
  inscricao_municipal: "0053063001",
  uf_prestacao: "BA",
  municipio_prestacao: "CAMACARI",
  codigo_municipio: "2905701",
  iss_retido: "Nao",
  exigibilidade: "Exigivel",
  tributacao: "No municipio",
  aliquota: "4.05",
  dados_bancarios: DEFAULT_BANK_TEXT,
  imprime_nota: "Sim",
};

export const DEFAULT_SERVICOS = [
  {
    codigo: "001414",
    cnae: "5229-0/02",
    cnae_descricao: "SERVIÇOS DE REBOQUE DE VEÍCULOS",
    servico_descricao: "",
    descricao_padrao: "",
  },
  {
    codigo: "001104",
    cnae: "5229-0/02",
    cnae_descricao: "SERVIÇOS DE REBOQUE DE VEÍCULOS",
    servico_descricao:
      "ARMAZENAMENTO, DEPÓSITO, CARGA, DESCARGA, ARRUMAÇÃO E GUARDA DE BENS DE QUALQUER ESPÉCIE.",
    descricao_padrao: "ESTADIAS REFERENTE AO VEICULO - ",
  },
  {
    codigo: "001722",
    cnae: "8291-1/00",
    cnae_descricao: "",
    servico_descricao: "",
    descricao_padrao: "",
  },
];
