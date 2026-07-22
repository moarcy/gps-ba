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
  cancelado: "Cancelado",
};

export const NEXT_STATUS = {
  nova: ["aguardando_mandado", "com_mandado", "indisponivel_temp", "inapto", "cancelado"],
  aguardando_mandado: ["com_mandado", "indisponivel_temp", "inapto", "cancelado"],
  com_mandado: ["apreendido", "indisponivel_temp", "cancelado"],
  indisponivel_temp: ["aguardando_mandado", "com_mandado", "inapto", "cancelado"],
  inapto: ["cancelado", "aguardando_mandado"],
  apreendido: ["no_patio", "aguardando_pagamento", "cancelado"],
  no_patio: ["aguardando_pagamento", "removido"],
  aguardando_pagamento: ["removido", "no_patio"],
  removido: [],
  cancelado: ["nova"],
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
