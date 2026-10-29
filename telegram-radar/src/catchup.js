import { classifyMotivo, isFeiraCorridor } from "./filter.js";
import { ingestSourceMessage, serializeIngest, shouldNotifyMissed } from "./ingest.js";

export async function resolveChat(client, sourceChatId) {
  const dialogs = await client.getDialogs({ limit: 200 });
  const found = dialogs.find((d) => String(d.id) === String(sourceChatId));
  if (found?.entity) return found.entity;
  return client.getEntity(/^-?\d+$/.test(String(sourceChatId)) ? Number(sourceChatId) : sourceChatId);
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
  intervalMs = Number(process.env.RADAR_POLL_MS || 30000),
}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    if (client.connected === false || client.disconnected === true) {
      console.error("Telegram desconectou. Reiniciando o radar…");
      process.exit(1);
    }
    running = true;
    try {
      await serializeIngest(() =>
        catchUpHistory({
          client,
          store,
          sourceChatId,
          onKeep,
          quiet: true,
        }),
      );
    } catch (err) {
      console.error("Catch-up periódico falhou:", err.message || err);
      if (/disconnect|not connected|timeout|AUTH_KEY/i.test(String(err.message || err))) {
        process.exit(1);
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
