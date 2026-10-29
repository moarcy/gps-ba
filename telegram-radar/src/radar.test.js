import test from "node:test";
import assert from "node:assert/strict";
import {
  formatOverview,
  formatPlate,
  interceptEta,
  overview,
  plateStats,
  priorityScore,
  squareClock,
} from "./analytics.js";
import { isFeiraOrigin, matchKeywords, selectFeiraNetwork, shouldKeep, decideTrack, classifyMotivo } from "./filter.js";
import { buildRadarPayload, classifyHop, collectTransitions } from "./geo.js";
import { shouldNotifyMissed } from "./ingest.js";
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

test("descarta Endrigo fora de Feira (sem equipe no trecho)", () => {
  const alerta = parseAlerta(ENDRIGO);
  assert.equal(alerta.placa, "OUQ5J08");
  assert.equal(alerta.proprietario, "ENDRIGO");
  assert.equal(shouldKeep(ENDRIGO).keep, false);
});

test("separa lote de alertas e aplica o filtro", () => {
  const all = splitAlerts([PATOS, FEIRA, ENDRIGO].join("\n\n"));
  assert.equal(all.length, 3);
  const kept = all.filter((a) => shouldKeep(a.raw).keep);
  assert.deepEqual(
    kept.map((a) => a.placa),
    ["MLD3J57"],
  );
});

test("extrai rota do sentido da faixa", () => {
  const alerta = parseAlerta(FEIRA);
  assert.equal(alerta.rota, "FEIRA DE SANTANA/BA → JEQUIÉ/BA");
});

test("analytics aponta janela, rota e como agir", () => {
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
  assert.match(text, /Como agir/);
  assert.match(text, /FEIRA DE SANTANA/);
  assert.match(formatOverview(overview(rows)), /3 passagens/);
});

const JEQUIE_TO_FEIRA = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: ABC1D23
📷 Câmera: JEQUIÉ/BA SENT FEIRA DE SANTANA/BA
   ([FAIXA 1 JEQUIÉ/BA -> FEIRA DE SANTANA/BA])
🕐 Data/Hora: 01/09/2026 18:10:00
📍 Lat/Lon: -13.8580, -40.0810
🗺️ Abrir no Google Maps`;

const JEQUIE = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: MLD3J57
📷 Câmera: JEQUIÉ/BA SENT VITÓRIA DA CONQUISTA/BA
   ([FAIXA 1 JEQUIÉ/BA -> VITÓRIA DA CONQUISTA/BA])
🕐 Data/Hora: 01/09/2026 19:05:00
👤 Proprietário: JOÃO
📍 Lat/Lon: -13.8580, -40.0810
🗺️ Abrir no Google Maps`;

test("Jequié sentido Feira avisa no Telegram (caminhão vindo para a praça)", () => {
  const alerta = parseAlerta(JEQUIE_TO_FEIRA);
  assert.equal(isFeiraOrigin(alerta), false);
  assert.equal(shouldKeep(JEQUIE_TO_FEIRA).keep, true);
  assert.deepEqual(decideTrack(alerta), { track: true, notify: true });
  assert.deepEqual(classifyMotivo(alerta), ["sentido Feira de Santana"]);
});

test("origem Feira continua GO", () => {
  const alerta = parseAlerta(FEIRA);
  assert.equal(isFeiraOrigin(alerta), true);
  assert.deepEqual(decideTrack(alerta), { track: true, notify: true });
  assert.deepEqual(classifyMotivo(alerta), ["GO Feira de Santana"]);
});

test("histórico guarda a rota da placa que passou em Feira e ignora o resto", () => {
  const alertas = [PATOS, FEIRA, JEQUIE, ENDRIGO].map((t) => parseAlerta(t));
  const network = selectFeiraNetwork(alertas);
  assert.deepEqual(
    network.map((a) => a.camera),
    ["FEIRA DE SANTANA/BA SENT JEQUIÉ/BA", "JEQUIÉ/BA SENT VITÓRIA DA CONQUISTA/BA"],
  );
});

test("mapa deriva o próximo ponto depois de Feira", () => {
  const payload = buildRadarPayload([parseAlerta(FEIRA), parseAlerta(JEQUIE)]);
  assert.equal(payload.meta.plates, 1);
  const hop = Object.values(payload.nextAfterFeira)[0];
  assert.equal(hop.to.includes("JEQUIÉ"), true);
  assert.ok(hop.minutes > 0);
});

