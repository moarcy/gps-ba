function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatAlertHtml(alerta, motivos = []) {
  const motivo = motivos.length ? motivos.join(" · ") : "filtro";
  const lines = [
    `<b>Radar · ${esc(motivo)}</b>`,
    ``,
    `🔤 <b>${esc(alerta.placa)}</b>`,
    `📷 ${esc(alerta.camera || "—")}`,
  ];
  if (alerta.faixa) lines.push(`↕ ${esc(alerta.faixa)}`);
  lines.push(`🕐 ${esc(alerta.dataHora || "—")}`);
  if (alerta.proprietario) lines.push(`👤 ${esc(alerta.proprietario)}`);
  if (alerta.escritorio) lines.push(`🏢 ${esc(alerta.escritorio)}`);
  if (alerta.banco) lines.push(`🏦 ${esc(alerta.banco)}`);
  if (alerta.lat != null && alerta.lon != null) {
    const url = alerta.mapsUrl || `https://www.google.com/maps?q=${alerta.lat},${alerta.lon}`;
    lines.push(`📍 <a href="${esc(url)}">${alerta.lat}, ${alerta.lon}</a>`);
  } else if (alerta.mapsUrl) {
    lines.push(`🗺️ <a href="${esc(alerta.mapsUrl)}">Abrir no Google Maps</a>`);
  }
  lines.push(``, `<i>/placa ${esc(alerta.placa)}</i>`);
  return lines.join("\n");
}

export function formatAlertText(alerta, motivos = []) {
  const motivo = motivos.length ? motivos.join(" · ") : "filtro";
  const lines = [
    `Radar · ${motivo}`,
    ``,
    `Placa: ${alerta.placa}`,
    `Câmera: ${alerta.camera || "—"}`,
  ];
  if (alerta.faixa) lines.push(`Faixa: ${alerta.faixa}`);
  lines.push(`Data/Hora: ${alerta.dataHora || "—"}`);
  if (alerta.proprietario) lines.push(`Proprietário: ${alerta.proprietario}`);
  if (alerta.escritorio) lines.push(`Escritório: ${alerta.escritorio}`);
  if (alerta.banco) lines.push(`Banco: ${alerta.banco}`);
  if (alerta.mapsUrl) lines.push(`Mapa: ${alerta.mapsUrl}`);
  return lines.join("\n");
}
