import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { google } from "googleapis";
import { getDriveClient } from "./excel-drive-client.js";
import { loadFotoIndex } from "./lib/bira-fotos.js";

dotenv.config();

const SA_EMAIL = "gps-ba-sheets@buffetmaster.iam.gserviceaccount.com";
const ROOT = process.env.BIRA_FOTOS_DIR || "C:\\Users\\moarc\\AppData\\Local\\Temp\\bira-all";
const CONCORRENCIA = 4;
const TOKEN = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim() || "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mensagem(error) {
  return error?.response?.data?.error?.message || error.message || "";
}

async function comRetry(fn) {
  let erro;
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (error) {
      erro = error;
      const status = Number(error?.response?.status || error?.code || 0);
      const msg = mensagem(error);
      if (/storage quota/i.test(msg)) throw error;
      if (status !== 429 && status !== 500 && status !== 503 && !/rate|timeout/i.test(msg)) throw error;
      await sleep(1000 * (i + 1));
    }
  }
  throw erro;
}

async function cliente() {
  if (!TOKEN) return getDriveClient();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: TOKEN });
  return google.drive({ version: "v3", auth });
}

async function listar(drive, folderId) {
  const nomes = new Map();
  let pageToken;
  do {
    const res = await comRetry(() =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    for (const file of res.data.files || []) nomes.set(file.name, file.id);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return nomes;
}

async function pool(items, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, () => worker()));
}

function gravarPastaNoEnv(folderId) {
  const envPath = path.join(process.cwd(), ".env");
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (/^BIRA_FOTOS_FOLDER_ID=/m.test(text)) {
    text = text.replace(/^BIRA_FOTOS_FOLDER_ID=.*$/m, `BIRA_FOTOS_FOLDER_ID=${folderId}`);
  } else {
    if (text && !text.endsWith("\n")) text += "\n";
    text += `BIRA_FOTOS_FOLDER_ID=${folderId}\n`;
  }
  fs.writeFileSync(envPath, text);
}

const drive = await cliente();
let folderId = TOKEN ? "" : process.env.BIRA_FOTOS_FOLDER_ID?.trim() || "";

if (TOKEN && !folderId) {
  const criada = await drive.files.create({
    requestBody: { name: "GPS BA fotos", mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
    supportsAllDrives: true,
  });
  folderId = criada.data.id;
  try {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "user", role: "reader", emailAddress: SA_EMAIL },
      sendNotificationEmail: false,
      supportsAllDrives: true,
    });
  } catch (error) {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "user", role: "reader", emailAddress: SA_EMAIL },
      sendNotificationEmail: true,
      supportsAllDrives: true,
    });
  }
  gravarPastaNoEnv(folderId);
  console.log("pasta criada no Drive da conta logada");
}

if (!folderId) {
  console.error("A conta da planilha nao tem espaco no Drive. Falta o acesso do Gmail dono da planilha.");
  process.exit(1);
}

const index = loadFotoIndex();
const porArquivo = new Map();
for (const [placa, hit] of index) {
  if (!porArquivo.has(hit.arquivo)) porArquivo.set(hit.arquivo, []);
  porArquivo.get(hit.arquivo).push(placa);
}

const existentes = await listar(drive, folderId);
const ids = new Map();
const pendentes = [];
for (const [arquivo, placas] of porArquivo) {
  const nome = `${placas[0]}.jpg`;
  if (existentes.has(nome)) {
    ids.set(arquivo, existentes.get(nome));
    continue;
  }
  const full = path.join(ROOT, arquivo);
  if (!fs.existsSync(full)) continue;
  pendentes.push({ arquivo, nome, full });
}

console.log("ja no drive", ids.size, "faltam", pendentes.length);
let feitos = 0;
await pool(pendentes, async (item) => {
  const criado = await comRetry(() =>
    drive.files.create({
      requestBody: { name: item.nome, parents: [folderId] },
      media: { mimeType: "image/jpeg", body: fs.createReadStream(item.full) },
      fields: "id",
      supportsAllDrives: true,
    }),
  );
  ids.set(item.arquivo, criado.data.id);
  feitos += 1;
  if (feitos % 25 === 0 || feitos === pendentes.length) console.log("enviadas", feitos, "/", pendentes.length);
});

const indice = {};
for (const [placa, hit] of index) {
  const id = ids.get(hit.arquivo);
  if (id) indice[placa] = id;
}
const json = JSON.stringify(indice);
if (existentes.has("index.json")) {
  await comRetry(() =>
    drive.files.update({
      fileId: existentes.get("index.json"),
      media: { mimeType: "application/json", body: json },
      supportsAllDrives: true,
    }),
  );
} else {
  await comRetry(() =>
    drive.files.create({
      requestBody: { name: "index.json", parents: [folderId] },
      media: { mimeType: "application/json", body: json },
      fields: "id",
      supportsAllDrives: true,
    }),
  );
}
console.log("indice", Object.keys(indice).length, "fotos");