import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { downloadExcel } from "./excel-drive-client.js";
import { cellValue, normalizePlaca, toExcelDate } from "./lib/excel-utils.js";

dotenv.config();
const localPath = await downloadExcel(process.env.SPREADSHEET_ID_1, { useCache: false });
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(localPath);
const ws = wb.getWorksheet("Planilha1");

console.log("rows", ws.rowCount, "autoFilter", JSON.stringify(ws.autoFilter));
console.log("A1 fmt", ws.getCell(1, 1).numFmt, "A2 fmt", ws.getCell(2, 1).numFmt);
console.log("L2", JSON.stringify(ws.getCell(2, 12).value));
console.log("M2", JSON.stringify(ws.getCell(2, 13).value));

function describe(cell) {
  const v = cell.value;
  if (v == null || v === "") return { kind: "empty" };
  if (v instanceof Date) return { kind: "Date", iso: v.toISOString(), fmt: cell.numFmt };
  if (typeof v === "number") return { kind: v >= 1012000 ? "ddmmaaaa" : "num", n: v, fmt: cell.numFmt };
  if (typeof v === "object" && v.formula) return { kind: "formula", formula: v.formula, result: v.result };
  if (typeof v === "object" && v.sharedFormula) return { kind: "shared", ref: v.sharedFormula, result: v.result };
  return { kind: typeof v, raw: String(v).slice(0, 60), fmt: cell.numFmt };
}

const missing = [];
const dateIssues = [];
let withPlaca = 0;
let withLM = 0;
let withoutLM = 0;

for (let r = 3; r <= Math.min(ws.rowCount, 250); r++) {
  const placa = normalizePlaca(cellValue(ws.getCell(r, 6)));
  if (!placa) continue;
  withPlaca += 1;
  const A = describe(ws.getCell(r, 1));
  const L = describe(ws.getCell(r, 12));
  const M = describe(ws.getCell(r, 13));
  const hasL = L.kind === "formula" || L.kind === "shared";
  const hasM = M.kind === "formula" || M.kind === "shared";
  if (hasL && hasM) withLM += 1;
  else {
    withoutLM += 1;
    if (missing.length < 25) {
      missing.push({
        r,
        placa,
        loc: cellValue(ws.getCell(r, 2)),
        A,
        L: L.kind,
        M: M.kind,
        G: cellValue(ws.getCell(r, 7)),
      });
    }
  }
  const fmt = String(ws.getCell(r, 1).numFmt || "");
  if (A.kind === "ddmmaaaa" || fmt.includes("1012000") || A.kind === "empty") {
    dateIssues.push({ r, placa, A, fmt });
  }
}

console.log("withPlaca", withPlaca, "withLM", withLM, "withoutLM", withoutLM);
console.log("MISSING FORMULA SAMPLE");
console.log(JSON.stringify(missing, null, 2));
console.log("DATE ISSUES", dateIssues.length);
console.log(JSON.stringify(dateIssues.slice(0, 20), null, 2));

console.log("\nFIRST 12 DATA ROWS");
for (let r = 3; r <= 14; r++) {
  const placa = normalizePlaca(cellValue(ws.getCell(r, 6)));
  console.log(
    "r" + r,
    "placa",
    placa || "-",
    "A",
    JSON.stringify(describe(ws.getCell(r, 1))),
    "L",
    describe(ws.getCell(r, 12)).kind,
    "M",
    describe(ws.getCell(r, 13)).kind,
  );
}
