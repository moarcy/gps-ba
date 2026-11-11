export function vehicleFacts(item) {
  let cor = String(item?.cor || "").replace(/\s+/g, " ").trim();
  let comarca = String(item?.origem || "").replace(/\s+/g, " ").trim();
  if (/^(comarca|origem)\s*:/i.test(cor)) {
    const parsed = cor.replace(/^(comarca|origem)\s*:/i, "").trim();
    if (!comarca && parsed) comarca = parsed;
    cor = "";
  }
  comarca = comarca.replace(/^(comarca|origem)\s*:/i, "").trim();
  return {
    veiculo: String(item?.veiculo || "").replace(/\s+/g, " ").trim(),
    cor,
    comarca,
    uf: String(item?.uf || "").trim(),
  };
}
