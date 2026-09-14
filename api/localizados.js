import { getLocalizadosData, updatePosicao } from "../google-sheets/lib/localizados-service.js";

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
      const force = url.searchParams.get("refresh") === "1";
      const data = await getLocalizadosData({ force });
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = readJsonBody(req);
      const result = await updatePosicao(body);
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error.message || "Erro interno",
      code: error.code,
    });
  }
}
