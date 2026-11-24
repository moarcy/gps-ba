import { isConferencia, requireAdminOuConferencia } from "../../google-sheets/lib/access-control.js";
import { lerFoto } from "../../google-sheets/lib/bira-fotos.js";
import { normalizePlaca } from "../../google-sheets/lib/excel-utils.js";
import {
  getLocalizadosData,
  locsDaConferencia,
  scopeLocalizados,
} from "../../google-sheets/lib/localizados-service.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const actor = requireAdminOuConferencia(req);
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const placa = normalizePlaca(url.searchParams.get("placa"));
    if (isConferencia(actor)) {
      const lista = scopeLocalizados(await getLocalizadosData(), locsDaConferencia(actor.localizador));
      const placaOk = lista.dias.some((dia) => dia.items.some((it) => it.placa === placa));
      if (!placaOk) {
        res.status(404).json({ error: "Sem foto desta placa." });
        return;
      }
    }
    const body = await lerFoto(placa);
    if (!body) {
      res.status(404).json({ error: "Sem foto desta placa." });
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", body.length);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.status(200).end(body);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Erro interno" });
  }
}
