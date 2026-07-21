import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

export function getAuth() {
  const credsFile = process.env.GOOGLE_CREDENTIALS_FILE || "credentials.json";
  const credsPath = path.join(__dirname, credsFile);

  if (!fs.existsSync(credsPath)) {
    throw new Error(`Credenciais não encontradas: ${credsPath}`);
  }

  return new google.auth.GoogleAuth({
    keyFile: credsPath,
    scopes: SCOPES,
  });
}

export async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

export async function getSpreadsheetMeta(spreadsheetId) {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  return data;
}

export function getWorksheetByGid(spreadsheet, gid) {
  const gidNum = Number(gid);
  const sheet = spreadsheet.sheets?.find((s) => s.properties?.sheetId === gidNum);
  if (!sheet?.properties?.title) {
    throw new Error(`Aba com gid=${gidNum} não encontrada`);
  }
  return sheet.properties;
}

export async function readAll(spreadsheetId, sheetName) {
  const sheets = await getSheetsClient();
  const range = sheetName ? `'${sheetName.replace(/'/g, "''")}'` : undefined;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range || "A:ZZ",
  });
  return data.values || [];
}

export async function writeCell(spreadsheetId, sheetName, cell, value) {
  const sheets = await getSheetsClient();
  const range = `'${sheetName.replace(/'/g, "''")}'!${cell}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export async function appendRows(spreadsheetId, sheetName, rows) {
  const sheets = await getSheetsClient();
  const range = `'${sheetName.replace(/'/g, "''")}'!A:ZZ`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

export const SHEETS_CONFIG = [
  { label: "Planilha 1", idEnv: "SPREADSHEET_ID_1", gidEnv: "SPREADSHEET_GID_1" },
  { label: "Planilha 2", idEnv: "SPREADSHEET_ID_2", gidEnv: "SPREADSHEET_GID_2" },
];
