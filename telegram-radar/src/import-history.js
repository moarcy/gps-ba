import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessions, TelegramClient } from "teleproto";
import { selectFeiraNetwork } from "./filter.js";
import { isBlacklistAlert, parseAlerta, splitAlerts } from "./parse-alerta.js";
import { createStore } from "./store.js";

const { StringSession } = sessions;
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "..", ".env") });
dotenv.config({ path: path.join(root, "..", "..", "google-sheets", ".env") });

function messageText(msg) {
  return String(msg.message || msg.rawText || msg.text || "").trim();
}

function mapsFromMessage(msg) {
  const entities = msg.entities || [];
  const text = messageText(msg);
  for (const ent of entities) {
    const url = ent.url || ent.href;
    if (url && /maps|goo\.gl/i.test(url)) return url;
    if (ent.offset != null) {
      const slice = text.slice(ent.offset, ent.offset + (ent.length || 0));
      if (/https?:\/\/\S*map/i.test(slice)) return slice;
    }
  }
  return "";
}

async function resolveChat(client, sourceChatId) {
  console.log("Resolvendo o chat na sessão…");
  const dialogs = await client.getDialogs({ limit: 200 });
  const found = dialogs.find((d) => String(d.id) === String(sourceChatId));
  if (found?.entity) return found.entity;
  return client.getEntity(/^-?\d+$/.test(String(sourceChatId)) ? Number(sourceChatId) : sourceChatId);
}

async function fetchHistory(client, chatId) {
  const messages = [];
  const seen = new Set();
  const limit = Number(process.env.RADAR_HISTORY_LIMIT || 15000);
  for await (const msg of client.iterMessages(chatId, { limit })) {
    if (!msg?.id || seen.has(msg.id)) continue;
    seen.add(msg.id);
    messages.push(msg);
    if (messages.length % 200 === 0) {
      console.log(`  lidas ${messages.length} mensagens…`);
    }
  }
  return messages;
}

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const session = process.env.TELEGRAM_SESSION?.trim();
const sourceChatId = process.env.TELEGRAM_SOURCE_CHAT_ID?.trim();

if (!apiId || !apiHash || !session || !sourceChatId) {
  console.error("Falta TELEGRAM_API_ID / HASH / SESSION / SOURCE_CHAT_ID no .env");
  process.exit(1);
}

const store = createStore(
  process.env.RADAR_DATA_FILE || path.join(root, "..", "data", "sightings.jsonl"),
);
await store.load();

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 5,
});
await client.connect();
console.log(`Lendo histórico do chat ${sourceChatId} (blacklist → rede Feira)…`);

const chat = await resolveChat(client, sourceChatId);
const messages = await fetchHistory(client, chat);
console.log(`Total no chat: ${messages.length}`);

const parsed = [];
for (const msg of messages) {
  const text = messageText(msg);
  if (!text || !isBlacklistAlert(text)) continue;
  const mapsUrl = mapsFromMessage(msg);
  const chunks = splitAlerts(text);
  const alertas = chunks.length ? chunks : [parseAlerta(text, { mapsUrl })].filter(Boolean);
  for (const alerta of alertas) {
    if (mapsUrl && !alerta.mapsUrl) alerta.mapsUrl = mapsUrl;
    parsed.push({
      ...alerta,
      source: "telegram-history",
      sourceChatId: String(sourceChatId),
      messageId: msg.id,
    });
  }
}

const network = selectFeiraNetwork(parsed);
console.log(`Blacklist parseados: ${parsed.length}`);
console.log(`Placas que passaram em Feira (e rotas ligadas): ${network.length} passagens`);

const result = await store.importMany(network);
console.log(`Novos gravados: ${result.added} · total no radar: ${result.total}`);

try {
  const { syncRadarToSheet } = await import("../../google-sheets/lib/radar-service.js");
  const sheet = await syncRadarToSheet(store.all());
  if (sheet?.ok) console.log(`Planilha: aba "${sheet.sheet}" com ${sheet.rows} linhas`);
} catch (err) {
  console.log(`Planilha não atualizada (${err.message}). Os dados ficam em data/sightings.jsonl`);
}

await client.disconnect();
