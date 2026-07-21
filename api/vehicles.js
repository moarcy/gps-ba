import { addVehicleToGestor } from "../google-sheets/lib/add-vehicle.js";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = readJsonBody(req);
    const overwrite = Boolean(body.overwrite);
    const result = await addVehicleToGestor(body, { overwrite });
    res.status(overwrite && result.updated ? 200 : 201).json(result);
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || "Erro interno",
      code: error.code || undefined,
    });
  }
}
