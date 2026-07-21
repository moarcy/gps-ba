import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const SCOPES = ["https://www.googleapis.com/auth/drive"];

/** Em Vercel/Lambda só /tmp é gravável. */
function getCacheDir() {
  if (process.env.GPS_BA_CACHE_DIR) return process.env.GPS_BA_CACHE_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "gps-ba-cache");
  }
  return path.join(__dirname, ".cache");
}

export const FILES_CONFIG = [
  {
    label: "Planilha 1",
    idEnv: "SPREADSHEET_ID_1",
    gidEnv: "SPREADSHEET_GID_1",
  },
  {
    label: "Planilha 2",
    idEnv: "SPREADSHEET_ID_2",
    gidEnv: "SPREADSHEET_GID_2",
  },
];

function getCredentialsPath() {
  return path.join(__dirname, process.env.GOOGLE_CREDENTIALS_FILE || "credentials.json");
}

export function getAuth() {
  const jsonInline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonInline) {
    const credentials = JSON.parse(jsonInline);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
  }

  const credsPath = getCredentialsPath();
  if (!fs.existsSync(credsPath)) {
    throw new Error(
      `Credenciais não encontradas. Use credentials.json ou GOOGLE_SERVICE_ACCOUNT_JSON.`,
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: credsPath,
    scopes: SCOPES,
  });
}

export async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

export async function getFileMeta(fileId) {
  const drive = await getDriveClient();
  const { data } = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,modifiedTime",
  });
  return data;
}

function cachePath(fileId) {
  const dir = getCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${fileId}.xlsx`);
}

export async function downloadExcel(fileId, { useCache = false } = {}) {
  const localPath = cachePath(fileId);

  if (useCache && fs.existsSync(localPath)) {
    return localPath;
  }

  const drive = await getDriveClient();
  const dest = fs.createWriteStream(localPath);

  await new Promise((resolve, reject) => {
    drive.files
      .get({ fileId, alt: "media" }, { responseType: "stream" })
      .then(({ data }) => {
        data.on("end", resolve);
        data.on("error", reject);
        data.pipe(dest);
      })
      .catch(reject);
  });

  return localPath;
}

export async function loadWorkbook(fileId, options) {
  const localPath = await downloadExcel(fileId, options);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(localPath);
  return { workbook, localPath };
}

export function listSheets(workbook) {
  return workbook.worksheets.map((ws, index) => ({
    index: index + 1,
    name: ws.name,
    id: ws.id,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
  }));
}

export function getWorksheet(workbook, { sheetName, sheetIndex } = {}) {
  if (sheetName) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) throw new Error(`Aba '${sheetName}' não encontrada`);
    return ws;
  }

  const index = sheetIndex ?? 1;
  const ws = workbook.getWorksheet(index);
  if (!ws) throw new Error(`Aba índice ${index} não encontrada`);
  return ws;
}

export function sheetToRows(worksheet) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(
      row.values
        ? row.values.slice(1).map((cell) => {
            if (cell == null) return "";
            if (typeof cell === "object" && cell.text != null) return cell.text;
            if (cell instanceof Date) return cell.toISOString();
            return cell;
          })
        : [],
    );
  });
  return rows;
}

export async function readSheet(fileId, sheetSelector = {}) {
  const { workbook } = await loadWorkbook(fileId);
  const worksheet = getWorksheet(workbook, sheetSelector);
  return {
    meta: await getFileMeta(fileId),
    sheets: listSheets(workbook),
    sheetName: worksheet.name,
    rows: sheetToRows(worksheet),
  };
}

export async function uploadExcel(fileId, localPath) {
  const drive = await getDriveClient();
  const meta = await getFileMeta(fileId);

  await drive.files.update({
    fileId,
    media: {
      mimeType: meta.mimeType,
      body: fs.createReadStream(localPath),
    },
  });

  return meta;
}

export async function writeCell(fileId, sheetSelector, cellRef, value) {
  const { workbook, localPath } = await loadWorkbook(fileId);
  const worksheet = getWorksheet(workbook, sheetSelector);
  worksheet.getCell(cellRef).value = value;
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(fileId, localPath);
}

export async function appendRow(fileId, sheetSelector, values) {
  const { workbook, localPath } = await loadWorkbook(fileId);
  const worksheet = getWorksheet(workbook, sheetSelector);
  worksheet.addRow(values);
  await workbook.xlsx.writeFile(localPath);
  await uploadExcel(fileId, localPath);
}

export function resolveFileConfig(labelOrEnvKey) {
  const found = FILES_CONFIG.find(
    (item) =>
      item.label === labelOrEnvKey ||
      item.idEnv === labelOrEnvKey ||
      item.idEnv.replace("SPREADSHEET_ID_", "planilha") === labelOrEnvKey,
  );

  if (!found) {
    throw new Error(`Configuração não encontrada para: ${labelOrEnvKey}`);
  }

  const fileId = process.env[found.idEnv]?.trim();
  if (!fileId) {
    throw new Error(`${found.idEnv} não definido no .env`);
  }

  return { ...found, fileId };
}
