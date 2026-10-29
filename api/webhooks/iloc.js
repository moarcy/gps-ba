import { waitUntil } from "@vercel/functions";
import { executarIloc } from "../../google-sheets/lib/iloc-webhook.js";

function headersDe(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function http(result) {
  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

export async function GET() {
  return http(await executarIloc({ method: "GET" }));
}

export async function POST(request) {
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    return http(await executarIloc({
      method: "POST",
      headers: headersDe(request),
      raw,
      continuar: waitUntil,
    }));
  } catch (error) {
    console.error("iloc", error?.message || error);
    return new Response(null, { status: 500 });
  }
}
