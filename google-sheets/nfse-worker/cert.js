import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = path.dirname(fileURLToPath(import.meta.url));

function caminhoCertificado() {
  const configured = process.env.NFSE_CERT_PATH?.trim() || "certs/gps-bahia.pfx";
  const absolutos = path.isAbsolute(configured)
    ? [configured]
    : [
        path.resolve(workerDir, configured),
        path.resolve(process.cwd(), configured),
        path.resolve(process.cwd(), "nfse-worker", configured),
        path.resolve(process.cwd(), "google-sheets", "nfse-worker", configured),
      ];
  return absolutos.find((item) => fs.existsSync(item)) || "";
}

export function certificadoConfigurado() {
  if (!process.env.NFSE_CERT_PASSWORD?.trim()) return false;
  if (process.env.NFSE_CERT_PFX_BASE64?.replace(/\s/g, "")) return true;
  return Boolean(caminhoCertificado());
}

export function materialCertificado() {
  const passphrase = process.env.NFSE_CERT_PASSWORD || "";
  if (!passphrase) throw new Error("Certificado A1 não configurado.");
  const b64 = process.env.NFSE_CERT_PFX_BASE64?.replace(/\s/g, "") || "";
  if (b64) return { pfx: Buffer.from(b64, "base64"), passphrase };
  const arquivo = caminhoCertificado();
  if (!arquivo) throw new Error("Certificado A1 não configurado.");
  return { pfx: fs.readFileSync(arquivo), passphrase };
}
