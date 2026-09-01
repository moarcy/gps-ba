import { events, sessions, TelegramClient } from "teleproto";
import { classifyMotivo, matchKeywords } from "./filter.js";
import { parseAlerta } from "./parse-alerta.js";

const { NewMessage } = events;
const { StringSession } = sessions;

function asChatId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function messageText(msg) {
  return String(msg.message || msg.rawText || "").trim();
}

function mapsFromMessage(msg) {
  const entities = msg.entities || [];
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

export async function startListener({
  apiId,
  apiHash,
  session,
  sourceChatId,
  keywords,
  store,
  onKeep,
}) {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  const me = await client.getMe();
  console.log(`Listener (conta) conectado: ${me.username || me.firstName || me.id}`);

  const source = asChatId(sourceChatId);
  const eventOpts = source ? { chats: [source] } : {};

  client.addEventHandler(async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;
      const text = messageText(msg);
      if (!text) return;

      const hits = matchKeywords(text, keywords);
      if (!hits.length) return;

      const alerta = parseAlerta(text, { mapsUrl: mapsFromMessage(msg) });
      if (!alerta) return;

      const motivos = classifyMotivo(alerta, hits);
      const { sighting, duplicate } = await store.add(alerta, {
        motivos,
        hits,
        source: "telegram-listener",
        sourceChatId: String(msg.chatId || ""),
        messageId: msg.id,
      });
      if (duplicate) return;

      if (typeof onKeep === "function") {
        await onKeep(sighting, motivos);
      }
    } catch (err) {
      console.error("Listener:", err);
    }
  }, new NewMessage(eventOpts));

  return client;
}
