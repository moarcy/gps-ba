import { evolutionFetch } from "./evolution-client.js";

function flatten(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.chats)) return raw.chats;
  return [];
}

async function listChats() {
  const attempts = [
    { path: "/chat/findChats/{instance}", method: "POST", body: {} },
    { path: "/chat/find/{instance}", method: "POST", body: {} },
    { path: "/chats/find/{instance}", method: "POST", body: {} },
    { path: "/chat/findChats/{instance}", method: "GET" },
  ];
  let lastErr = null;
  for (const attempt of attempts) {
    try {
      return await evolutionFetch(attempt.path, { method: attempt.method, body: attempt.body });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Não listou chats.");
}

function chatName(chat) {
  return chat.name || chat.pushName || chat.subject || chat.notify || "";
}

function chatJid(chat) {
  return chat.id || chat.remoteJid || chat.jid || chat.key?.remoteJid || "";
}

async function main() {
  const chats = flatten(await listChats());
  const hits = [];
  for (const chat of chats) {
    const name = chatName(chat);
    const jid = String(chatJid(chat));
    if (/locgram/i.test(name) || /locgram/i.test(jid)) {
      hits.push({ name, jid });
    }
  }

  if (!hits.length) {
    console.log("Nenhum chat com 'Locgram' no nome. Chats visíveis:", chats.length);
    for (const chat of chats.slice(0, 20)) {
      console.log("-", chatName(chat) || chatJid(chat) || JSON.stringify(chat).slice(0, 80));
    }
    return;
  }

  console.log("Cole no whatsapp-locgram/.env:");
  console.log("");
  for (const hit of hits) {
    console.log(`EVOLUTION_JID_LOCGRAM=${hit.jid}`);
    console.log(`  (${hit.name})`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
