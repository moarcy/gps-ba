import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { htmlDanfse, parseNfseXml } from "./danfse-html.js";
import { buscarXmlNfse } from "./sefin-xml.js";

export { htmlDanfse, parseNfseXml, buscarXmlNfse };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTAS_DIR = path.join(__dirname, "notas");

function nomeSeguro(nomeArquivo) {
  const bruto = String(nomeArquivo || "").trim();
  const nome = path.basename(bruto).replace(/\.pdf$/i, "").trim();
  if (!nome || nome !== bruto.replace(/\.pdf$/i, "").trim()) return "";
  if (nome === "." || nome === "..") return "";
  return nome;
}

async function pdfDoHtml(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "4mm", right: "4mm", bottom: "4mm", left: "4mm" },
    });
    if (Buffer.from(bytes).slice(0, 4).toString() !== "%PDF") throw new Error("O PDF da DANFSe não foi gerado.");
    return Buffer.from(bytes);
  } finally {
    await page.close();
  }
}

export async function pdfDeHtml(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    return await pdfDoHtml(browser, html);
  } finally {
    await browser.close();
  }
}

export async function salvarPdfDoXml(xml, nomeArquivo) {
  const nome = nomeSeguro(nomeArquivo);
  if (!nome || !xml) return "";
  fs.mkdirSync(NOTAS_DIR, { recursive: true });
  const pdf = await pdfDeHtml(await htmlDanfse(xml));
  const pdfPath = path.join(NOTAS_DIR, `${nome}.pdf`);
  fs.writeFileSync(pdfPath, pdf);
  fs.writeFileSync(path.join(NOTAS_DIR, `${nome}.xml`), xml);
  return pdfPath;
}

export async function salvarDanfses(itens = []) {
  const lista = itens.filter((item) => String(item?.chave || "").replace(/\D/g, "").length === 50 && nomeSeguro(item.nomeArquivo));
  if (!lista.length) return { ok: false, error: "Informe a chave e o nome do arquivo." };
  fs.mkdirSync(NOTAS_DIR, { recursive: true });
  try {
    const arquivos = [];
    for (const item of lista) {
      const nome = nomeSeguro(item.nomeArquivo);
      const xml = await buscarXmlNfse(item.chave);
      const pdf = await pdfDeHtml(await htmlDanfse(xml));
      const pdfPath = path.join(NOTAS_DIR, `${nome}.pdf`);
      fs.writeFileSync(pdfPath, pdf);
      fs.writeFileSync(path.join(NOTAS_DIR, `${nome}.xml`), xml);
      arquivos.push({ nomeArquivo: nome, pdfPath, chave: String(item.chave).replace(/\D/g, "") });
    }
    return {
      ok: true,
      arquivos,
      pdfPath: arquivos[0]?.pdfPath || "",
      nomeArquivo: arquivos[0]?.nomeArquivo || "",
    };
  } catch (error) {
    return { ok: false, error: error.message || "Falha ao gerar a DANFSe." };
  }
}
