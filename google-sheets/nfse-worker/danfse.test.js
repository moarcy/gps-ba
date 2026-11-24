import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseNfseXml, htmlDanfse } from "./danfse.js";

const xml = fs.readFileSync(new URL("./danfse.fixture.xml", import.meta.url));
const nota = parseNfseXml(xml);

test("lê a NFS-e oficial sem inventar ISS", () => {
  assert.equal(nota.numero, "1");
  assert.equal(nota.prestador.nome, "GPS BAHIA LTDA");
  assert.equal(nota.prestador.cnpj, "10.348.519/0001-19");
  assert.equal(nota.tomador.nome, "SCHULZE ADVOGADOS ASSOCIADOS");
  assert.equal(nota.tomador.local, "Joinville/SC");
  assert.equal(nota.totais.servico, "3.000,00");
  assert.equal(nota.totais.simples, "16.00");
  assert.equal(nota.iss.retencao, "1 - Não Retido");
  assert.equal(nota.iss.aliquota, "");
  assert.match(nota.servico.descricao, /THB1F10/);
});

test("o HTML é a DANFSe, não a página do site", async () => {
  const html = await htmlDanfse(xml);
  assert.match(html, /DANFSe v2\.0/);
  assert.match(html, /Documento Auxiliar da NFS-e/);
  assert.match(html, /2905 7012 2103 4851 9000 1190 0000 0000 0001 2611 1735 1528 71/);
  assert.doesNotMatch(html, /Imprimir|Sou humano|Identificação da NFS-e/);
});