import { InputFile, Bot, GrammyError, HttpError } from "grammy";
import {
  formatCameras,
  formatHeatmap,
  formatHot,
  formatOverview,
  formatPlate,
  formatRoutes,
  hotNow,
  overview,
  plateStats,
} from "./analytics.js";
import { classifyMotivo, decideTrack, parseKeywords } from "./filter.js";
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

function photoFileId(ctx) {
  const photos = ctx.message?.photo;
  if (!photos?.length) return null;
  return photos[photos.length - 1].file_id;
}

function helpText(keywords) {
  return [
    `Radar de apreensão`,
    `Filtro: ${keywords.join("  |  ")}`,
    ``,
    `Eu aviso no Telegram todo alerta com Feira de Santana na câmera:`,
    `GO = origem Feira (já na praça). sentido Feira = vindo para a praça.`,
    ``,
    `/hoje — relógio da praça, hops úteis e quente`,
    `/quente — origem Feira nas últimas 2h`,
    `/placa ABC1D23 — como agir, ETA e recorrência`,
    `/horarios — mapa dia × hora`,
    `/rotas — corredores mais quentes`,
    `/cameras — câmeras`,
    `/chatid — id deste chat (para o .env)`,
    ``,
    `Encaminhe um alerta de Feira para testar. Outras câmeras só gravamos se a placa já passou em Feira.`,
    `Se o PC dormir ou desligar, ao voltar eu puxo o que ficou no Painel RK (aviso até 18h).`,
  ].join("\n");
}

export function createRadarBot({ token, store, keywords, destChatId }) {
  const bot = new Bot(token);
  const keys = parseKeywords(keywords.join(","));

  function resolveDest() {
    return destChatId || store.getSettings().destChatId || null;
  }

  function sameChat(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

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
    if (ctx.chat.type === "private" && !destChatId) {
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

  bot.command("rotas", async (ctx) => {
    const rows = await requireData(ctx);
    if (!rows) return;
    const placa = normalizePlaca(ctx.match);
    if (placa) {
      const stats = plateStats(rows, placa);
      if (!stats) return ctx.reply(`Sem passagens de ${placa}.`);
      return ctx.reply(formatRoutes(stats, `${placa} · rotas`));
    }
    await ctx.reply(formatRoutes(overview(rows), "Corredores para interceptação"));
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
    const media = { photoFileId: photoFileId(ctx) };
    const chunks = isBlacklistAlert(text) ? splitAlerts(text) : [];
    const parsed = chunks.length ? chunks : [parseAlerta(text, { mapsUrl })].filter(Boolean);
    if (!parsed.length) return false;

    let kept = 0;
    let skipped = 0;
    let tracked = 0;
    const known = typeof store.knownPlates === "function" ? store.knownPlates() : new Set();
    for (const alerta of parsed) {
      if (mapsUrl && !alerta.mapsUrl) alerta.mapsUrl = mapsUrl;
      const { track, notify } = decideTrack(alerta, { knownPlates: known });
      if (!track) {
        skipped += 1;
        continue;
      }
      const motivos = notify
        ? classifyMotivo(alerta, ["FEIRA DE SANTANA"])
        : ["rota"];
      const dest = resolveDest();
      const { duplicate } = await store.add(alerta, {
        motivos,
        hits: notify ? ["FEIRA DE SANTANA"] : [],
        source: "telegram-bot",
      });
      if (!duplicate) known.add(alerta.placa);
      if (!notify) {
        if (!duplicate) tracked += 1;
        continue;
      }
      if (!duplicate) kept += 1;
      else if (!dest || sameChat(dest, ctx.chat.id)) continue;

      if (!duplicate) {
        await replyAlert(ctx, alerta, motivos, media);
      }

      if (dest && !sameChat(dest, ctx.chat.id)) {
        try {
          await notifyDest(bot, dest, alerta, motivos, media);
          if (duplicate) {
            await ctx.reply(`Já estava no radar. Reenviei ${alerta.placa} no grupo.`);
          }
        } catch (err) {
          console.error("Falha ao enviar no grupo destino:", err.message || err);
          await ctx.reply("Filtrado aqui, mas não consegui mandar no grupo. Confira se o bot ainda é membro.");
        }
      }
    }

    if (!kept && tracked && parsed.length) {
      await ctx.reply("Gravei a rota desta placa (já passou em Feira). Sem GO — câmera fora da praça.");
    } else if (!kept && skipped && parsed.length) {
      await ctx.reply("Fora de Feira de Santana e placa ainda não está no radar. Descartei.");
    }
    return true;
  }

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text || "";
    if (text.startsWith("/")) return next();
    const handled = await ingestText(ctx, text);
    if (!handled) return next();
  });

  bot.on("message:photo", async (ctx) => {
    await ingestText(ctx, ctx.message.caption || "");
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

function photoPayload(media = {}) {
  if (media.photoFileId) return media.photoFileId;
  if (media.photoBuffer) {
    return new InputFile(media.photoBuffer, "radar.jpg");
  }
  return null;
}

async function replyAlert(ctx, alerta, motivos, media = {}) {
  const caption = formatAlertHtml(alerta, motivos);
  const photo = photoPayload(media);
  if (photo) {
    await ctx.replyWithPhoto(photo, {
      caption: clipCaption(caption),
      parse_mode: "HTML",
    });
    return;
  }
  await ctx.reply(caption, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
  });
}

function clipCaption(html) {
  if (html.length <= 1024) return html;
  return `${html.slice(0, 1000)}…`;
}

export async function notifyDest(bot, destChatId, alerta, motivos, media = {}) {
  if (!destChatId) return;
  const caption = formatAlertHtml(alerta, motivos);
  const photo = photoPayload(media);
  if (photo) {
    await bot.api.sendPhoto(destChatId, photo, {
      caption: clipCaption(caption),
      parse_mode: "HTML",
    });
    return;
  }
  await bot.api.sendMessage(destChatId, caption, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
  });
}
