import { requireAdmin } from "../google-sheets/lib/access-control.js";
import { getRadarData } from "../google-sheets/lib/radar-service.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET") {
      requireAdmin(req);
      const data = await getRadarData();
      res.status(200).json(data);
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || "Erro interno",
      code: error.code,
    });
  }
}