test("GO atrasado só avisa se a passagem ainda é recente", () => {
  const alerta = parseAlerta(FEIRA);
  const now = Date.parse(alerta.iso);
  assert.equal(shouldNotifyMissed(alerta, { now, maxAgeHours: 4 }), true);
  assert.equal(
    shouldNotifyMissed(alerta, { now: now + 5 * 3600 * 1000, maxAgeHours: 4 }),
    false,
  );
});

const FEIRA_INBOUND = `🚨 Alerta — Placa-Alvo (BLACKLIST)

🔤 Placa: MLD3J57
📷 Câmera: JEQUIÉ/BA SENT FEIRA DE SANTANA/BA
   ([FAIXA 1 JEQUIÉ/BA -> FEIRA DE SANTANA/BA])
🕐 Data/Hora: 01/09/2026 17:22:10
📍 Lat/Lon: -12.582865234134738, -39.52044451050488
🗺️ Abrir no Google Maps`;

test("hop no mesmo GPS (pórtico invertido) é descartado", () => {
  const out = parseAlerta(FEIRA);
  const inbound = parseAlerta(FEIRA_INBOUND);
  assert.equal(classifyHop(out, inbound).keep, false);
  assert.equal(classifyHop(out, inbound).reason, "same-gps");
  const payload = buildRadarPayload([out, inbound]);
  assert.equal(Object.keys(payload.nextAfterFeira).length, 0);
  assert.ok(payload.quality.discardedHops.sameGps >= 1);
  assert.equal(payload.cameras.some((c) => c.porticoInvertido), true);
});

test("suavização do relógio não explode com n=1", () => {
  const clock = squareClock([parseAlerta(FEIRA)]);
  assert.equal(clock.n, 1);
  assert.equal(clock.hypothesis, true);
  assert.equal(clock.weekendSplit.ok, false);
  assert.ok(clock.window.p < 0.05);
  assert.equal(clock.window.rawP, 1);
  assert.ok(clock.window.lo < 0.5);
  assert.ok(clock.bestHour.p < 0.5);
});

test("fim de semana sem amostra não vira padrão de dia útil", () => {
  const rows = [];
  for (let i = 0; i < 16; i += 1) {
    const day = String(1 + Math.floor(i / 8)).padStart(2, "0");
    const hour = String(10 + (i % 8)).padStart(2, "0");
    rows.push(
      parseAlerta(FEIRA.replace("01/09/2026 17:21:55", `${day}/09/2026 ${hour}:00:00`)),
    );
  }
  const clock = squareClock(rows);
  assert.ok(clock.n >= 16);
  assert.equal(clock.weekendSplit.nWeekend, 0);
  assert.equal(clock.weekendSplit.ok, false);
  assert.match(clock.weekendSplit.reason, /fim de semana/);
});

test("cadeia A→B distante e com tempo útil entra com IQR e P < 1", () => {
  const { transitions, nextAfterFeira } = collectTransitions([
    parseAlerta(FEIRA),
    parseAlerta(JEQUIE),
  ]);
  const hop = Object.values(nextAfterFeira)[0];
  assert.ok(hop);
  assert.equal(hop.to.includes("JEQUIÉ"), true);
  assert.ok(hop.minutes >= 5);
  assert.ok(hop.p < 1);
  assert.ok(hop.pUnknown > 0);
  assert.equal(transitions[0].q25 != null, true);
});

test("ETA atrasado >4h não gera GO; ao vivo na praça gera", () => {
  const last = parseAlerta(FEIRA);
  const t = Date.parse(last.iso);
  const late = interceptEta(last, { now: t + 5 * 3600 * 1000, transitions: [] });
  assert.equal(late.go, false);
  assert.equal(late.kind, "go-atrasado");
  const live = interceptEta(last, { now: t + 8 * 60 * 1000, transitions: [] });
  assert.equal(live.go, true);
  assert.equal(live.kind, "go");
  assert.match(live.action, /praça|Feira/i);
});

test("score alto só com ping recente origem Feira + mandado; inapto cai", () => {
  const last = parseAlerta(FEIRA);
  const t = Date.parse(last.iso);
  const eta = interceptEta(last, { now: t + 5 * 60 * 1000, transitions: [] });
  const go = priorityScore({
    eta,
    feiraN: 3,
    inCorridor: true,
    crm: { temMandado: true, status: "com_mandado" },
  });
  const bad = priorityScore({
    eta,
    feiraN: 1,
    inCorridor: true,
    crm: { status: "inapto" },
  });
  assert.equal(go.band, "go");
  assert.ok(go.score >= 50);
  assert.ok(bad.score < go.score);
  assert.ok(bad.reasons.some((r) => /inapto/i.test(r)));
});
