import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildNomeArquivo, linhaUnica, tributacaoNacional } from "../lib/nfse-nota.js";
import { salvarDanfses, salvarPdfDoXml } from "./danfse.js";
import { emitirNaSefin, montarDpsXml } from "./dps.js";
import { aliquotaSimples, applySimplesAliquota, signDpsXml } from "./sign-dps.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_LOGIN_URL = "https://certificado.nfse.gov.br/EmissorNacional/Certificado";
const PESSOAS_URL = "https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatBrDate(iso) {
  const text = String(iso || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function moneyDigits(value) {
  const number = Number(value) || 0;
  return String(Math.round(number * 100));
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function xmlUmaLinha(xml) {
  return String(xml || "").replace(/>([^<]*)</g, (full, text) => (
    /[\r\n]/.test(text) ? `>${linhaUnica(text)}<` : full
  ));
}

function certFile() {
  const configured = process.env.NFSE_CERT_PATH?.trim() || "certs/gps-bahia.pfx";
  return path.resolve(__dirname, configured);
}

async function clickRadio(page, name, value) {
  const checked = await page.evaluate(({ name, value }) => {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!el) return "missing";
    el.disabled = false;
    el.closest("label")?.click();
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger("change");
    return el.checked ? "checked" : "not-checked";
  }, { name, value });
  if (checked !== "checked") {
    throw new Error(`Não consegui marcar ${name}=${value} no Emissor Nacional.`);
  }
}

async function setSelect(page, selector, value) {
  const result = await page.evaluate(({ selector, value }) => {
    const sel = document.querySelector(selector);
    if (!sel) return "missing";
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.jQuery) window.jQuery(sel).val(value).trigger("change").trigger("chosen:updated");
    return sel.value;
  }, { selector, value });
  if (result === "missing" || result !== value) {
    throw new Error(`Não consegui selecionar ${value} em ${selector}.`);
  }
}

async function waitIdle(page) {
  const loader = page.getByText("Por favor, aguarde", { exact: false });
  if (await loader.count()) {
    await loader.first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  }
}

async function pickSelect2(page, selectId, query, match) {
  const box = page.locator(`#${selectId}`).locator("xpath=following-sibling::span[contains(@class,'select2')]");
  await box.locator(".select2-selection").click();
  const input = page.locator(".select2-container--open .select2-search__field");
  await input.fill("");
  await input.pressSequentially(query, { delay: 40 });
  await page.waitForTimeout(1500);
  const items = page.locator(".select2-results__option");
  const texts = (await items.allInnerTexts())
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const usable = items.filter({ hasText: match });
  if (await usable.count()) {
    await usable.first().click();
  } else {
    throw new Error(
      `Não encontrei "${query}" no Emissor Nacional. Opções: ${texts.slice(0, 4).join(" | ") || "nenhuma"}`,
    );
  }
  await waitIdle(page);
}

