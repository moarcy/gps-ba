import { isConferencia, requireAdminOuConferencia } from "../google-sheets/lib/access-control.js";
import {
  getLocalizadosData,
  ingestLocgramHit,
  locsDaConferencia,
  scopeLocalizados,
  updatePosicao,
} from "../google-sheets/lib/localizados-service.js";

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
    const actor = requireAdminOuConferencia(req);
    const conferencia = isConferencia(actor);
    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const force = url.searchParams.get("refresh") === "1";
      const data = await getLocalizadosData({ force });
      res.status(200).json(conferencia ? scopeLocalizados(data, locsDaConferencia(actor.localizador)) : data);
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = readJsonBody(req);
      const action = body.action || body.op;
      if (action === "ingest" || action === "locgram") {
        if (conferencia) {
          res.status(403).json({ error: "Sem permissão." });
          return;
        }
        if (process.env.VERCEL) {
          res.status(403).json({
            error: "Coleta Locgram roda no notebook (Evolution), não na Vercel.",
          });
          return;
        }
        const result = await ingestLocgramHit(body);
        res.status(200).json(result);
        return;
      }
      const result = await updatePosicao({
        ...body,
        ...(conferencia ? { locs: locsDaConferencia(actor.localizador) } : {}),
      });
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
