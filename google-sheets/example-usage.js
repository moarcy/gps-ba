import dotenv from "dotenv";
import { readSheet, resolveFileConfig } from "./excel-drive-client.js";

dotenv.config();

const { fileId } = resolveFileConfig("Planilha 1");
const data = await readSheet(fileId, { sheetIndex: 1 });

console.log(`Arquivo: ${data.meta.name}`);
console.log(`Aba: ${data.sheetName}`);
console.log(`Linhas: ${data.rows.length}`);
console.log("Primeiras 3 linhas:");
for (const row of data.rows.slice(0, 3)) {
  console.log(row.slice(0, 8).join(" | "));
}
