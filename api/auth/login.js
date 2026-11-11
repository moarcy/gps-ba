import { loginWithPassword } from "../../google-sheets/lib/access-store.js";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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
    const session = await loginWithPassword(body.usuario || body.user, body.senha || body.password);
    res.status(200).json(session);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || "Erro interno" });
  }
}
