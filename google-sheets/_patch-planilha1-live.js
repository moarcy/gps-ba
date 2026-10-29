import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { downloadExcel, uploadExcel } from "./excel-drive-client.js";
import { patchControleDatesAndFormulas } from "./lib/patch-controle-live.js";

dotenv.config();

const fileId = process.env.SPREADSHEET_ID_1?.trim();
if (!fileId) {
  throw new Error("SPREADSHEET_ID_1 não configurado.");
}

const localPath = await downloadExcel(fileId, { useCache: false });
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(localPath);

const worksheet = workbook.getWorksheet("Planilha1");
if (!worksheet) {
  throw new Error("Aba Planilha1 não encontrada.");
}

const report = patchControleDatesAndFormulas(worksheet);
workbook.calcProperties.fullCalcOnLoad = true;
await workbook.xlsx.writeFile(localPath);
await uploadExcel(fileId, localPath);

console.log(JSON.stringify(report, null, 2));
