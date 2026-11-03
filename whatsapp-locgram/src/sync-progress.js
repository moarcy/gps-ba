import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const listFile =
  process.argv[2] ||
  path.join(root, "..", "mensagens-assessorias-amanha.txt");

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function national(value) {
  let d = digits(value);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d;
}

function phoneKey(value) {
  const n = national(value);
  return n.length >= 10 ? n : "";
}

function parseOffices(text) {
  const offices = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^(\d{2})\.\s+(.+?)\s+\(\d+\)\s+(.+?)\s+B\d+\/S\d+\/O\d+\s*$/,
    );
    if (!match) continue;
    offices.push({
      n: match[1],
      name: match[2].trim(),
      phone: match[3].trim(),
      key: phoneKey(match[3]),
    });
  }
  return offices;
}

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "gpsba_evolution_postgres",
      "psql",
      "-U",
      "evolution",
      "-d",
      "evolution_db",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-F",
      "\t",
    ],
    { input: `SET search_path TO evolution_api;\n${sql}\n`, encoding: "utf8" },
  );
}

function rows(sql) {
  return psql(sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("SET"));
}

const offices = parseOffices(fs.readFileSync(listFile, "utf8"));
if (!offices.length) {
  console.error("Nenhum escritório lido em", listFile);
  process.exit(1);
}

const [msgCount] = rows('SELECT count(*) FROM "Message";');
const byType = rows(
  `SELECT split_part(key->>'remoteJid', '@', 2) || '=' || count(*)::text FROM "Message" GROUP BY split_part(key->>'remoteJid', '@', 2) ORDER BY count(*) DESC;`,
);
const [chatCount] = rows('SELECT count(*) FROM "Chat";');
const [range] = rows(
  `SELECT to_char(to_timestamp(min("messageTimestamp")), 'DD/MM/YYYY HH24:MI') || ' -> ' || to_char(to_timestamp(max("messageTimestamp")), 'DD/MM/YYYY HH24:MI') FROM "Message" WHERE "messageTimestamp" > 1000000000;`,
);

const contactKeys = new Map();
for (const line of rows(
  `SELECT "remoteJid", COALESCE("pushName", '') FROM "Contact" WHERE "remoteJid" LIKE '%@s.whatsapp.net';`,
)) {
  const [jid, pushName] = line.split("\t");
  const key = phoneKey(jid);
  if (!key) continue;
  if (!contactKeys.has(key)) contactKeys.set(key, []);
  contactKeys.get(key).push(pushName);
}

const messageCounts = new Map();
for (const line of rows(
  `SELECT split_part(key->>'remoteJid', '@', 1), count(*) FROM "Message" WHERE key->>'remoteJid' LIKE '%@s.whatsapp.net' GROUP BY 1;`,
)) {
  const [num, count] = line.split("\t");
  const key = phoneKey(num);
  if (!key) continue;
  messageCounts.set(key, (messageCounts.get(key) || 0) + Number(count));
}

let found = 0;
let withMessages = 0;
const missing = [];
const loaded = [];

for (const office of offices) {
  const names = contactKeys.get(office.key);
  const msgs = messageCounts.get(office.key) || 0;
  if (!names) {
    missing.push(office);
    continue;
  }
  found += 1;
  if (msgs > 0) {
    withMessages += 1;
    loaded.push({ ...office, msgs, who: names.filter(Boolean)[0] || "" });
  } else {
    missing.push({ ...office, contactOnly: true, who: names.filter(Boolean)[0] || "" });
  }
}

console.log("Carregamento Evolution — referência: mensagens-assessorias-amanha.txt");
console.log(`Mensagens gravadas: ${msgCount} (${byType.join(", ")})`);
console.log(`Conversas gravadas: ${chatCount}`);
console.log(`Período já no banco: ${range}`);
console.log("");
console.log(`Escritórios da lista: ${offices.length}`);
console.log(`Telefone já está na agenda: ${found}`);
console.log(`Esse telefone já tem mensagem gravada: ${withMessages}`);
console.log(`Ainda sem mensagem nesse telefone: ${offices.length - withMessages}`);
console.log("");

if (loaded.length) {
  console.log("Com mensagem:");
  for (const item of loaded.sort((a, b) => b.msgs - a.msgs)) {
    console.log(`  ${item.n}  ${item.name}  ${item.msgs} msgs  ${item.who}`);
  }
  console.log("");
}

const pending = missing.filter((item) => !item.contactOnly);
const contactOnly = missing.filter((item) => item.contactOnly);
if (contactOnly.length) {
  console.log("Contato achado, mensagem desse número ainda não:");
  for (const item of contactOnly) console.log(`  ${item.n}  ${item.name}  ${item.phone}`);
  console.log("");
}
if (pending.length) {
  console.log("Telefone da lista ainda não apareceu:");
  for (const item of pending) console.log(`  ${item.n}  ${item.name}  ${item.phone}`);
}
