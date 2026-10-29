import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  assinaturaValida,
  assinarCorpo,
  autorizacaoValida,
  handleIlocWebhook,
  parseIdsReservados,
  reservarIdNaLista,
} from "./iloc-webhook.js";

const TOKEN = "token-de-teste-com-32-caracteres";
const SEGREDO = "segredo-hmac-de-teste";

function mockReq(method, body, headers = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.headers = headers;
  return req;
}

function mockRes() {
  return {
    statusCode: 0,
    headersSent: false,
    body: "",
    writeHead(code) {
      this.statusCode = code;
      this.headersSent = true;
    },
    end(payload = "") {
      this.body = payload;
    },
  };
}

test("reserva de id ignora repetido e guarda os mais recentes", () => {
  assert.deepEqual(parseIdsReservados(""), { ids: [], usavel: true });
  assert.deepEqual(parseIdsReservados('["evt_1"]'), { ids: ["evt_1"], usavel: true });
  assert.equal(parseIdsReservados("nota livre").usavel, false);

  const primeira = reservarIdNaLista([], "evt_1", 2);
  assert.equal(primeira.duplicado, false);
  assert.equal(reservarIdNaLista(primeira.lista, "evt_1", 2).duplicado, true);
  const cheia = reservarIdNaLista(reservarIdNaLista(primeira.lista, "evt_2", 2).lista, "evt_3", 2);
  assert.deepEqual(cheia.lista, ["evt_2", "evt_3"]);
});

test("bearer comparado por inteiro", () => {
  assert.equal(autorizacaoValida(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(autorizacaoValida(`Bearer ${TOKEN} `, TOKEN), false);
  assert.equal(autorizacaoValida("Bearer outro-token-bem-longo-32", TOKEN), false);
  assert.equal(autorizacaoValida(`Bearer ${TOKEN}`, ""), false);
});

test("hmac usa o corpo bruto e expira o t", () => {
  const corpo = '{"tipo":"webhook.ping","id":"evt_1"}';
  const t = "1700000000";
  const header = `t=${t}, v1=${assinarCorpo(SEGREDO, corpo, t)}`;
  const agora = 1700000000 * 1000;
  assert.equal(assinaturaValida(header, corpo, SEGREDO, 300, agora), true);
  assert.equal(assinaturaValida(header, `${corpo} `, SEGREDO, 300, agora), false);
  assert.equal(
    assinaturaValida(header, JSON.stringify(JSON.parse(corpo)), SEGREDO, 300, agora),
    true,
  );
  const reformatado = '{ "tipo": "webhook.ping", "id": "evt_1" }';
  assert.equal(assinaturaValida(header, reformatado, SEGREDO, 300, agora), false);
  assert.equal(assinaturaValida(header, corpo, SEGREDO, 300, agora + 301_000), false);
  assert.equal(assinaturaValida(header, corpo, "", 300, agora), false);
});

test("post autenticado grava uma vez e ignora repetido", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iloc-"));
  const anterior = {
    ILOC_WEBHOOK_TOKEN: process.env.ILOC_WEBHOOK_TOKEN,
    ILOC_WEBHOOK_SEGREDO: process.env.ILOC_WEBHOOK_SEGREDO,
    ILOC_EVENTS_PATH: process.env.ILOC_EVENTS_PATH,
    ILOC_SEEN_PATH: process.env.ILOC_SEEN_PATH,
    ILOC_LOG_SPREADSHEET_ID: process.env.ILOC_LOG_SPREADSHEET_ID,
    ILOC_LOG_FOLDER_ID: process.env.ILOC_LOG_FOLDER_ID,
    VERCEL: process.env.VERCEL,
  };
  process.env.ILOC_WEBHOOK_TOKEN = TOKEN;
  process.env.ILOC_WEBHOOK_SEGREDO = SEGREDO;
  process.env.ILOC_EVENTS_PATH = path.join(dir, "events.jsonl");
  process.env.ILOC_SEEN_PATH = path.join(dir, "events.seen");
  delete process.env.ILOC_LOG_SPREADSHEET_ID;
  delete process.env.ILOC_LOG_FOLDER_ID;
  delete process.env.VERCEL;

  const aplicadorAnterior = globalThis.__ilocAplicarEvento;
  globalThis.__ilocAplicarEvento = async () => ({ ok: true });
  try {
    const corpo = JSON.stringify({
      id: "evt_ping_1",
      tipo: "webhook.ping",
      versao: 1,
      ocorridoEm: "2026-10-20T14:03:11.000Z",
      dados: { mensagem: "teste" },
    });
    const t = String(Math.floor(Date.now() / 1000));
    const headers = {
      authorization: `Bearer ${TOKEN}`,
      "x-iloc-assinatura": `t=${t},v1=${assinarCorpo(SEGREDO, corpo, t)}`,
      "x-iloc-evento": "webhook.ping",
      "x-iloc-entrega": "ent_1",
    };

    const negado = mockRes();
    await handleIlocWebhook(mockReq("POST", corpo, { ...headers, authorization: "Bearer nao" }), negado);
    assert.equal(negado.statusCode, 401);
    assert.equal(fs.existsSync(process.env.ILOC_EVENTS_PATH), false);

    const ok = mockRes();
    await handleIlocWebhook(mockReq("POST", corpo, headers), ok);
    assert.equal(ok.statusCode, 204);

    const deNovo = mockRes();
    await handleIlocWebhook(mockReq("POST", corpo, headers), deNovo);
    assert.equal(deNovo.statusCode, 204);
    const linhas = fs.readFileSync(process.env.ILOC_EVENTS_PATH, "utf8").trim().split(/\n/);
    assert.equal(linhas.length, 1);
    const gravado = JSON.parse(linhas[0]);
    assert.equal(gravado.id, "evt_ping_1");
    assert.equal(gravado.entrega, "ent_1");
    assert.equal(gravado.caso, null);

    const caso = JSON.stringify({
      id: "evt_status_1",
      tipo: "caso.status_alterado",
      versao: 1,
      ocorridoEm: "2026-10-20T14:03:11.000Z",
      instancia: "langchain",
      caso: { id: "clx", caseId: "case_ABC1D23_0008", placa: "ABC1D23" },
      ator: { tipo: "painel" },
      dados: { statusAnterior: "aguardando_endereco", statusNovo: "aguardando_comarca" },
    });
    const t2 = String(Math.floor(Date.now() / 1000));
    const resCaso = mockRes();
    await handleIlocWebhook(
      mockReq("POST", caso, {
        authorization: `Bearer ${TOKEN}`,
        "x-iloc-assinatura": `t=${t2},v1=${assinarCorpo(SEGREDO, caso, t2)}`,
        "x-iloc-entrega": "ent_2",
      }),
      resCaso,
    );
    assert.equal(resCaso.statusCode, 204);
    const todas = fs.readFileSync(process.env.ILOC_EVENTS_PATH, "utf8").trim().split(/\n/);
    assert.equal(todas.length, 2);
    assert.equal(JSON.parse(todas[1]).caso.placa, "ABC1D23");

    const saude = mockRes();
    await handleIlocWebhook(mockReq("GET", "", {}), saude);
    assert.equal(saude.statusCode, 200);
    assert.equal(JSON.parse(saude.body).pronto, true);
  } finally {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    if (aplicadorAnterior) globalThis.__ilocAplicarEvento = aplicadorAnterior;
    else delete globalThis.__ilocAplicarEvento;
  }
});
