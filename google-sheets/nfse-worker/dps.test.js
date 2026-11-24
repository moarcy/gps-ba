import test from "node:test";
import assert from "node:assert/strict";
import { identDps, xmlSubstituicao } from "./dps.js";

test("o identificador da DPS separa a série do portal da série da API", () => {
  const portal = identDps({ cMun: "2905701", cnpj: "10348519000119", serie: 70000, nDps: 17 });
  assert.equal(portal.corpo, "290570121034851900011970000000000000000017");
  const api = identDps({ cMun: "2905701", cnpj: "10348519000119", serie: 1, nDps: 1 });
  assert.equal(api.corpo.slice(22, 27), "00001");
  assert.equal(api.corpo.length, 42);
});

test("a substituição leva a chave da nota original e o motivo de correção", () => {
  const chave = "2".repeat(50);
  assert.equal(
    xmlSubstituicao({ chave, motivo: "99", texto: "Placa e valor corrigidos." }),
    `<subst><chSubstda>${chave}</chSubstda><cMotivo>99</cMotivo><xMotivo>Placa e valor corrigidos.</xMotivo></subst>`,
  );
});

test("motivo oficial de substituição não leva texto livre", () => {
  const xml = xmlSubstituicao({ chave: "1".repeat(50), motivo: "05", texto: "não entra" });
  assert.equal(xml, `<subst><chSubstda>${"1".repeat(50)}</chSubstda><cMotivo>05</cMotivo></subst>`);
});

test("chave curta não gera substituição", () => {
  assert.throws(() => xmlSubstituicao({ chave: "123", motivo: "99" }), /chave de acesso/);
});