export const STATUS_ORDER = [
  "nova",
  "aguardando_mandado",
  "com_mandado",
  "indisponivel_temp",
  "inapto",
  "apreendido",
  "no_patio",
  "aguardando_pagamento",
  "removido",
  "entregue",
  "cancelado",
];

export const STATUS_LABELS = {
  nova: "Nova",
  aguardando_mandado: "Aguardando mandado",
  com_mandado: "Com mandado",
  indisponivel_temp: "Indisp. temp.",
  inapto: "Inapto",
  apreendido: "Apreendido",
  no_patio: "No pátio",
  aguardando_pagamento: "Pagamento",
  removido: "Removido",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const NEXT_STATUS = {
  nova: ["aguardando_mandado", "com_mandado", "indisponivel_temp", "inapto", "cancelado"],
  aguardando_mandado: ["com_mandado", "indisponivel_temp", "inapto", "cancelado"],
  com_mandado: ["apreendido", "indisponivel_temp", "cancelado"],
  indisponivel_temp: ["aguardando_mandado", "com_mandado", "inapto", "cancelado"],
  inapto: ["cancelado", "aguardando_mandado"],
  // Apreensão → pátio → remoção → entregue (fim do CRM).
  // Pagamento segue em paralelo e pode ficar pendente.
  apreendido: ["no_patio"],
  no_patio: ["removido"],
  aguardando_pagamento: ["no_patio", "removido"],
  removido: ["entregue"],
  entregue: [],
  cancelado: ["nova"],
};

/** Rótulos dos botões de transição (quando diferente do label do status). */
export const NEXT_STATUS_ACTION_LABELS = {
  apreendido: "Apreender → pátio",
  removido: "Remover do pátio",
  entregue: "Marcar entregue",
  no_patio: "Voltar ao pátio",
};

export function formatShortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!d) return iso;
  return `${d}/${m}`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