async function pageErrors(page) {
  const text = await page.locator("body").innerText().catch(() => "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /campo obrigatório|preencha o formulário|não foi possível|inválid/i.test(line));
  return [...new Set(lines)].slice(0, 6).join(" ");
}

async function advance(page, urlPart) {
  await page.getByRole("button", { name: /Avançar/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await waitIdle(page);
  await page.waitForTimeout(800);
  if (!page.url().includes(urlPart)) {
    const detail = await pageErrors(page);
    throw new Error(detail || `O Emissor Nacional não avançou para ${urlPart}.`);
  }
}

async function login(page) {
  await page.goto(CERT_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForURL(/\/EmissorNacional\/(Dashboard|DPS|Notas)/, { timeout: 60000 });
  const body = await page.locator("body").innerText().catch(() => "");
  if (!/GPS BAHIA|10\.348\.519\/0001-19/i.test(body)) {
    throw new Error("Entrei no Emissor Nacional, mas não no CNPJ da GPS BAHIA.");
  }
}

async function fillPessoas(page, payload) {
  const tomador = payload.tomador || {};
  const dataFato = formatBrDate(payload.dataFato || new Date().toISOString().slice(0, 10));

  await page.goto(PESSOAS_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(600);

  await clickRadio(page, "PreencherInfoIBSCBS", "0");
  await page.evaluate((dataFato) => {
    const el = document.querySelector("#DataCompetencia");
    if (!el) return;
    el.disabled = false;
    el.value = dataFato;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger("change").trigger("blur");
  }, dataFato);
  await page.waitForFunction(
    () => /optante|simples|gps bahia/i.test(document.querySelector("#txtOpcaoSN")?.value || document.body.innerText),
    null,
    { timeout: 15000 },
  ).catch(() => {});

  await setSelect(page, "#SimplesNacional_RegimeApuracaoTributosSN", "1");
  await clickRadio(page, "EhCompraGovernamental", "0");
  await clickRadio(page, "Tomador.LocalDomicilio", "1");
  await page.waitForTimeout(500);

  const documento = onlyDigits(tomador.documento);
  if (!documento) throw new Error("Tomador sem CPF/CNPJ.");
  await page.locator("#Tomador_Inscricao").waitFor({ state: "visible", timeout: 10000 });
  await page.evaluate((documento) => {
    const el = document.querySelector("#Tomador_Inscricao");
    el.disabled = false;
    el.focus();
    el.value = documento;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (window.jQuery) window.jQuery(el).val(documento).trigger("input").trigger("change");
  }, documento);
  const documentoNaTela = await page.locator("#Tomador_Inscricao").inputValue();
  if (onlyDigits(documentoNaTela) !== documento) {
    throw new Error("O CNPJ do tomador não ficou no formulário.");
  }
  await page.locator("#btn_Tomador_Inscricao_pesquisar").click();
  await page.waitForFunction(
    () => (document.querySelector("#Tomador_Nome")?.value || "").trim().length > 3,
    null,
    { timeout: 12000 },
  ).catch(() => {});

  const nome = page.locator("#Tomador_Nome");
  if (!(await nome.inputValue().catch(() => "")) && tomador.razaoSocial) {
    await nome.fill(tomador.razaoSocial, { force: true });
  }
  if (!(await nome.inputValue().catch(() => ""))) {
    throw new Error("A consulta do CNPJ do tomador não trouxe a razão social.");
  }

  const cep = page.locator("#Tomador_EnderecoNacional_CEP");
  if (!(await cep.inputValue().catch(() => "")) && tomador.cep) {
    await page.evaluate(() => {
      const el = document.querySelector("#Tomador_InformarEndereco");
      if (el && !el.checked) {
        el.disabled = false;
        el.click();
      }
    });
    await cep.fill(onlyDigits(tomador.cep), { force: true });
    await page.locator("#btn_Tomador_EnderecoNacional_CEP").click({ force: true });
    await page.waitForTimeout(1500);
  }

  const numero = page.locator("#Tomador_EnderecoNacional_Numero");
  if (!(await numero.inputValue().catch(() => "")) && tomador.numero) {
    await numero.fill(String(tomador.numero), { force: true });
  }

  await clickRadio(page, "Intermediario.LocalDomicilio", "0");
  await advance(page, "/DPS/Servico");
}

async function fillServico(page, payload) {
  const config = payload.config || {};
  const cidade = config.municipioPrestacao || "Camaçari";
  const buscaCidade = fold(cidade).includes("camacari") ? "Camaçari" : cidade;
  await pickSelect2(page, "LocalPrestacao_CodigoMunicipioPrestacao", buscaCidade, /Camaçari\/BA|camacari/i);
  await page.waitForFunction(
    () => !document.querySelector("#ServicoPrestado_CodigoTributacaoNacional")?.disabled,
    null,
    { timeout: 15000 },
  );

  const servico = tributacaoNacional(payload.servico?.codigo || payload.tipo);
  if (!servico.codigo) throw new Error("Serviço sem código de tributação nacional.");
  const dotted = servico.codigo.replace(/(\d{2})(\d{2})(\d{2})/, "$1.$2.$3");
  await pickSelect2(
    page,
    "ServicoPrestado_CodigoTributacaoNacional",
    servico.codigo,
    new RegExp(`${dotted.replace(/\./g, "\\.")}|${servico.codigo}`, "i"),
  );
  await waitIdle(page);
  await page.waitForTimeout(800);

  const complemento = await page.evaluate(() => {
    const sel = document.querySelector("#ServicoPrestado_CodigoComplementarMunicipal");
    const obrigatorio = document.querySelector("#ServicoPrestado_CodigoComplementarMunicipalObrigatorio")?.value;
    const options = sel
      ? Array.from(sel.options).filter((option) => option.value).map((option) => ({
          value: option.value,
          text: option.textContent.trim(),
        }))
      : [];
    return { obrigatorio, options };
  });
  if (complemento.obrigatorio === "true" || complemento.options.length === 1) {
    const option = complemento.options[0];
    if (!option) throw new Error("Camaçari não devolveu o código complementar municipal.");
    await setSelect(page, "#ServicoPrestado_CodigoComplementarMunicipal", option.value);
  }

  const nbsAtual = await page.locator("#ServicoPrestado_CodigoNBS").inputValue().catch(() => "");
  if (!nbsAtual && servico.nbs) {
    await setSelect(page, "#ServicoPrestado_CodigoNBS", servico.nbs);
  }

  await clickRadio(page, "ServicoPrestado.HaExportacaoImunidadeNaoIncidencia", "0");

  const item = (payload.items || []).find((entry) => Number(entry.valorTotal) > 0) || payload.items?.[0] || {};
  const descricao = linhaUnica(item.descricao);
  if (!descricao) throw new Error("Descrição do serviço vazia.");
  await page.locator("#ServicoPrestado_Descricao").fill(descricao.slice(0, 2000));

  const bancos = (payload.items || []).find((entry) => Number(entry.valorTotal) === 0 && entry.descricao);
  const complementoTexto = linhaUnica(bancos?.descricao || config.dadosBancarios || "");
  if (complementoTexto) {
    await page.locator("#Complemento_InformacoesComplementares").fill(complementoTexto.slice(0, 2000));
  }

  await advance(page, "/DPS/Tributacao");
  return item;
}

async function fillValores(page, item, payload) {
  const valor = page.locator("#Valores_ValorServico");
  await valor.click({ force: true });
  await valor.fill("");
  const digits = moneyDigits(item.valorTotal ?? item.valorUnitario);
  if (!digits || digits === "0") throw new Error("Valor do serviço zerado.");
  await valor.pressSequentially(digits, { delay: 20 });
  await valor.dispatchEvent("change");
  await page.waitForTimeout(400);

  const retido = /^(1|sim|s|true)$/i.test(String(payload?.issRetido || payload?.config?.issRetido || ""));
  await clickRadio(page, "ISSQN.HaRetencao", retido ? "1" : "0");
  await clickRadio(page, "ISSQN.HaSuspensao", "0");
  await clickRadio(page, "ISSQN.HaBeneficioMunicipal", "0");
  await clickRadio(page, "ValorTributos.TipoValorTributos", "4");
  const aliquota = page.locator("#ValorTributos_AliquotaSN");
  await aliquota.click({ force: true });
  await aliquota.fill("");
  await aliquota.pressSequentially(moneyDigits(aliquotaSimples()), { delay: 20 });
  await aliquota.dispatchEvent("change");
  await advance(page, "/DPS/EmitirNFSe");
}

async function authorizeDraft(page) {
  const idr = new URL(page.url()).searchParams.get("idr");
  if (!idr) throw new Error("Rascunho sem identificador no Emissor Nacional.");
  const obtained = await page.evaluate(async (draftId) => {
    const res = await fetch(`${window.UrlBase}AssinaturaDPS/ObterXmlDPS?idr=${encodeURIComponent(draftId)}`, {
      headers: { Accept: "application/json" },
    });
    return res.json();
  }, idr);
  if (obtained.Status !== 1 || !obtained.ListOfInputData?.[0]) {
    throw new Error(obtained.Mensagem || "Não obtive o XML da DPS.");
  }
  const xml = applySimplesAliquota(xmlUmaLinha(Buffer.from(obtained.ListOfInputData[0], "base64").toString("utf8")));
  const posted = await page.evaluate(async ({ draftId, dpsXml }) => {
    const body = new URLSearchParams({ idr: draftId, dpsXml });
    const res = await fetch(`${window.UrlBase}AssinaturaDPS/ProcessarDPS`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { Status: 0, Mensagem: text.slice(0, 500) };
    }
  }, { draftId: idr, dpsXml: Buffer.from(signDpsXml(xml), "utf8").toString("base64") });
  if (posted.Status !== 1 || !posted.ChaveAcesso) {
    throw new Error(posted.Mensagem || "O Emissor Nacional não autorizou a NFS-e.");
  }
  const finish = new URL("https://www.nfse.gov.br/EmissorNacional/DPS/NFSe/FinalizarAssinaturaNFSe");
  finish.searchParams.set("chaveAcesso", posted.ChaveAcesso);
  finish.searchParams.set("idr", posted.IdRascunho || idr);
  await page.goto(finish.toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  return posted.ChaveAcesso;
}

export async function baixarPdfs(itens = []) {
  return salvarDanfses(itens);
}

export async function emitNfseOnPortal(payload = {}) {
  const certPath = certFile();
  const passphrase = process.env.NFSE_CERT_PASSWORD || "";
  if (!fs.existsSync(certPath) || !passphrase) {
    return {
      ok: false,
      error: "Certificado A1 não configurado. Confira NFSE_CERT_PATH e NFSE_CERT_PASSWORD no worker.",
    };
  }

  const arquivo = payload.arquivo || {};
  const dryRun = Boolean(payload.dryRun) || process.env.NFSE_DRY_RUN === "1";
  try {
    if (dryRun) {
      await montarDpsXml(payload, { nDps: 1, serie: 1 });
      return {
        ok: true,
        dryRun: true,
        numeroNf: "",
        nomeArquivo: buildNomeArquivo(arquivo),
        message: "DPS conferida para a API da Sefin. A NFS-e não foi emitida.",
      };
    }

    let emitida;
    try {
      emitida = await emitirNaSefin(payload);
    } catch (error) {
      if (!error.dpsUsada) throw error;
      emitida = await emitirNaSefin(payload);
    }
    const nomeArquivo = buildNomeArquivo({ ...arquivo, numero: emitida.numeroNf });
    const pdfPath = await salvarPdfDoXml(emitida.xml, nomeArquivo).catch(() => "");
    return {
      ok: true,
      numeroNf: emitida.numeroNf,
      nomeArquivo,
      chave: emitida.chave,
      pdfPath,
      message: pdfPath ? `Nota salva como ${nomeArquivo}.pdf` : "NFS-e autorizada na Sefin Nacional.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Falha na emissão na Sefin Nacional",
    };
  }
}
