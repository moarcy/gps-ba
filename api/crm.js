import {
  addTimelineEvent,
  createOcorrencia,
  getCrmData,
  previewWhatsapp,
  sendToControle,
  updateOcorrencia,
  upsertPagamento,
} from "../google-sheets/lib/crm-service.js";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.searchParams.get("preview") === "1") {
        const raw = url.searchParams.get("text") || "";
        res.status(200).json(previewWhatsapp(raw));
        return;
      }
      const data = await getCrmData();
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = readJsonBody(req);
      const action = body.action || body.op;

      if (action === "preview") {
        res.status(200).json(previewWhatsapp(body.text || body.whatsapp || body.rawWhatsapp));
        return;
      }

      if (action === "create" || action === "create_ocorrencia") {
        const result = await createOcorrencia(body);
        res.status(201).json(result);
        return;
      }

      if (action === "update" || action === "update_ocorrencia") {
        const placa = body.placa;
        const { action: _a, op: _o, placa: _p, ...patch } = body;
        const result = await updateOcorrencia(placa, patch);
        res.status(200).json(result);
        return;
      }

      if (action === "timeline" || action === "add_timeline") {
        const result = await addTimelineEvent(body);
        res.status(201).json(result);
        return;
      }

      if (action === "pagamento" || action === "upsert_pagamento") {
        const result = await upsertPagamento(body);
        res.status(200).json(result);
        return;
      }

      if (action === "bridge" || action === "send_controle") {
        const result = await sendToControle(body);
        res.status(200).json(result);
        return;
      }

      res.status(400).json({
        error:
          "action inválida. Use: create | update | timeline | pagamento | bridge | preview",
      });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || "Erro interno",
      code: error.code || undefined,
    });
  }
}
