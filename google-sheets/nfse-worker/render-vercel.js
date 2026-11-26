import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export async function pdfDeHtml(html) {
  if ("setGraphicsMode" in chromium) chromium.setGraphicsMode = false;
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "4mm", right: "4mm", bottom: "4mm", left: "4mm" },
    });
    const pdf = Buffer.from(bytes);
    if (pdf.slice(0, 4).toString() !== "%PDF") throw new Error("O PDF da DANFSe não foi gerado.");
    return pdf;
  } finally {
    await browser.close();
  }
}
