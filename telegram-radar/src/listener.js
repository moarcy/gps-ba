import { events, sessions, TelegramClient } from "teleproto";
import { catchUpHistory, startCatchUpLoop } from "./catchup.js";
import { ingestSourceMessage, serializeIngest } from "./ingest.js";

const { NewMessage, EditedMessage } = events;
const { StringSession } = sessions;

function asChatId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

export async function startListener({
  apiId,
  apiHash,
  session,
  sourceChatId,
  keywords: _keywords,
  store,
  onKeep,
}) {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: Infinity,
    reconnectRetries: Infinity,
    autoReconnect: true,
  });

  await client.connect();
  const me = await client.getMe();
  console.log(`Listener (conta) conectado: ${me.username || me.firstName || me.id}`);

  try {
    await catchUpHistory({
      client,
      store,
      sourceChatId,
      onKeep,
      backfillStored: true,
    });
  } catch (err) {
    console.error("Catch-up falhou (sigo no ao vivo):", err.message || err);
  }

  const source = asChatId(sourceChatId);
  const eventOpts = source ? { chats: [source] } : {};
  const known = typeof store.knownPlates === "function" ? store.knownPlates() : new Set();

  const onSourceEvent = async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;
      await serializeIngest(async () => {
        await ingestSourceMessage(store, msg, {
          client,
          onKeep,
          known,
          downloadPhotos: true,
          source: "telegram-listener",
        });
        if (typeof store.setLastSourceMessageId === "function" && msg.id) {
          await store.setLastSourceMessageId(msg.id);
        }
      });
    } catch (err) {
      console.error("Listener:", err);
    }
  };

  client.addEventHandler(onSourceEvent, new NewMessage(eventOpts));
  client.addEventHandler(onSourceEvent, new EditedMessage(eventOpts));

  startCatchUpLoop({
    client,
    store,
    sourceChatId,
    onKeep,
  });

  return client;
}
