export function extractText(payload) {
  const msg = payload?.message || payload?.data?.message || payload;
  if (!msg || typeof msg !== "object") return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    ""
  );
}

export function extractMeta(body) {
  const data = Array.isArray(body?.data) ? body.data[0] : body?.data || body;
  const key = data?.key || {};
  const tsRaw = data?.messageTimestamp || data?.timestamp || body?.date_time;
  let ts = Date.now();
  if (tsRaw) {
    const n = Number(tsRaw);
    ts = n > 1e12 ? n : n * 1000;
  }
  return {
    id: key.id || data?.id || "",
    jid: String(key.remoteJid || data?.remoteJid || "").trim(),
    fromMe: Boolean(key.fromMe),
    pushName: String(data?.pushName || body?.pushName || "").trim(),
    ts,
    text: extractText(data),
  };
}

export function isLocgramChat(meta, allowedJid) {
  if (allowedJid) {
    const want = allowedJid.replace(/@.*/, "");
    const got = String(meta.jid || "").replace(/@.*/, "");
    if (got && want && got === want) return true;
    if (meta.jid && meta.jid === allowedJid) return true;
  }
  if (/locgram/i.test(meta.pushName || "")) return true;
  return false;
}
