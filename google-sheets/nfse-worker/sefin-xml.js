import https from "node:https";
import zlib from "node:zlib";
import { materialCertificado } from "./cert.js";

function soDigitos(value) {
  return String(value || "").replace(/\D/g, "");
}

function httpsGet(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("A Sefin Nacional não respondeu a tempo."));
    });
  });
}

export async function buscarXmlNfse(chave) {
  const acesso = soDigitos(chave);
  if (acesso.length !== 50) throw new Error("Chave de acesso inválida.");
  const { pfx, passphrase } = materialCertificado();
  const { status, body } = await httpsGet(`https://sefin.nfse.gov.br/SefinNacional/nfse/${acesso}`, {
    pfx,
    passphrase,
    headers: { Accept: "application/json" },
  });
  const text = body.toString("utf8");
  if (status !== 200) throw new Error(`A Sefin Nacional não entregou o XML (${status}).`);
  const json = JSON.parse(text);
  if (!json.nfseXmlGZipB64) throw new Error("A Sefin Nacional não devolveu o XML da NFS-e.");
  return zlib.gunzipSync(Buffer.from(json.nfseXmlGZipB64, "base64")).toString("utf8");
}
