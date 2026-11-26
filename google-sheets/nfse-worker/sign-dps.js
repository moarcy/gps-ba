import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { materialCertificado } from "./cert.js";

function certBody(cert) {
  return forge.pki.certificateToPem(cert).replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
}

function loadPfx() {
  const { pfx, passphrase } = materialCertificado();
  const der = pfx.toString("binary");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, passphrase);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ]?.[0];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map((bag) => bag.cert)
    .filter(Boolean);
  const leaf = certs.find((cert) => /GPS BAHIA/i.test(cert.subject.getField("CN")?.value || ""));
  if (!keyBag?.key || !leaf) throw new Error("Certificado A1 da GPS BAHIA não encontrado.");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(leaf),
    certDer: certBody(leaf),
  };
}

export function signXmlElement(xml, tagName) {
  const id = xml.match(new RegExp(`<${tagName}\\b[^>]*\\bId="([^"]+)"`))?.[1];
  if (!id) throw new Error(`XML sem Id em ${tagName}.`);
  const keys = loadPfx();
  const sig = new SignedXml({
    privateKey: keys.privateKeyPem,
    publicCert: keys.certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    getKeyInfoContent: () => `<X509Data><X509Certificate>${keys.certDer}</X509Certificate></X509Data>`,
  });
  sig.addReference({
    xpath: `//*[@Id='${id}']`,
    uri: `#${id}`,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
  });
  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${tagName}']`, action: "after" },
  });
  return sig.getSignedXml();
}

export function signDpsXml(xml) {
  return signXmlElement(xml, "infDPS");
}

export function aliquotaSimples() {
  const raw = String(process.env.NFSE_ALIQUOTA_SN || "16").replace(",", ".");
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) return "16.00";
  return number.toFixed(2);
}

export function applySimplesAliquota(xml, aliquota = aliquotaSimples()) {
  if (!/<indTotTrib>/.test(xml)) return xml;
  return xml.replace(/<totTrib>[\s\S]*?<\/totTrib>/, `<totTrib><pTotTribSN>${aliquota}</pTotTribSN></totTrib>`);
}
