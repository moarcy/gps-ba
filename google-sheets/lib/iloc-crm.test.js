import assert from "node:assert/strict";
import test from "node:test";
import {
  assessoriaDe,
  dataBrasil,
  fichaDoEvento,
  localizadorResponsavel,
  textoCampo,
} from "./iloc-crm.js";

test("escritório objeto vira o nome da assessoria", () => {
  assert.equal(assessoriaDe({ nome: "Paschoalotto" }), "PASCHOALOTTO");
  assert.equal(assessoriaDe({ razaoSocial: "Bellinati Perez" }), "BELLINATI PEREZ");
  assert.equal(assessoriaDe("Schulze"), "SCHULZE");
  assert.equal(assessoriaDe({ id: "x" }), "");
});

test("localizador fica com o assistente e descarta o Endrigo", () => {
  assert.equal(localizadorResponsavel("Endrigo e Carlos Antonio"), "CARLOS");
  assert.equal(
    localizadorResponsavel([
      { nome: "Endrigo", papel: "dono" },
      { nome: "Maciel Oliveira", papel: "assistente" },
    ]),
    "MACIEL",
  );
  assert.equal(localizadorResponsavel({ assistente: "Jubiraci Moraes", dono: "Endrigo" }), "BIRA");
  assert.equal(localizadorResponsavel("Endrigo"), "");
  assert.equal(localizadorResponsavel({ nome: "[object Object]" }), "");
});

test("texto de objeto não vira [object Object]", () => {
  assert.equal(textoCampo({ nome: "HB20" }), "HB20");
  assert.equal(textoCampo({ id: 1 }), "");
});

test("data do caso usa o dia na Bahia", () => {
  assert.equal(dataBrasil("2026-10-29T02:30:00.000Z"), "2026-10-28");
  assert.equal(dataBrasil("2026-10-29"), "2026-10-29");
});

test("ficha do caso criado traz placa, assessoria, data e loc", () => {
  const ficha = fichaDoEvento({
    tipo: "caso.criado",
    ocorridoEm: "2026-10-29T15:00:00.000Z",
    caso: { placa: "abc1d23", caseId: "case_ABC1D23_0001" },
    dados: {
      criadoEm: "2026-10-29T15:00:00.000Z",
      escritorio: { nome: "JCS Advogados" },
      localizador: "Endrigo / Matheus Souza",
      status: "solicitacao recebida",
      veiculo: "FIAT MOBI",
    },
  });
  assert.deepEqual(ficha, {
    placa: "ABC1D23",
    assessoria: "JCS",
    localizador: "MATHEUS",
    data: "2026-10-29",
  });
});

test("atualização lê o retrato novo e ignora status", () => {
  const ficha = fichaDoEvento({
    tipo: "caso.atualizado",
    dados: {
      campos: ["localizador"],
      antes: { localizador: "Endrigo" },
      depois: {
        escritorio: { fantasia: "Gomes" },
        localizador: [{ nome: "Endrigo" }, { nome: "Lucas" }],
        criadoEm: "2026-10-28T18:00:00.000Z",
      },
    },
    caso: { placa: "nrr2c11" },
  });
  assert.equal(ficha.placa, "NRR2C11");
  assert.equal(ficha.assessoria, "GOMES");
  assert.equal(ficha.localizador, "LUCAS");
  assert.equal(ficha.data, "2026-10-28");
});
