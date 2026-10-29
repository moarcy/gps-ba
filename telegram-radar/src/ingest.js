import { classifyMotivo, decideTrack, isFeiraCorridor } from "./filter.js";
import { isBlacklistAlert, parseAlerta, splitAlerts } from "./parse-alerta.js";

let ingestChain = Promise.resolve();

export function serializeIngest(fn) {
  const next = ingestChain.then(fn, fn);
  ingestChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function messageText(msg) {
  return String(
    msg?.message || msg?.rawText || msg?.text || msg?.caption || "",
  ).trim();
}

export function isPhotoMessage(msg) {
  const media = msg.media;
  if (!media) return Boolean(msg.photo);
  const name = String(media.className || "");
  return name.includes("Photo") || Boolean(msg.photo);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

export async function downloadPhoto(client, msg) {
  if (!isPhotoMessage(msg)) return null;
  try {
    const data = await withTimeout(client.downloadMedia(msg, {}), 8000);
    if (!data) return null;
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  } catch (err) {
    console.error("Download da foto:", err.message || err);
    return null;
  }
}

export function mapsFromMessage(msg) {
  const entities = msg.entities || msg.captionEntities || [];
  const text = messageText(msg);
  for (const ent of entities) {
    const url = ent.url || ent.href;
    if (url && /maps|goo\.gl/i.test(url)) return url;
    if (ent.className === "MessageEntityUrl" || ent.offset != null) {
      const slice = text.slice(ent.offset, ent.offset + (ent.length || 0));
      if (/https?:\/\/\S*map/i.test(slice)) return slice;
    }
  }
  return "";
}

export function shouldNotifyMissed(alerta, { now = Date.now(), maxAgeHours = 18 } = {}) {
  const hours = Number(maxAgeHours);
  const maxMs = (Number.isFinite(hours) ? hours : 18) * 3600 * 1000;
  const t = alerta?.iso ? Date.parse(alerta.iso) : NaN;
  if (!Number.isFinite(t)) return true;
  return now - t <= maxMs;
}

async function sendAlert(store, sighting, motivos, onKeep, media) {
  if (typeof onKeep !== "function") return false;
  const fp = sighting.fp;
  if (fp && typeof store.wasNotified === "function" && store.wasNotified(fp)) {
    return false;
  }
  const result = await onKeep(sighting, motivos, media);
  if (result === false) return false;
  if (fp && typeof store.markNotified === "function") {
    await store.markNotified(fp);
  }
  sighting.notified = true;
  return true;
}

export async function ingestSourceMessage(store, msg, {
  client = null,
  onKeep,
  known = null,
  downloadPhotos = true,
  source = "telegram-listener",
} = {}) {
  const text = messageText(msg);
  if (!text || !isBlacklistAlert(text)) {
    return { skipped: true, notified: 0, stored: 0 };
  }

  const mapsUrl = mapsFromMessage(msg);
  const chunks = splitAlerts(text);
  const alertas = chunks.length
    ? chunks
    : [parseAlerta(text, { mapsUrl })].filter(Boolean);
  const plates = known || (typeof store.knownPlates === "function" ? store.knownPlates() : new Set());

  let stored = 0;
  let notified = 0;

  for (const alerta of alertas) {
    if (mapsUrl && !alerta.mapsUrl) alerta.mapsUrl = mapsUrl;
    const { track, notify } = decideTrack(alerta, { knownPlates: plates });
    if (!track) {
      if (isFeiraCorridor(alerta)) {
        console.warn(`Feira parseada mas descartada: ${alerta.placa} · ${alerta.camera}`);
      }
      continue;
    }

    const motivos = notify
      ? classifyMotivo(alerta, ["FEIRA DE SANTANA"])
      : ["rota"];
    const { sighting, duplicate } = await store.add(alerta, {
      motivos,
      hits: notify ? ["FEIRA DE SANTANA"] : [],
      source,
      sourceChatId: String(msg.chatId || ""),
      messageId: msg.id,
    });
    if (!duplicate) plates.add(sighting.placa);
    if (duplicate && !(notify && typeof onKeep === "function")) continue;
    if (!duplicate) stored += 1;

    if (notify && typeof onKeep === "function") {
      if (typeof store.wasNotified === "function" && store.wasNotified(sighting.fp)) {
        continue;
      }
      let photoBuffer = null;
      if (downloadPhotos && client) {
        photoBuffer = await downloadPhoto(client, msg);
        if (photoBuffer && typeof store.savePhoto === "function") {
          await store.savePhoto(sighting.placa, sighting.id, photoBuffer);
        }
      }
      try {
        const sent = await sendAlert(store, sighting, motivos, onKeep, { photoBuffer });
        if (sent) {
          notified += 1;
          console.log(`Telegram ← ${motivos[0]} · ${sighting.placa} · ${sighting.camera}`);
        }
      } catch (err) {
        console.error(`Falha ao avisar ${sighting.placa}:`, err.message || err);
      }
    } else if (!duplicate) {
      console.log(`Radar gravou rota ${sighting.placa} · ${sighting.camera}`);
    }
  }

  return { skipped: false, stored, notified };
}
