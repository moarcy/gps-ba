import { emitNfse, getNfseData, upsertTomador } from "../google-sheets/lib/nfse-service.js";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET") {
      const data = await getNfseData();
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const action = body.action || body.op || "emit";

      if (action === "upsert_tomador" || action === "tomador") {
        const result = await upsertTomador(body.tomador || body);
        res.status(200).json(result);
        return;
      }

      if (action === "emit" || action === "emitir") {
        const result = await emitNfse(body);
        res.status(200).json(result);
        return;
      }

      res.status(400).json({
        error: "action inválida. Use: emit | upsert_tomador",
      });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || "Erro interno",
      code: error.code || undefined,
      details: error.details || undefined,
    });
  }
}
