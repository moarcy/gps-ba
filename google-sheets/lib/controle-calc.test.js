import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  DATE_FMT,
  controleImpostoFormula,
  controleSaldoFormula,
} from "./excel-utils.js";
import { healControleSheet, healControleFile, dateFormatUsesMinutes } from "./patch-controle-live.js";

function sheetWithBrokenTop() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha1");
  ws.getCell("A1").value = "CONTROLE";
  ws.getCell("A2").value = "Data";
  ws.getCell("L2").value = "Imposto";
  ws.getCell("M2").value = "Saldo";
  ws.getCell("F2").value = "PLACA";
  ws.getCell("G2").value = "Prêmio";

  const rows = [
    ["2026-10-20", "PLL1D47", 1750, "d/m/yyyy"],
    ["2026-10-29", "OCL4708", null, "dd/mm/yyyy"],
    ["2026-09-23", "POM9F91", 1250, "dd/MM/yyyy"],
  ];
  rows.forEach((item, index) => {
    const row = 3 + index;
    ws.getCell(row, 1).value = new Date(item[0]);
    ws.getCell(row, 1).numFmt = item[3];
    ws.getCell(row, 6).value = item[1];
    if (item[2] != null) ws.getCell(row, 7).value = item[2];
  });
  ws.getCell("L5").value = { formula: 'IF(G5="","",G5*13%)', result: 162.5 };
  ws.getCell("M5").value = { formula: "IF(COUNTA(G5,I5,J5,K5)=0,\"\",N(G5)-N(L5))", result: 1087.5 };
  return ws;
}

test("formato com m minúsculo é minuto", () => {
  assert.equal(dateFormatUsesMinutes("d/m/yyyy"), true);
  assert.equal(dateFormatUsesMinutes("dd/mm/yyyy"), true);
  assert.equal(dateFormatUsesMinutes("dd/MM/yyyy"), false);
  assert.equal(dateFormatUsesMinutes("General"), false);
});

test("heal corrige datas e ancora Imposto/Saldo sem apagar a placa", async () => {
  const ws = sheetWithBrokenTop();
  const report = healControleSheet(ws);

  assert.equal(ws.getCell("F3").value, "PLL1D47");
  assert.equal(ws.getCell("F4").value, "OCL4708");
  assert.equal(ws.getCell("G3").value, 1750);
  assert.equal(ws.getCell("A3").numFmt, DATE_FMT);
  assert.equal(ws.getCell("A4").numFmt, DATE_FMT);
  assert.equal(ws.getCell("A5").numFmt, DATE_FMT);
  assert.equal(ws.getCell("L2").value, "Imposto");
  assert.equal(ws.getCell("M2").value, "Saldo");
  assert.equal(ws.getCell("L3").value.formula, controleImpostoFormula(3));
  assert.equal(ws.getCell("M3").value.formula, controleSaldoFormula(3));
  assert.equal(ws.getCell("L3").value.result, 227.5);
  assert.equal(ws.getCell("L4").value.formula, controleImpostoFormula(4));
  assert.equal(ws.getCell("L5").value.formula, controleImpostoFormula(5));
  assert.equal(report.formatsFixed, 2);
  assert.ok(report.formulasInstalled > 0);

  const again = healControleSheet(ws);
  assert.equal(again.formulasInstalled, 0);
  assert.equal(again.formatsFixed, 0);
});

test("o formato dd/MM/yyyy e a fórmula sobrevivem ao gravar o xlsx", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha1");
  ws.getCell("A2").value = "Data";
  ws.getCell("F3").value = "PLL1D47";
  ws.getCell("A3").value = new Date("2026-10-20");
  ws.getCell("A3").numFmt = "d/m/yyyy";
  healControleSheet(ws);

  const file = path.join(os.tmpdir(), `controle-calc-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(file);
  const again = await healControleFile(file);
  const read = new ExcelJS.Workbook();
  await read.xlsx.readFile(file);
  fs.unlinkSync(file);

  const sheet = read.getWorksheet("Planilha1");
  assert.equal(sheet.getCell("A3").numFmt, DATE_FMT);
  assert.equal(sheet.getCell("L2").value, "Imposto");
  assert.equal(sheet.getCell("L3").value.formula, controleImpostoFormula(3));
  assert.equal(sheet.getCell("F3").value, "PLL1D47");
  assert.equal(again.changed, false);
});
