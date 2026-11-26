import { requireAdmin } from "../../google-sheets/lib/access-control.js";
import { prepararPdf } from "../../google-sheets/lib/nfse-service.js";
import { pdfDeHtml } from "../../google-sheets/nfse-worker/render-vercel.js";

function nomeAscii(filename) {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
}

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
    requireAdmin(req);
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const prep = await prepararPdf(url.searchParams.get("id"));
    if (!prep) {
      res.status(404).json({ error: "PDF desta nota ainda não está no sistema." });
      return;
    }
    const body = prep.buffer || (await pdfDeHtml(prep.html));
    const filename = prep.filename || "nfse.pdf";
    const inline = url.searchParams.get("inline") === "1";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", body.length);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${nomeAscii(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("Cache-Control", inline ? "private, no-store" : "private, max-age=86400");
    res.status(200).end(body);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || "Erro interno" });
  }
}
