import dotenv from "dotenv";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { sessions, TelegramClient } from "teleproto";

const { StringSession } = sessions;
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "..", ".env") });

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();

if (!apiId || !apiHash) {
  console.error("Defina TELEGRAM_API_ID e TELEGRAM_API_HASH no .env");
  console.error("Obtenha em https://my.telegram.org → API development tools");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
const ask = (q) => rl.question(q);

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () =>
    process.env.TELEGRAM_PHONE || (await ask("Celular com DDI (ex 5511999998888): ")),
  password: async () =>
    process.env.TELEGRAM_2FA_PASSWORD || (await ask("Senha 2FA (Enter se não tiver): ")),
  phoneCode: async () => await ask("Código que o Telegram enviou: "),
  onError: (err) => console.error(err),
});

const session = client.session.save();
const me = await client.getMe();
rl.close();
console.log("");
console.log(`Logado como ${me.username || me.firstName} (${me.id})`);
console.log("");
console.log("Cole isto no .env:");
console.log(`TELEGRAM_SESSION=${session}`);
console.log("");
console.log("Para achar o ID do grupo da blacklist, rode: npm run chats");
await client.disconnect();
process.exit(0);
