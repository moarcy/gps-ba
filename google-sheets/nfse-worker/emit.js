import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGIN_URL =
  process.env.NFSE_PORTAL_URL ||
  "https://nfse2.camacari.ba.gov.br/prefeituras/login.do";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatDoc(tipo, digits) {
  const d = onlyDigits(digits);
  if ((tipo || "").toUpperCase() === "CPF" || d.length <= 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatCep(digits) {
  const d = onlyDigits(digits).padStart(8, "0").slice(0, 8);
  return d.replace(/(\d{5})(\d{3})/, "$1-$2");
}

function formatBrDate(iso) {
  const text = String(iso || "").slice(0, 10);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return text;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toFixed(2).replace(".", ",");
}

async function clickByText(page, texts, { exact = false } = {}) {
  for (const text of texts) {
    const loc = exact
      ? page.getByText(text, { exact: true })
      : page.getByText(text, { exact: false });
    if ((await loc.count()) > 0) {
      await loc.first().click({ timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function fillNearLabel(page, labels, value) {
  if (value == null || value === "") return false;
  for (const label of labels) {
    const byRole = page.getByLabel(label, { exact: false });
    if ((await byRole.count()) > 0) {
      await byRole.first().fill(String(value));
      return true;
    }

    const labelEl = page.locator(`text=${label}`).first();
    if ((await labelEl.count()) === 0) continue;

    const input = labelEl.locator(
      "xpath=ancestor::*[self::tr or self::div or self::td or self::label][1]//input[not(@type='hidden')] | following::input[not(@type='hidden')][1]",
    );
    if ((await input.count()) > 0) {
      await input.first().fill(String(value));
      return true;
    }
  }
  return false;
}

async function selectNearLabel(page, labels, optionText) {
  for (const label of labels) {
    const byRole = page.getByLabel(label, { exact: false });
    if ((await byRole.count()) > 0) {
      try {
        await byRole.first().selectOption({ label: optionText });
        return true;
      } catch {
        await byRole.first().selectOption({ value: optionText }).catch(() => {});
        return true;
      }
    }
  }
  return false;
}

async function checkRadioNearLabel(page, groupLabels, choiceTexts) {
  for (const choice of choiceTexts) {
    const radio = page.getByRole("radio", { name: new RegExp(choice, "i") });
    if ((await radio.count()) > 0) {
      await radio.first().check({ force: true });
      return true;
    }
    const clicked = await clickByText(page, [choice], { exact: true });
    if (clicked) return true;
  }

  for (const label of groupLabels) {
    const group = page.locator(`text=${label}`).first();
    if ((await group.count()) === 0) continue;
    for (const choice of choiceTexts) {
      const near = group.locator(
        `xpath=ancestor::*[self::tr or self::div][1]//*[contains(normalize-space(.), '${choice}')]`,
      );
      if ((await near.count()) > 0) {
        await near.first().click({ force: true });
        return true;
      }
    }
  }
  return false;
}

async function login(page, user, password) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);

  const userInput =
    page.locator('input[name*="usuario" i], input[name*="user" i], input[type="text"]').first();
  const passInput = page.locator('input[type="password"]').first();

  await userInput.fill(user);
  await passInput.fill(password);

  const entered =
    (await clickByText(page, ["Entrar"], { exact: true })) ||
    (await page.locator('input[type="submit"], button[type="submit"]').first().click().then(() => true).catch(() => false));

  if (!entered) throw new Error("Não encontrei o botão Entrar no portal.");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  if (page.url().includes("login.do")) {
    const alert = await page.locator("text=Alerta").first().textContent().catch(() => "");
    throw new Error(`Login falhou no portal.${alert ? ` ${alert}` : ""}`);
  }
}

async function goToEmitForm(page) {
  const candidates = [
    "Emitir Nota Fiscal",
    "Emitir NFS-e",
    "Emissão de NFS-e",
    "Nota Fiscal",
  ];
  for (const text of candidates) {
    if (await clickByText(page, [text])) {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);
      break;
    }
  }

  // Formulário costuma ter "Tomador de Serviços" / "Código do Serviço"
  const marker = page.locator("text=Tomador").or(page.locator("text=Código do Serviço"));
  await marker.first().waitFor({ timeout: 20000 }).catch(() => {});
}

async function fillTomador(page, tomador) {
  const tipo = (tomador.tipo || "CNPJ").toUpperCase();
  await checkRadioNearLabel(page, ["Tipo"], [tipo === "CPF" ? "CPF" : "CNPJ"]);

  await fillNearLabel(
    page,
    [tipo === "CPF" ? "CPF" : "CNPJ", "CNPJ:", "CPF:"],
    formatDoc(tipo, tomador.documento),
  );
  await fillNearLabel(page, ["Razão Social", "Nome/Razão"], tomador.razaoSocial);
  await fillNearLabel(page, ["Logradouro"], tomador.logradouro);
  await fillNearLabel(page, ["Número", "Nº", "Numero"], tomador.numero);
  await fillNearLabel(page, ["Complemento"], tomador.complemento);
  await fillNearLabel(page, ["Bairro"], tomador.bairro);
  await fillNearLabel(page, ["Município", "Municipio"], tomador.municipio);
  await selectNearLabel(page, ["Estado", "UF"], tomador.uf);
  await fillNearLabel(page, ["Estado", "UF"], tomador.uf);
  await fillNearLabel(page, ["CEP"], formatCep(tomador.cep));
  await fillNearLabel(page, ["País", "Pais"], tomador.pais || "BRASIL");
  await fillNearLabel(page, ["Telefone"], tomador.telefone);
  await fillNearLabel(page, ["e-Mail", "E-mail", "Email"], tomador.email);
}

async function fillServicoCabecalho(page, { servico, aliquota, dataFato, config }) {
  await fillNearLabel(page, ["Data fato gerador", "Data da prestação"], formatBrDate(dataFato));
  await fillNearLabel(page, ["Código do Serviço", "Codigo do Servico"], servico.codigo);
  await fillNearLabel(page, ["Subclasse CNAE", "CNAE"], servico.cnae);

  await checkRadioNearLabel(page, ["ISS a ser retido", "ISS"], ["Não", "Nao"]);
  await selectNearLabel(page, ["Exigibilidade"], config.exigibilidade || "Exigível");
  await fillNearLabel(page, ["Exigibilidade"], config.exigibilidade || "Exigível");
  await checkRadioNearLabel(page, ["Tributação", "Tributacao"], ["No município", "No municipio"]);

  if (aliquota != null) {
    await fillNearLabel(page, ["Alíquota", "Aliquota"], String(aliquota).replace(".", ","));
  }
}

async function addServiceItem(page, item) {
  await fillNearLabel(page, ["Descrição", "Descricao"], item.descricao);
  await fillNearLabel(
    page,
    ["Quantidade"],
    String(item.quantidade).replace(".", ","),
  );
  await fillNearLabel(
    page,
    ["Valor unitário", "Valor unitario"],
    formatMoney(item.valorUnitario),
  );

  const added = await clickByText(page, ["Adicionar"]);
  if (!added) {
    // Alguns formulários não exigem clique se for o primeiro item
    console.warn("Botão Adicionar não encontrado; seguindo.");
  }
  await page.waitForTimeout(600);
}

async function confirmAndCapture(page, { dryRun }) {
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      numeroNf: "",
      message: "dryRun: formulário preenchido, confirmação não enviada.",
    };
  }

  const confirmed =
    (await clickByText(page, ["Confirmar"])) ||
    (await clickByText(page, ["Emitir"]));

  if (!confirmed) throw new Error("Não encontrei o botão Confirmar.");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const numeroMatch =
    bodyText.match(/N[uú]mero(?:\s+da)?\s+Nota[:\s]+(\d+)/i) ||
    bodyText.match(/\bNF(?:S-e)?\s*[:\s#]*(\d{2,})\b/i) ||
    bodyText.match(/\b(\d{3,6})\b/);

  return {
    ok: true,
    numeroNf: numeroMatch?.[1] || "",
    message: "Emissão enviada no portal.",
  };
}

export async function emitNfseOnPortal(payload = {}) {
  const user = process.env.NFSE_PORTAL_USER?.trim();
  const password = process.env.NFSE_PORTAL_PASSWORD?.trim();
  if (!user || !password) {
    return {
      ok: false,
      error: "NFSE_PORTAL_USER / NFSE_PORTAL_PASSWORD não configurados no worker.",
    };
  }

  const headed = process.env.NFSE_HEADED === "1" || Boolean(payload.headed);
  const dryRun = Boolean(payload.dryRun) || process.env.NFSE_DRY_RUN === "1";
  const screenshotDir = path.join(__dirname, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? 80 : 0,
  });

  const context = await browser.newContext({
    locale: "pt-BR",
    viewport: { width: 1365, height: 900 },
  });
  const page = await context.newPage();

  try {
    await login(page, user, password);
    await goToEmitForm(page);

    if (payload.config?.ufPrestacao) {
      await selectNearLabel(page, ["UF"], payload.config.ufPrestacao);
      await fillNearLabel(page, ["UF"], payload.config.ufPrestacao);
    }
    if (payload.config?.municipioPrestacao) {
      await fillNearLabel(
        page,
        ["Municipio", "Município"],
        payload.config.municipioPrestacao,
      );
    }

    await fillTomador(page, payload.tomador || {});
    await fillServicoCabecalho(page, {
      servico: payload.servico || {},
      aliquota: payload.aliquota,
      dataFato: payload.dataFato,
      config: payload.config || {},
    });

    for (const item of payload.items || []) {
      await addServiceItem(page, item);
    }

    const result = await confirmAndCapture(page, { dryRun });

    const shot = path.join(screenshotDir, `${payload.id || Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    return {
      ...result,
      screenshot: shot,
    };
  } catch (error) {
    const shot = path.join(screenshotDir, `error-${payload.id || Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    return {
      ok: false,
      error: error.message || "Falha na automação do portal",
      screenshot: shot,
    };
  } finally {
    await browser.close();
  }
}
