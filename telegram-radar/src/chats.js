import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessions, TelegramClient } from "teleproto";

const { StringSession } = sessions;
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "..", ".env") });

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const session = process.env.TELEGRAM_SESSION?.trim();

if (!apiId || !apiHash || !session) {
  console.error("Rode npm run login primeiro.");
  process.exit(1);
}

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 5,
});
await client.connect();
const dialogs = await client.getDialogs({ limit: 80 });
console.log("Chats recentes:\n");
for (const d of dialogs) {
  const title = d.title || d.name || d.entity?.username || "";
  console.log(`${String(d.id).padStart(16)}  ${title}`);
}
await client.disconnect();
