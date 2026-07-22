export const CRM_PIPELINE_SHEET = "CRM Pipeline";
export const CRM_TIMELINE_SHEET = "CRM Timeline";
export const CRM_PAGAMENTOS_SHEET = "CRM Pagamentos";

export const CRM_STATUSES = [
  "nova",
  "aguardando_mandado",
  "com_mandado",
  "indisponivel_temp",
  "inapto",
  "apreendido",
  "no_patio",
  "aguardando_pagamento",
  "removido",
  "cancelado",
];

export const CRM_STATUS_LABELS = {
  nova: "Nova ocorrência",
  aguardando_mandado: "Aguardando mandado",
  com_mandado: "Com mandado",
  indisponivel_temp: "Indisponível temp.",
  inapto: "Inapto",
  apreendido: "Apreendido",
  no_patio: "No pátio",
  aguardando_pagamento: "Aguardando pagamento",
  removido: "Removido",
  cancelado: "Cancelado",
};

export const FOLLOWUP_STATUSES = new Set([
  "nova",
  "aguardando_mandado",
  "com_mandado",
  "indisponivel_temp",
]);

export const CONTROLE_BRIDGE_STATUSES = new Set([
  "apreendido",
  "no_patio",
  "aguardando_pagamento",
  "removido",
]);

export const PIPELINE_HEADERS = [
  "placa",
  "data_ocorrencia",
  "veiculo",
  "cor",
  "origem",
  "uf",
  "assessoria",
  "telefone",
  "localizador",
  "status",
  "rastreado",
  "tem_mandado",
  "usa_guincho",
  "patio",
  "data_apreensao",
  "data_entrada_patio",
  "data_saida_patio",
  "valor_diaria",
  "proximo_contato",
  "observacoes",
  "raw_whatsapp",
  "no_controle",
  "atualizado_em",
];

export const TIMELINE_HEADERS = ["id", "data_hora", "placa", "tipo", "mensagem"];

export const PAGAMENTO_HEADERS = [
  "id",
  "placa",
  "data_prevista",
  "tipo",
  "assessoria",
  "valor",
  "pago",
  "data_pago",
  "nota",
];

export const HEADER_ROW = 1;
export const DATA_START = 2;
