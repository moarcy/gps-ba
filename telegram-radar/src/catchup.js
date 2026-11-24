import { classifyMotivo, isFeiraCorridor } from "./filter.js";
import { ingestSourceMessage, serializeIngest, shouldNotifyMissed } from "./ingest.js";

const chatCache = new Map();

export function forgetChat(sourceChatId) {
  chatCache.delete(String(sourceChatId || "").trim());
}

export async function resolveChat(client, sourceChatId) {
  const key = String(sourceChatId || "").trim();
  if (!key) throw new Error("TELEGRAM_SOURCE_CHAT_ID vazio");
  const cached = chatCache.get(key);
  if (cached) return cached;

  const id = /^-?\d+$/.test(key) ? Number(key) : key;
  let entity = null;
  try {
    entity = await client.getEntity(id);
  } catch {
    entity = null;
  }
  if (!entity) {
    const dialogs = await client.getDialogs({ limit: 200 });
    entity = dialogs.find((d) => String(d.id) === key)?.entity || null;
  }
  if (!entity) entity = await client.getEntity(id);
  chatCache.set(key, entity);
  return entity;
}

async function notifyStoredMissed(store, onKeep, { maxAgeHours }) {
  if (typeof onKeep !== "function") return 0;
  let notified = 0;
  for (const sighting of store.all()) {
    if (!isFeiraCorridor(sighting)) continue;
    if (!shouldNotifyMissed(sighting, { maxAgeHours })) continue;
    if (typeof store.wasNotified === "function" && store.wasNotified(sighting.fp)) continue;
    const motivos = classifyMotivo(sighting);
    try {
      await onKeep(sighting, [...motivos, "atrasado — recuperação"], {});
      if (typeof store.markNotified === "function") await store.markNotified(sighting.fp);
      sighting.notified = true;
      notified += 1;
      console.log(`Telegram ← recuperação · ${sighting.placa} · ${sighting.camera}`);
    } catch (err) {
      console.error(`Falha ao recuperar ${sighting.placa}:`, err.message || err);
    }
  }
  return notified;
}

export async function catchUpHistory({
  client,
  store,
  sourceChatId,
  onKeep,
  maxAgeHours = Number(process.env.RADAR_CATCHUP_NOTIFY_HOURS || 18),
  limit = Number(process.env.RADAR_CATCHUP_LIMIT || 4000),
  quiet = false,
  backfillStored = false,
} = {}) {
  const since = typeof store.lastSourceMessageId === "function" ? store.lastSourceMessageId() : 0;
  if (!quiet) {
    console.log(
      since
        ? `Catch-up: mensagens depois de #${since} (aviso Feira até ${maxAgeHours}h)…`
        : `Catch-up inicial: últimas ${limit} mensagens do Painel RK…`,
    );
  }

  const chat = await resolveChat(client, sourceChatId);
  const messages = [];
  const seen = new Set();
  const iterOpts = since
    ? { minId: since, reverse: true, limit }
    : { limit };

  for await (const msg of client.iterMessages(chat, iterOpts)) {
    if (!msg?.id || seen.has(msg.id) || msg.id <= since) continue;
    seen.add(msg.id);
    messages.push(msg);
  }

  messages.sort((a, b) => a.id - b.id);
  const known = typeof store.knownPlates === "function" ? store.knownPlates() : new Set();
  let stored = 0;
  let notified = 0;
  let skippedNotify = 0;
  let maxId = since;

  for (const msg of messages) {
    maxId = Math.max(maxId, msg.id);
    const result = await ingestSourceMessage(store, msg, {
      client,
      known,
      downloadPhotos: false,
      source: "telegram-catchup",
      onKeep: async (sighting, motivos, media) => {
        if (!shouldNotifyMissed(sighting, { maxAgeHours })) {
          skippedNotify += 1;
          return false;
        }
        if (typeof onKeep === "function") {
          await onKeep(sighting, [...motivos, "atrasado — PC estava desligado"], media);
          notified += 1;
          return true;
        }
        return false;
      },
    });
    stored += result.stored || 0;
    if (typeof store.setLastSourceMessageId === "function") {
      await store.setLastSourceMessageId(msg.id);
    }
  }

  if (typeof store.setLastSourceMessageId === "function" && maxId) {
    await store.setLastSourceMessageId(maxId, { flush: true });
  }

  let recovered = 0;
  if (backfillStored) {
    recovered = await notifyStoredMissed(store, onKeep, { maxAgeHours });
  }

  if (!quiet || stored || notified || recovered) {
    console.log(
      `Catch-up: ${messages.length} lidas · ${stored} gravadas · ${notified} avisos · ${skippedNotify} Feira só no radar (>${maxAgeHours}h)${
        recovered ? ` · ${recovered} recuperados do histórico` : ""
      }`,
    );
  }
  return { scanned: messages.length, stored, notified, skippedNotify, recovered };
}

export function startCatchUpLoop({
  client,
  store,
  sourceChatId,
  onKeep,
  intervalMs = Number(process.env.RADAR_POLL_MS || 5 * 60 * 1000),
  limit = Number(process.env.RADAR_POLL_LIMIT || 40),
}) {
  let running = false;
  console.log(
    `Catch-up de segurança a cada ${Math.round(intervalMs / 1000)}s (no máximo ${limit} mensagens). O ao vivo segue pelo evento.`,
  );
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (client.connected === false) {
        try {
          await client.connect();
        } catch (err) {
          console.error("Telegram desconectado. Nova tentativa no próximo ciclo:", err.message || err);
          return;
        }
      }
      await serializeIngest(() =>
        catchUpHistory({
          client,
          store,
          sourceChatId,
          onKeep,
          quiet: true,
          limit,
          backfillStored: false,
        }),
      );
    } catch (err) {
      forgetChat(sourceChatId);
      console.error("Catch-up periódico falhou:", err.message || err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
