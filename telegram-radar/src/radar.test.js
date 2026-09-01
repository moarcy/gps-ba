import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOverview,
  formatPlate,
  overview,
  plateStats,
} from "./analytics.js";
import { matchKeywords, shouldKeep } from "./filter.js";
import { parseAlerta, splitAlerts } from "./parse-alerta.js";

const PATOS = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: SKG3C28
📷 Câmera: ROTATÓRIA SENT PATOS DE MINAS/MG | ARAXÁ/MG 1
   ([FAIXA 1 -> ARAXÁ/MG | PATOS DE MINAS/MG])
🕐 Data/Hora: 01/09/2026 17:13:45
👤 Proprietário: PEDRO.AGILIZA
🏢 Escritório: BASE AGILIZA
🏦 Banco: MISTO
📍 Lat/Lon: -19.562410959898397, -46.9743830130092
🗺️ Abrir no Google Maps`;

const FEIRA = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: MLD3J57
📷 Câmera: FEIRA DE SANTANA/BA SENT JEQUIÉ/BA
   ([FAIXA 1 FEIRA DE SANTANA/BA -> JEQUIÉ/BA])
🕐 Data/Hora: 01/09/2026 17:21:55
👤 Proprietário: JOÃO
🏢 Escritório: GARCIA PEREZ PAIVA
🏦 Banco: BRADESCO
📍 Lat/Lon: -12.582865234134738, -39.52044451050488
🗺️ Abrir no Google Maps`;

const ENDRIGO = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: OUQ5J08
📷 Câmera: RIACHÃO/MA SENT BALSAS/MA
   ([FAIXA 1 RIACHÃO/MA -> BALSAS/MA])
🕐 Data/Hora: 01/09/2026 17:49:12
👤 Proprietário: ENDRIGO
🏢 Escritório: SCHULZE
📍 Lat/Lon: -7.369195, -46.626347
🗺️ Abrir no Google Maps`;

test("descarta alerta fora da carteira e da praça", () => {
  const alerta = parseAlerta(PATOS);
  assert.equal(alerta.placa, "SKG3C28");
  assert.equal(alerta.proprietario, "PEDRO.AGILIZA");
  assert.equal(shouldKeep(PATOS).keep, false);
});

test("mantém Feira de Santana mesmo com outro proprietário", () => {
  const alerta = parseAlerta(FEIRA);
  assert.equal(alerta.placa, "MLD3J57");
  assert.equal(alerta.camera.includes("FEIRA DE SANTANA"), true);
  assert.deepEqual(matchKeywords(FEIRA), ["FEIRA DE SANTANA"]);
  assert.equal(shouldKeep(FEIRA).keep, true);
});

test("mantém carteira Endrigo em qualquer câmera", () => {
  const alerta = parseAlerta(ENDRIGO);
  assert.equal(alerta.placa, "OUQ5J08");
  assert.equal(alerta.proprietario, "ENDRIGO");
  assert.deepEqual(matchKeywords(ENDRIGO), ["ENDRIGO"]);
  assert.equal(shouldKeep(ENDRIGO).keep, true);
});

test("separa lote de alertas e aplica o filtro", () => {
  const all = splitAlerts([PATOS, FEIRA, ENDRIGO].join("\n\n"));
  assert.equal(all.length, 3);
  const kept = all.filter((a) => shouldKeep(a.raw).keep);
  assert.deepEqual(
    kept.map((a) => a.placa),
    ["MLD3J57", "OUQ5J08"],
  );
});

test("analytics aponta janela e câmera da placa", () => {
  const feira = parseAlerta(FEIRA);
  const rows = [
    feira,
    parseAlerta(
      FEIRA.replace("17:21:55", "07:10:00").replace("01/09/2026", "02/09/2026"),
    ),
    parseAlerta(
      FEIRA.replace("17:21:55", "17:40:00").replace("01/09/2026", "08/09/2026"),
    ),
  ];
  const stats = plateStats(rows, "MLD3J57");
  assert.equal(stats.total, 3);
  assert.equal(stats.cameras[0].key.includes("FEIRA DE SANTANA"), true);
  const text = formatPlate(stats);
  assert.match(text, /MLD3J57/);
  assert.match(formatOverview(overview(rows)), /3 passagens/);
});
