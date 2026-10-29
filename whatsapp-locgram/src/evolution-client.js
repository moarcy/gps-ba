import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.join(root, "..");
dotenv.config({ path: path.join(workerDir, "..", "google-sheets", ".env") });
dotenv.config({ path: path.join(workerDir, ".env") });

export function evolutionConfig() {
  const base = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8081").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY?.trim() || "";
  const instance = process.env.EVOLUTION_INSTANCE?.trim() || "";
  const webhookUrl =
    process.env.EVOLUTION_WEBHOOK_URL?.trim() ||
    `http://127.0.0.1:${process.env.LOCGRAM_WEBHOOK_PORT || 8790}/webhook`;
  return { base, key, instance, webhookUrl };
}

export async function evolutionFetch(pathname, { method = "GET", body } = {}) {
  const { base, key, instance } = evolutionConfig();
  if (!key || !instance) {
    throw new Error("Preencha EVOLUTION_API_KEY e EVOLUTION_INSTANCE no whatsapp-locgram/.env");
  }
  const url = `${base}${pathname.replace("{instance}", encodeURIComponent(instance))}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Evolution ${res.status} ${pathname}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
