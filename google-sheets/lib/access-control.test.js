import assert from "node:assert/strict";
import test from "node:test";
import {
  locatorTimeline,
  publicLocalizadorCar,
  scrubLocatorMessage,
  readSession,
  scopeCrmForLocalizador,
  senhaMatches,
  signSession,
} from "./access-control.js";

const payload = {
  meta: {
    generatedAt: "2026-11-11T00:00:00.000Z",
    statusLabels: {
      nova: "Nova",
      no_patio: "No pátio",
      aguardando_pagamento: "Aguardando pagamento",
    },
    statuses: ["nova", "no_patio", "aguardando_pagamento"],
    pagamentoCategorias: { apreensao: "Apreensão" },
  },
  filters: { localizadores: ["MACIEL", "BIRA"], assessorias: ["ALFA"] },
  pipeline: [
    {
      placa: "ABC1D23",
      localizador: "MACIEL",
      assessoria: "ALFA",
      telefone: "77999999999",
      origem: "BANCO PAN",
      status: "aguardando_pagamento",
      valorDiaria: 80,
      diarias: 4,
      rawWhatsapp: "Assessoria ALFA 77999999999",
      observacoes: "pagar pix",
      veiculo: "GOL",
      patio: "Ponto a Ponto",
      rastreado: true,
      localizado: false,
      processo: "8009673-91.2023.8.05.0022",
    },
    {
      placa: "BBB1B23",
      localizador: "BIRA",
      assessoria: "BETA",
      telefone: "71988888888",
      status: "nova",
      valorDiaria: 100,
    },
  ],
  timeline: [
    { id: "1", placa: "ABC1D23", tipo: "pagamento", mensagem: "PIX 80", dataHora: "2026-11-01T10:00:00.000Z" },
    { id: "2", placa: "ABC1D23", tipo: "whatsapp", mensagem: "Assessoria ALFA", dataHora: "2026-11-01T11:00:00.000Z" },
    { id: "3", placa: "ABC1D23", tipo: "status", mensagem: "Status: Nova → Aguardando pagamento", dataHora: "2026-11-02T10:00:00.000Z" },
    { id: "4", placa: "ABC1D23", tipo: "endereco", mensagem: 'END 1 alterado: "Rua A" → "Rua B"', dataHora: "2026-11-03T10:00:00.000Z" },
    { id: "5", placa: "ABC1D23", tipo: "nota", mensagem: "Contato com assessoria registrado", dataHora: "2026-11-04T10:00:00.000Z" },
    { id: "6", placa: "BBB1B23", tipo: "endereco", mensagem: "END 1 adicionado: Rua do Bira", dataHora: "2026-11-05T10:00:00.000Z" },
    { id: "7", placa: "ABC1D23", tipo: "status", mensagem: "Ocorrência criada — status Nova ocorrência", dataHora: "2026-11-01T09:00:00.000Z" },
  ],
  pagamentos: [{ id: "p1", placa: "ABC1D23", valor: 80, assessoria: "ALFA" }],
  pendingPayments: [{ id: "p1" }],
  pendingByPlaca: { ABC1D23: [{ valor: 80 }] },
  followUps: [{ placa: "ABC1D23", assessoria: "ALFA" }],
  patio: [{ placa: "ABC1D23", diarias: 4, valorDiaria: 80 }],
  enderecos: [
    { id: "e1", placa: "ABC1D23", ordem: 1, texto: "Rua B", atualizadoEm: "2026-11-03", atualizadoPor: "maciel" },
    { id: "e2", placa: "BBB1B23", ordem: 1, texto: "Rua do Bira", atualizadoEm: "2026-11-05", atualizadoPor: "bira" },
  ],
};

test("localizador não recebe pagamento, assessoria, telefone nem carro de outro", () => {
  const scoped = scopeCrmForLocalizador(payload, { papel: "localizador", localizador: "MACIEL" });
  const raw = JSON.stringify(scoped);
  assert.equal(scoped.pipeline.length, 1);
  assert.equal(scoped.pipeline[0].placa, "ABC1D23");
  assert.equal(scoped.pipeline[0].status, "apreendido");
  assert.equal(scoped.pipeline[0].veiculo, "GOL");
  assert.equal(scoped.pipeline[0].rastreado, true);
  assert.equal(scoped.pipeline[0].localizado, false);
  assert.equal(scoped.pipeline[0].processo, "8009673-91.2023.8.05.0022");
  assert.equal("assessoria" in scoped.pipeline[0], false);
  assert.equal("telefone" in scoped.pipeline[0], false);
  assert.equal("valorDiaria" in scoped.pipeline[0], false);
  assert.equal("rawWhatsapp" in scoped.pipeline[0], false);
  assert.equal("pagamentos" in scoped, false);
  assert.equal("pendingPayments" in scoped, false);
  assert.equal("pendingByPlaca" in scoped, false);
  assert.equal("assessorias" in (scoped.filters || {}), false);
  assert.equal(scoped.meta.statusLabels.aguardando_pagamento, undefined);
  assert.equal(scoped.enderecos.length, 1);
  assert.equal(scoped.enderecos[0].texto, "Rua B");
  assert.equal(raw.includes("assessoria"), false);
  assert.equal(raw.includes("pagamento"), false);
  assert.equal(raw.includes("ALFA"), false);
  assert.equal(raw.includes("BETA"), false);
  assert.equal(raw.includes("77999999999"), false);
  assert.equal(raw.includes("BANCO"), false);
  assert.equal(raw.includes("Rua do Bira"), false);
  assert.equal(raw.includes("Aguardando pagamento"), false);
});

