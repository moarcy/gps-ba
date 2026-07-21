import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  FILES_CONFIG,
  getFileMeta,
  listSheets,
  loadWorkbook,
  sheetToRows,
} from "./excel-drive-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

async function main() {
  console.log("=== Verificação Google Drive + Excel ===\n");

  const credsPath = path.join(__dirname, "credentials.json");
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
  console.log(`[OK] Conta de serviço: ${creds.client_email}\n`);

  let ok = true;

  for (const { label, idEnv } of FILES_CONFIG) {
    const fileId = process.env[idEnv]?.trim();
    if (!fileId) {
      console.log(`[SKIP] ${label}: ${idEnv} não definido`);
      continue;
    }

    try {
      const meta = await getFileMeta(fileId);
      const { workbook } = await loadWorkbook(fileId);
      const sheets = listSheets(workbook);

      console.log(`[OK] ${label}`);
      console.log(`     Arquivo: ${meta.name}`);
      console.log(`     Tipo: ${meta.mimeType}`);
      console.log(`     Abas (${sheets.length}):`);

      for (const sheet of sheets) {
        const ws = workbook.getWorksheet(sheet.name);
        const rows = sheetToRows(ws);
        const header = rows[0]?.slice(0, 5).join(" | ") || "(vazia)";
        console.log(
          `       - ${sheet.index}. ${sheet.name} (${rows.length} linhas)`,
        );
        console.log(`         Cabeçalho: ${header}`);
      }
      console.log("");
    } catch (error) {
      ok = false;
      console.error(`[ERRO] ${label}: ${error.message}\n`);
    }
  }

  if (ok) {
    console.log("Integração funcionando! Arquivos Excel acessíveis via Drive API.");
    process.exit(0);
  }

  process.exit(1);
}

main();
