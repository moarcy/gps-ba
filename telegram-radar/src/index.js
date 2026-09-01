import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notifyDest, createRadarBot } from "./bot.js";
import { parseKeywords } from "./filter.js";
import { startListener } from "./listener.js";
import { createStore } from "./store.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "..", ".env") });

const keywords = parseKeywords(process.env.RADAR_KEYWORDS);
const store = createStore(
  process.env.RADAR_DATA_FILE || path.join(root, "..", "data", "sightings.jsonl"),
);
await store.load();

const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const destFromEnv = process.env.TELEGRAM_DEST_CHAT_ID?.trim();

if (!botToken && !process.env.TELEGRAM_SESSION) {
  console.error("Configure TELEGRAM_BOT_TOKEN e/ou TELEGRAM_SESSION no .env");
  console.error("Leia o README em telegram-radar/README.md");
  process.exit(1);
}

const healthPort = Number(process.env.PORT || 8080);
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "telegram-radar" }));
  })
  .listen(healthPort, "0.0.0.0", () => {
    console.log(`Health → :${healthPort}`);
  });

console.log(`Filtro: ${keywords.join(" | ")}`);

let bot = null;
if (botToken) {
  bot = createRadarBot({ token: botToken, store, keywords });
  bot.start({
    onStart: (me) => console.log(`Bot @${me.username} no ar`),
  });
}

if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH) {
  await startListener({
    apiId: Number(process.env.TELEGRAM_API_ID),
    apiHash: process.env.TELEGRAM_API_HASH.trim(),
    session: process.env.TELEGRAM_SESSION.trim(),
    sourceChatId: process.env.TELEGRAM_SOURCE_CHAT_ID,
    keywords,
    store,
    onKeep: async (alerta, motivos) => {
      if (!bot) return;
      const dest = destFromEnv || store.getSettings().destChatId;
      if (!dest) {
        console.log(`Filtrado ${alerta.placa}, mas ninguém deu /start no bot ainda.`);
        return;
      }
      await notifyDest(bot, dest, alerta, motivos);
    },
  });
  console.log(
    process.env.TELEGRAM_SOURCE_CHAT_ID
      ? `Ouvindo grupo ${process.env.TELEGRAM_SOURCE_CHAT_ID}`
      : "Ouvindo todos os chats da conta (defina TELEGRAM_SOURCE_CHAT_ID para restringir)",
  );
} else {
  console.log("Sem TELEGRAM_SESSION: o bot só vê encaminhamentos e comandos.");
  console.log("Para filtrar o grupo da blacklist automaticamente, rode npm run login.");
}

function shutdown() {
  console.log("Encerrando…");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
