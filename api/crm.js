import { actorFromRequest } from "../google-sheets/lib/access-control.js";
import { dispatchCrmAction, getCrmData, previewWhatsapp } from "../google-sheets/lib/crm-service.js";

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const actor = actorFromRequest(req);

    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.searchParams.get("preview") === "1") {
        if (actor.papel !== "admin") {
          res.status(403).json({ error: "Sem permissão." });
          return;
        }
        res.status(200).json(previewWhatsapp(url.searchParams.get("text") || ""));
        return;
      }
      res.status(200).json(await getCrmData(actor));
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const { status, data } = await dispatchCrmAction(readJsonBody(req), actor);
      res.status(status).json(data);
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