test("histórico do localizador tira o nome da assessoria e guarda o fato", () => {
  const timeline = locatorTimeline(
    [
      {
        id: "a",
        placa: "ABC1D23",
        tipo: "nota",
        mensagem: "10/11 Paschoalotto: devolvido.",
        dataHora: "2026-11-10T13:54:00.000Z",
      },
      {
        id: "b",
        placa: "ABC1D23",
        tipo: "nota",
        mensagem:
          "10/11 Cindy (C6): mandado negativado em Barreiras. 11/11: Paulo saiu do C6 e podem pedir outro.",
        dataHora: "2026-11-10T13:20:00.000Z",
      },
      {
        id: "c",
        placa: "ABC1D23",
        tipo: "status",
        mensagem: "Localizador: ENDRIGO → MACIEL",
        dataHora: "2026-11-11T17:33:00.000Z",
      },
      {
        id: "d",
        placa: "ABC1D23",
        tipo: "endereco",
        mensagem: "END 1 adicionado: Rua Tim Maia, 99, São Paulo, Barreiras-BA",
        dataHora: "2026-11-10T13:20:00.000Z",
      },
    ],
    new Set(["ABC1D23"]),
  );
  const byId = Object.fromEntries(timeline.map((item) => [item.id, item.mensagem]));
  assert.equal(byId.a, "10/11 devolvido.");
  assert.match(byId.b, /mandado negativado em Barreiras/);
  assert.match(byId.b, /11\/11 podem pedir outro/);
  assert.equal(/paschoalotto|cindy|c6|paulo/i.test(byId.b), false);
  assert.equal(byId.c, undefined);
  assert.match(byId.d, /São Paulo/);
  assert.equal(scrubLocatorMessage("Schulze: ainda não saiu o mandado."), "ainda não saiu o mandado.");
});

test("histórico do localizador guarda endereço e esconde pagamento e assessoria", () => {
  const placas = new Set(["ABC1D23"]);
  const timeline = locatorTimeline(payload.timeline, placas);
  assert.deepEqual(
    timeline.map((item) => item.id),
    ["4", "7"],
  );
});

test("carro público não copia campo interno", () => {
  const car = publicLocalizadorCar(payload.pipeline[0]);
  assert.equal(car.status, "apreendido");
  assert.equal(Object.hasOwn(car, "assessoria"), false);
  assert.equal(Object.hasOwn(car, "telefone"), false);
});

test("sessão assinada não aceita troca de papel", () => {
  const token = signSession({ usuario: "maciel", papel: "localizador", localizador: "MACIEL" });
  const actor = readSession(token);
  assert.equal(actor.papel, "localizador");
  assert.equal(actor.localizador, "MACIEL");
  const [body] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ usuario: "maciel", papel: "admin", localizador: "", exp: Date.now() + 10000 }),
  ).toString("base64url");
  assert.equal(readSession(`${forged}.${token.split(".")[1]}`), null);
  assert.equal(readSession(`${body}.assinatura-invalida`), null);
  assert.ok(body);
});

test("descrição do veículo perde carteira e banco", () => {
  const car = publicLocalizadorCar({
    placa: "SAI5G95",
    localizador: "MACIEL",
    status: "nova",
    veiculo: "CARTEIRA ITAU VEICULO: TIGGO 8 PRO",
    cor: "[object Object]",
  });
  assert.equal(car.veiculo, "TIGGO 8 PRO");
  assert.equal(car.cor, "");
  assert.equal(JSON.stringify(car).toLowerCase().includes("itau"), false);
  const comarca = publicLocalizadorCar({
    placa: "OUS4C82",
    status: "aguardando_mandado",
    origem: "BARREIRAS",
  });
  assert.equal(comarca.origem, "BARREIRAS");
  const banco = publicLocalizadorCar({
    placa: "ABC1D23",
    status: "nova",
    origem: "BANCO PAN",
  });
  assert.equal(JSON.stringify(banco).toLowerCase().includes("banco"), false);
});

test("senha numérica da planilha aceita o zero à esquerda", () => {
  assert.equal(senhaMatches("00123456789", "00123456789"), true);
  assert.equal(senhaMatches("123456789", "00123456789"), true);
  assert.equal(senhaMatches("00123456789", "000"), false);
});
