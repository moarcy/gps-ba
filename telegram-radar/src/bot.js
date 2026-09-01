import { Bot, GrammyError, HttpError } from "grammy";
import {
  formatCameras,
  formatHeatmap,
  formatHot,
  formatOverview,
  formatPlate,
  hotNow,
  overview,
  plateStats,
} from "./analytics.js";
import { classifyMotivo, matchKeywords, parseKeywords } from "./filter.js";
import { formatAlertHtml } from "./format.js";
import { isBlacklistAlert, normalizePlaca, parseAlerta, splitAlerts } from "./parse-alerta.js";

function extractMapsUrl(ctx) {
  const entities = ctx.message?.entities || ctx.message?.caption_entities || [];
  const text = ctx.message?.text || ctx.message?.caption || "";
  for (const ent of entities) {
    if (ent.type === "text_link" && ent.url) return ent.url;
    if (ent.type === "url") return text.slice(ent.offset, ent.offset + ent.length);
  }
  return "";
}

function helpText(keywords) {
  return [
    `Radar de apreensão`,
    `Filtro: ${keywords.join("  |  ")}`,
    ``,
    `Eu só deixo passar alerta de blacklist com Endrigo (carteira) ou Feira de Santana (praça).`,
    ``,
    `/hoje — resumo e janelas`,
    `/quente — placas das últimas 2h`,
    `/placa ABC1D23 — padrão da placa`,
    `/horarios — mapa dia × hora`,
    `/cameras — corredores mais quentes`,
    `/chatid — id deste chat (para o .env)`,
    ``,
    `Encaminhe um alerta para cá se quiser testar o filtro agora.`,
  ].join("\n");
}

export function createRadarBot({ token, store, keywords }) {
  const bot = new Bot(token);
  const keys = parseKeywords(keywords.join(","));

  async function requireData(ctx) {
    const rows = store.all();
    if (!rows.length) {
      await ctx.reply("Ainda não gravei nenhum alerta filtrado.");
      return null;
    }
    return rows;
  }

  bot.command("start", async (ctx) => {
    await store.addAdmin(ctx.from.id);
    if (ctx.chat.type === "private") {
      await store.setDestChatId(ctx.chat.id);
    }
    await ctx.reply(helpText(keys));
  });

  bot.command("ajuda", (ctx) => ctx.reply(helpText(keys)));
  bot.command("help", (ctx) => ctx.reply(helpText(keys)));

  bot.command("chatid", (ctx) =>
    ctx.reply(`Chat ID: ${ctx.chat.id}\nUser ID: ${ctx.from.id}`),
  );

  bot.command("hoje", async (ctx) => {
    const rows = await requireData(ctx);
    if (!rows) return;
    await ctx.reply(formatOverview(overview(rows)));
  });

  bot.command("quente", async (ctx) => {
    const rows = await requireData(ctx);
    if (!rows) return;
    await ctx.reply(formatHot(hotNow(rows, 120), 120));
  });

  bot.command("cameras", async (ctx) => {
    const rows = await requireData(ctx);
    if (!rows) return;
    await ctx.reply(formatCameras(overview(rows)));
  });

  bot.command("horarios", async (ctx) => {
    const rows = await requireData(ctx);
    if (!rows) return;
    const placa = normalizePlaca(ctx.match);
    if (placa) {
      const stats = plateStats(rows, placa);
      if (!stats) return ctx.reply(`Sem passagens de ${placa}.`);
      return ctx.reply(formatHeatmap(stats, `${placa} · dia × hora`));
    }
    await ctx.reply(formatHeatmap(overview(rows), "Dia × hora (todas as placas do filtro)"));
  });

  bot.command("placa", async (ctx) => {
    const placa = normalizePlaca(ctx.match);
    if (!placa) return ctx.reply("Uso: /placa ABC1D23");
    const rows = store.all();
    await ctx.reply(formatPlate(plateStats(rows, placa)));
  });

  async function ingestText(ctx, text) {
    const mapsUrl = extractMapsUrl(ctx);
    const chunks = isBlacklistAlert(text) ? splitAlerts(text) : [];
    const parsed = chunks.length ? chunks : [parseAlerta(text, { mapsUrl })].filter(Boolean);
    if (!parsed.length) return false;

    let kept = 0;
    let skipped = 0;
    for (const alerta of parsed) {
      if (mapsUrl && !alerta.mapsUrl) alerta.mapsUrl = mapsUrl;
      const hits = matchKeywords(alerta.raw, keys);
      if (!hits.length) {
        skipped += 1;
        continue;
      }
      const motivos = classifyMotivo(alerta, hits);
      const { duplicate } = await store.add(alerta, {
        motivos,
        hits,
        source: "telegram-bot",
      });
      if (duplicate) continue;
      kept += 1;
      await ctx.reply(formatAlertHtml(alerta, motivos), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: false },
      });
    }

    if (!kept && skipped && parsed.length) {
      await ctx.reply("Fora do filtro (não é Endrigo nem Feira de Santana). Descartei.");
    }
    return true;
  }

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text || "";
    if (text.startsWith("/")) return next();
    const handled = await ingestText(ctx, text);
    if (!handled) return next();
  });

  bot.on("message:caption", async (ctx) => {
    const text = ctx.message.caption || "";
    await ingestText(ctx, text);
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Telegram:", e.description);
    } else if (e instanceof HttpError) {
      console.error("HTTP Telegram:", e);
    } else {
      console.error(e);
    }
  });

  return bot;
}

export async function notifyDest(bot, destChatId, alerta, motivos) {
  if (!destChatId) return;
  await bot.api.sendMessage(destChatId, formatAlertHtml(alerta, motivos), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
  });
}
