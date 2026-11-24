import assert from "node:assert/strict";
import test from "node:test";
import { buildDescricaoNota, buildNomeArquivo, linhaUnica, motivoSubstituicao, tipoNota, tributacaoNacional } from "./nfse-nota.js";

test("uma nota usa a descrição colada, sem prefixo", () => {
  const texto = "ESTADIAS REFERENTE AO VEICULO - PLACA: PLB2379";
  assert.equal(buildDescricaoNota({ tipo: "estadias", texto, colada: true }), texto);
});

test("várias notas prefixam o serviço e acrescentam km ou diárias se vierem", () => {
  const texto = "VEICULO - PLACA: PLB2379";
  assert.equal(
    buildDescricaoNota({ tipo: "apreensao", texto }),
    "SERVIÇO DE BUSCA E APREENSÃO REFERENTE AO VEICULO - PLACA: PLB2379",
  );
  assert.equal(
    buildDescricaoNota({ tipo: "guincho", texto, km: "59,3" }),
    "SERVIÇO DE GUINCHO REFERENTE AO VEICULO - PLACA: PLB2379 - KM: 59,3",
  );
  assert.equal(
    buildDescricaoNota({ tipo: "estadias", texto, diarias: "" }),
    "SERVIÇO DE ESTADIAS REFERENTE AO VEICULO - PLACA: PLB2379",
  );
  assert.equal(
    buildDescricaoNota({ tipo: "estadias", texto, diarias: "10" }),
    "SERVIÇO DE ESTADIAS REFERENTE AO VEICULO - PLACA: PLB2379 - 10 DIÁRIAS",
  );
});

test("chaveiro usa o mesmo código da apreensão e a descrição em uma linha", () => {
  assert.equal(tipoNota("chaveiro").codigoNacional, "172201");
  assert.equal(tributacaoNacional("172201").tipo, "apreensao");
  assert.equal(
    buildDescricaoNota({
      tipo: "chaveiro",
      texto: "Apreensão realizada em 17/11/2026\nFinanciado: RAFAEL",
    }),
    "SERVIÇO DE CHAVEIRO REFERENTE AO Apreensão realizada em 17/11/2026 | Financiado: RAFAEL",
  );
  assert.equal(linhaUnica("linha 1\r\n\r\nlinha 2"), "linha 1 | linha 2");
});

test("nome do arquivo segue número, placa, financiado e assessoria", () => {
  assert.equal(
    buildNomeArquivo({
      numero: "786",
      placa: "plb2379",
      financiado: "Manoel de Lima Sacramento",
      assessoria: "JCS",
    }),
    "786 - PLB2379 - MANOEL DE LIMA SACRAMENTO - JCS",
  );
  assert.equal(tipoNota("guincho").codigo, "001414");
  assert.equal(tipoNota("estadias").codigo, "001104");
  assert.equal(tipoNota("apreensao").codigo, "001722");
  assert.equal(tributacaoNacional("001414").codigo, "141401");
  assert.equal(tributacaoNacional("001104").codigo, "110401");
  assert.equal(tributacaoNacional("001722").codigo, "172201");
  assert.equal(tributacaoNacional("141401").nbs, "106019000");
});

test("substituição de correção completa o motivo quando o texto é curto", () => {
  assert.deepEqual(motivoSubstituicao("99", "corrigir"), {
    codigo: "99",
    xMotivo: "Correção dos dados da nota.",
  });
  assert.deepEqual(motivoSubstituicao("05", "texto ignorado"), {
    codigo: "05",
    xMotivo: "",
  });
});
