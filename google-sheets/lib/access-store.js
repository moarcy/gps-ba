import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { CRM_ACESSOS_SHEET } from "./crm-constants.js";
import { descartarArquivo, downloadExcel, editarPlanilha } from "../excel-drive-client.js";
import { senhaMatches, signSession } from "./access-control.js";
import { ensureAccessUsers, ensureCrmSheets, readAcessos } from "./crm-sheets.js";

const seedPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "access-seed.json");

export function readSeedUsers() {
  if (!fs.existsSync(seedPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function gestorId() {
  const id = process.env.SPREADSHEET_ID_1?.trim();
  if (!id) throw Object.assign(new Error("SPREADSHEET_ID_1 não configurado."), { status: 500 });
  return id;
}

export async function listUsers() {
  const id = gestorId();
  const seed = readSeedUsers();
  const baixado = await downloadExcel(id, { versioned: true });
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(baixado.localPath);
    const ws = workbook.getWorksheet(CRM_ACESSOS_SHEET);
    const users = ws ? readAcessos(ws) : [];
    const missing = seed.some((item) => {
      const usuario = String(item?.usuario || "").trim().toLowerCase();
      return usuario && !users.some((user) => user.usuario === usuario);
    });
    if (ws && !missing) return users;
  } finally {
    descartarArquivo(baixado.localPath);
  }

  return editarPlanilha(id, (workbook) => {
    const sheets = ensureCrmSheets(workbook);
    ensureAccessUsers(sheets.acessos, seed);
    return readAcessos(sheets.acessos);
  });
}

export async function loginWithPassword(usuario, senha) {
  const users = await listUsers();
  const key = String(usuario || "").trim().toLowerCase();
  const found = users.find((user) => user.usuario === key);
  if (!found || !senhaMatches(found.senha, senha)) {
    throw Object.assign(new Error("Usuário ou senha inválidos."), { status: 401 });
  }
  if (found.papel === "localizador" && !found.localizador) {
    throw Object.assign(new Error("Acesso de localizador sem nome na planilha."), { status: 403 });
  }
  const user = {
    usuario: found.usuario,
    papel: found.papel,
    localizador: found.papel === "admin" ? "" : found.localizador,
  };
  return { token: signSession(user), user };
}
