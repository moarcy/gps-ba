import { isFeiraCorridor, isFeiraOrigin } from "./filter.js";
import {
  HOP,
  asDate as geoDate,
  cameraId,
  collectTransitions,
  haversineKm,
} from "./geo.js";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_BARS = ["░", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export const CLOCK_ALPHA = 0.5;
export const CLOCK_SLOTS = 7 * 24;
export const MIN_N_PATTERN = 8;
export const MIN_N_WEEKEND_SPLIT = 16;
export const GO_MAX_HOURS = 4;

/** Pesos declarados — calibrar quando n crescer; até lá regras > ML. */
export const SCORE = {
  feiraLive20: 40,
  feira90: 25,
  feira240: 10,
  portico20: 20,
  portico90: 10,
  hop: 15,
  n8: 10,
  n3: 5,
  n1: -5,
  crmMandado: 20,
  crmKnown: 5,
  crmInapto: -35,
  foraCorredor: -10,
};

function asDate(sighting) {
  return geoDate(sighting);
}

function hoursBetween(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 36e5;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function bar(count, max, width = 8) {
  if (!max) return "░".repeat(width);
  const filled = Math.max(count ? 1 : 0, Math.round((count / max) * width));
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

function hourBar(count, max) {
  if (!max || !count) return HOUR_BARS[0];
  const i = Math.min(HOUR_BARS.length - 1, Math.round((count / max) * (HOUR_BARS.length - 1)));
  return HOUR_BARS[i];
}

function topCounts(items, limit = 5) {
  const map = new Map();
  for (const item of items) {
    const key = String(item || "").trim() || "(sem dado)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function heatmap(sightings) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const byWeekday = Array(7).fill(0);
  const byHour = Array(24).fill(0);

  for (const s of sightings) {
    const d = asDate(s);
    if (!d) continue;
    const wd = s.weekday != null ? s.weekday : d.getDay();
    const hr = s.hour != null ? s.hour : d.getHours();
    if (wd < 0 || wd > 6 || hr < 0 || hr > 23) continue;
    grid[wd][hr] += 1;
    byWeekday[wd] += 1;
    byHour[hr] += 1;
  }

  return { grid, byWeekday, byHour };
}

function bestWindow(grid) {
  let best = { weekday: 0, hour: 0, count: 0 };
  for (let wd = 0; wd < 7; wd += 1) {
    for (let hr = 0; hr < 24; hr += 1) {
      if (grid[wd][hr] > best.count) {
        best = { weekday: wd, hour: hr, count: grid[wd][hr] };
      }
    }
  }
  return best.count ? best : null;
}

function goldHours(byHour, total) {
  if (!total) return [];
  return byHour
    .map((count, hour) => ({ hour, count, pct: count / total }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

function intervalsHours(sightings) {
  const dates = sightings
    .map(asDate)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < dates.length; i += 1) {
    const gap = hoursBetween(dates[i], dates[i - 1]);
    if (gap > 0.08) gaps.push(gap);
  }
  return median(gaps);
}

function byPlaca(sightings) {
  const map = new Map();
  for (const s of sightings) {
    const placa = s.placa || "?";
    if (!map.has(placa)) map.set(placa, []);
    map.get(placa).push(s);
  }
  return map;
}

/** Intervalo de Wilson 95% para proporção binomial. */
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: 0, lo: 0, hi: 1, n: 0, k: 0 };
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)) / denom;
  return {
    p: phat,
    lo: Math.max(0, center - margin),
    hi: Math.min(1, center + margin),
    n,
    k,
  };
}

export function laplaceP(k, n, categories, alpha = CLOCK_ALPHA) {
  return (k + alpha) / (n + alpha * categories);
}

export function feiraRows(sightings) {
  return (sightings || []).filter(isFeiraOrigin);
}

/**
 * Relógio da praça: λ(dia × hora) só em origem Feira.
 * Hipótese: cada ping origem Feira é um evento do processo pontual;
 * a probabilidade de um ping cair num slot é multinomial com prior Laplace.
 */
export function squareClock(sightings) {
  const rows = feiraRows(sightings);
  const n = rows.length;
  const { grid, byWeekday, byHour } = heatmap(rows);
  const dates = rows.map(asDate).filter(Boolean).sort((a, b) => a - b);
  const period = {
    from: dates[0]?.toISOString() || null,
    to: dates.at(-1)?.toISOString() || null,
  };

  const lambda = grid.map((row) => row.map((c) => laplaceP(c, n, CLOCK_SLOTS)));
  const hourP = byHour.map((c) => laplaceP(c, n, 24));

  let window = null;
  for (let wd = 0; wd < 7; wd += 1) {
    for (let hr = 0; hr < 24; hr += 1) {
      const p = lambda[wd][hr];
      if (!window || p > window.p) {
        const ic = wilson(grid[wd][hr], n);
        window = {
          weekday: wd,
          hour: hr,
          count: grid[wd][hr],
          p,
          rawP: n ? grid[wd][hr] / n : 0,
          lo: ic.lo,
          hi: ic.hi,
        };
      }
    }
  }
  if (window && window.count === 0) window = null;

  let bestHour = null;
  for (let hr = 0; hr < 24; hr += 1) {
    if (!bestHour || hourP[hr] > bestHour.p) {
      const ic = wilson(byHour[hr], n);
      bestHour = {
        hour: hr,
        count: byHour[hr],
        p: hourP[hr],
        rawP: n ? byHour[hr] / n : 0,
        lo: ic.lo,
        hi: ic.hi,
      };
    }
  }
  if (bestHour && bestHour.count === 0) bestHour = null;

  let best3h = null;
  for (let hr = 0; hr < 24; hr += 1) {
    const count = byHour[hr] + byHour[(hr + 1) % 24] + byHour[(hr + 2) % 24];
    const ic = wilson(count, n);
    const p = laplaceP(count, n, 24);
    if (!best3h || count > best3h.count) {
      best3h = {
        hour: hr,
        endHour: (hr + 3) % 24,
        count,
        p,
        rawP: ic.p,
        lo: ic.lo,
        hi: ic.hi,
      };
    }
  }
  if (best3h && best3h.count === 0) best3h = null;

  const nWeekend = byWeekday[0] + byWeekday[6];
  const nWeekday = n - nWeekend;
  const uniqueDays = new Set(dates.map((d) => d.toDateString())).size;
  const weekendSplit =
    n < MIN_N_WEEKEND_SPLIT || nWeekend === 0 || nWeekday === 0
      ? {
          ok: false,
          n,
          nWeekend,
          nWeekday,
          uniqueDays,
          reason:
            nWeekend === 0
              ? `n=${n} origem Feira em ${uniqueDays} dia(s), 0 no fim de semana — não dá para comparar com dia útil`
              : nWeekday === 0
                ? `n=${n} origem Feira, só fim de semana — não dá para comparar com dia útil`
                : `n=${n} origem Feira — insuficiente para separar fim de semana vs dia útil (piso ${MIN_N_WEEKEND_SPLIT})`,
        }
      : {
          ok: true,
          n,
          nWeekend,
          nWeekday,
          uniqueDays,
          weekend: wilson(nWeekend, n),
          weekday: wilson(nWeekday, n),
        };

  return {
    n,
    period,
    uniqueDays,
    definition: "origem Feira (isFeiraOrigin)",
    grid,
    byWeekday,
    byHour,
    lambda,
    hourP,
    window,
    bestHour,
    best3h,
    weekendSplit,
    hypothesis: n < MIN_N_PATTERN || uniqueDays < 5,
    confidence: confidence(n),
  };
}

export function feiraRecurrence(sightings, placa) {
  let rows = feiraRows(sightings);
  if (placa) rows = rows.filter((s) => s.placa === placa);
  const groups = byPlaca(rows);
  const gapsDays = [];
  const samples = [];

  for (const [p, list] of groups) {
    const dates = list.map(asDate).filter(Boolean).sort((a, b) => a - b);
    for (let i = 1; i < dates.length; i += 1) {
      const gapH = hoursBetween(dates[i], dates[i - 1]);
      if (gapH <= 0.08) continue;
      const days = gapH / 24;
      gapsDays.push(days);
      samples.push({ placa: p, days });
    }
  }

  samples.sort((a, b) => a.days - b.days);
  return {
    nHits: rows.length,
    nGaps: gapsDays.length,
    medianDays: median(gapsDays),
    samples: samples.slice(0, 12),
  };
}

function ageMinutes(last, now) {
  const t = asDate(last)?.getTime();
  if (!t) return null;
  const min = (now - t) / 60000;
  return min < 0 ? 0 : min;
}

function hopLine(hop) {
  if (!hop) return null;
  const iqr =
    hop.q25 != null && hop.q75 != null
      ? `IQR ${Math.round(hop.q25)}–${Math.round(hop.q75)} min`
      : null;
  const p = hop.p != null ? `P suavizada ${pct(hop.p)}` : null;
  const bits = [`~${Math.round(hop.median || hop.minutes || 0)} min`, iqr, `n=${hop.n || hop.count}`, p].filter(
    Boolean,
  );
  return `${shortCamera(hop.to)} (${bits.join(" · ")})`;
}

/**
 * ETA / interceptação a partir do último ping.
 * GO só origem Feira e idade ≤ 4h. Pórtico invertido (mesmo GPS) não é viagem.
 */
export function interceptEta(last, { transitions = [], now = Date.now(), feiraCameras = [] } = {}) {
  if (!last) return null;
  const ageMin = ageMinutes(last, now);
  const delayed = ageMin != null && ageMin > GO_MAX_HOURS * 60;
  const live = ageMin != null && ageMin >= 0 && ageMin <= 25;
  const origin = isFeiraOrigin(last);
  const fromId = cameraId(last);
  const usefulFrom = (transitions || []).filter((tr) => tr.from === fromId);
  const hop = usefulFrom[0] || null;
  const ageLabel = ageMin == null ? "sem hora" : formatDuration(ageMin / 60);

  const sameGpsFeira =
    !origin &&
    (feiraCameras || []).some(
      (c) => c.feira && haversineKm(c, last) != null && haversineKm(c, last) < HOP.sameGpsKm,
    );

  if (delayed) {
    return {
      kind: origin ? "go-atrasado" : "atrasado",
      go: false,
      live: false,
      delayed: true,
      ageMin,
      hop: origin ? hop : null,
      interceptable: false,
      action: `Passagem com mais de ${GO_MAX_HOURS}h (${ageLabel}) — não gera ordem de rua.`,
    };
  }

  if (origin) {
    if (hop) {
      const minutesLeft = (hop.median ?? hop.minutes) - ageMin;
      const q75 = hop.q75 ?? hop.median ?? hop.minutes;
      const interceptable = ageMin != null && ageMin < q75;
      return {
        kind: live ? "go" : "go-recente",
        go: true,
        live,
        delayed: false,
        ageMin,
        hop,
        minutesToNext: hop.median ?? hop.minutes,
        minutesLeft,
        interceptable,
        action: interceptable
          ? `Saiu de Feira há ${ageLabel}. Posicionar em ${hopLine(hop)}.`
          : `Saiu de Feira há ${ageLabel}. Pelo IQR já deve ter passado de ${shortCamera(hop.to)} — só ir se a equipe estiver no trecho.`,
      };
    }
    return {
      kind: live ? "go" : "go-recente",
      go: true,
      live,
      delayed: false,
      ageMin,
      hop: null,
      interceptable: ageMin != null && ageMin <= 40,
      action: `Na praça (origem Feira) há ${ageLabel}. Próximo ponto à frente ainda sem hop útil — pórtico invertido (mesmo GPS, Δt≈0) não é deslocamento. Cobrir a saída da praça.`,
    };
  }

  if (sameGpsFeira) {
    return {
      kind: "portico",
      go: false,
      live,
      delayed: false,
      ageMin,
      hop: null,
      interceptable: live,
      action: `Mesmo GPS da praça, sentido chegada, há ${ageLabel}. Não é GO (origem não é Feira) e não é câmera em Jequié — pórtico invertido. Observar a praça se for recente.`,
    };
  }

  if (isFeiraCorridor(last)) {
    const toFeira = usefulFrom.find((tr) => tr.toFeira) || null;
    return {
      kind: "aproximacao",
      go: false,
      live: false,
      delayed: false,
      ageMin,
      hop: toFeira,
      interceptable: false,
      action: toFeira
        ? `Vem para a praça há ${ageLabel}. ETA empírico ${hopLine(toFeira)}. Sem GO até ping com origem Feira.`
        : `Câmera com destino Feira — inteligência, sem GO de rua. Sem amostra de tempo de viagem até a praça.`,
    };
  }

  return {
    kind: "fora",
    go: false,
    live: false,
    delayed: false,
    ageMin,
    hop: null,
    interceptable: false,
    action: "Fora do corredor Feira — não alertar o grupo de GO.",
  };
}

export function crmScoreDelta(crm) {
  if (!crm) return { delta: 0, reason: null };
  if (crm.status === "inapto" || crm.status === "cancelado") {
    return { delta: SCORE.crmInapto, reason: `${SCORE.crmInapto} CRM inapto/cancelado` };
  }
  if (crm.temMandado || crm.status === "com_mandado") {
    return { delta: SCORE.crmMandado, reason: `+${SCORE.crmMandado} mandado/apto` };
  }
  return { delta: SCORE.crmKnown, reason: `+${SCORE.crmKnown} no CRM` };
}

export function priorityScore({ eta, feiraN = 0, inCorridor = false, crm } = {}) {
  let s = 0;
  const reasons = [];
  const age = eta?.ageMin;
  const kind = eta?.kind;

  if (kind === "go" || kind === "go-recente") {
    if (age != null && age <= 20) {
      s += SCORE.feiraLive20;
      reasons.push(`+${SCORE.feiraLive20} ping origem Feira ≤20 min`);
    } else if (age != null && age <= 90) {
      s += SCORE.feira90;
      reasons.push(`+${SCORE.feira90} ping origem Feira ≤90 min`);
    } else if (age != null && age <= 240) {
      s += SCORE.feira240;
      reasons.push(`+${SCORE.feira240} ping origem Feira ≤4h`);
    }
  } else if (kind === "portico") {
    if (age != null && age <= 20) {
      s += SCORE.portico20;
      reasons.push(`+${SCORE.portico20} pórtico invertido ≤20 min`);
    } else if (age != null && age <= 90) {
      s += SCORE.portico90;
      reasons.push(`+${SCORE.portico90} pórtico invertido ≤90 min`);
    }
  } else if (!inCorridor) {
    s += SCORE.foraCorredor;
    reasons.push(`${SCORE.foraCorredor} fora do corredor`);
  }

  if (eta?.hop) {
    s += SCORE.hop;
    reasons.push(`+${SCORE.hop} hop útil conhecido`);
  }

  if (feiraN >= 8) {
    s += SCORE.n8;
    reasons.push(`+${SCORE.n8} n Feira ≥8`);
  } else if (feiraN >= 3) {
    s += SCORE.n3;
    reasons.push(`+${SCORE.n3} n Feira ≥3`);
  } else if (feiraN === 1) {
    s += SCORE.n1;
    reasons.push(`${SCORE.n1} n Feira = 1`);
  }

  const crmPart = crmScoreDelta(crm);
  if (crmPart.delta) {
    s += crmPart.delta;
    reasons.push(crmPart.reason);
  }

  s = Math.max(0, Math.min(100, s));
  const band = s >= 50 ? "go" : s >= 30 ? "watch" : "low";
  return { score: s, band, reasons };
}

export function attachInterceptAnalytics(payload, sightings, { now = Date.now(), crmByPlaca = {} } = {}) {
  const clock = squareClock(sightings);
  const transitions = payload?.transitions || collectTransitions(sightings).transitions;
  const feiraCameras = (payload?.cameras || []).filter((c) => c.feira);
  const recurrence = feiraRecurrence(sightings);

  const plates = (payload?.plates || []).map((p) => {
    const last = p.last || {
      placa: p.placa,
      camera: p.lastCamera,
      rota: p.lastRota,
      origemRota: p.lastOrigem,
      destinoRota: p.lastDestino,
      iso: p.lastIso,
      dataHora: p.lastDataHora,
      lat: p.lastLat,
      lon: p.lastLon,
    };
    const eta = interceptEta(last, { transitions, now, feiraCameras });
    const rec = feiraRecurrence(sightings, p.placa);
    const scored = priorityScore({
      eta,
      feiraN: p.feira,
      inCorridor: p.feira > 0 || isFeiraCorridor(last),
      crm: crmByPlaca[p.placa],
    });
    return {
      ...p,
      eta,
      recurrence: rec,
      score: scored.score,
      scoreBand: scored.band,
      scoreReasons: scored.reasons,
      action: eta?.action || "",
    };
  });

  plates.sort((a, b) => b.score - a.score || b.feira - a.feira || b.total - a.total);

  return {
    ...payload,
    plates,
    clock,
    recurrence,
    scoreFormula: SCORE,
    meta: {
      ...(payload?.meta || {}),
      feiraOrigin: clock.n,
      period: clock.period,
      definition: clock.definition,
      hypothesis: clock.hypothesis,
    },
  };
}

export function hotNow(sightings, minutes = 120, { originFeira = true } = {}) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const recent = sightings.filter((s) => {
    const d = asDate(s);
    if (!d || d.getTime() < cutoff) return false;
    if (originFeira && !isFeiraOrigin(s)) return false;
    return true;
  });
  const latest = new Map();
  for (const s of recent) {
    const prev = latest.get(s.placa);
    const t = asDate(s)?.getTime() || 0;
    if (!prev || t >= (asDate(prev)?.getTime() || 0)) latest.set(s.placa, s);
  }
  return [...latest.values()].sort(
    (a, b) => (asDate(b)?.getTime() || 0) - (asDate(a)?.getTime() || 0),
  );
}

export function plateStats(sightings, placa) {
  const rows = sightings.filter((s) => s.placa === placa);
  if (!rows.length) return null;

  const feira = feiraRows(rows);
  const { grid, byWeekday, byHour } = heatmap(feira.length ? feira : rows);
  const total = rows.length;
  const last = [...rows].sort(
    (a, b) => (asDate(b)?.getTime() || 0) - (asDate(a)?.getTime() || 0),
  )[0];
  const window = bestWindow(grid);
  const rotas = topCounts(rows.map(routeLabel), 5);
  const interval = intervalsHours(feira.length ? feira : rows);
  const clock = squareClock(rows);
  const recurrence = feiraRecurrence(rows, placa);
  const { transitions } = collectTransitions(sightings);
  const feiraCameras = [];
  const seen = new Map();
  for (const s of sightings) {
    if (!isFeiraOrigin(s) || s.lat == null) continue;
    const id = cameraId(s);
    if (!seen.has(id)) seen.set(id, { id, lat: s.lat, lon: s.lon, feira: true });
  }
  feiraCameras.push(...seen.values());
  const eta = interceptEta(last, { transitions, feiraCameras });
  const scored = priorityScore({
    eta,
    feiraN: feira.length,
    inCorridor: feira.length > 0 || isFeiraCorridor(last),
  });

  return {
    placa,
    total,
    feiraN: feira.length,
    last,
    cameras: topCounts(rows.map((s) => s.camera)),
    rotas,
    sentidos: topCounts(rows.map((s) => s.faixa).filter(Boolean), 4),
    byWeekday,
    byHour,
    window,
    intervalHours: interval,
    goldHours: goldHours(byHour, feira.length || total),
    weekdayPct: byWeekday.map((n) => {
      const den = feira.length || total;
      return den ? n / den : 0;
    }),
    confidence: confidence(feira.length || total),
    nextHint: nextWindowHint(last, window, interval),
    grid,
    clock,
    recurrence,
    eta,
    score: scored,
  };
}

function routeLabel(s) {
  return s.rota || s.faixa || s.camera || "(sem rota)";
}

function confidence(total) {
  if (total >= 20) return { key: "alta", label: "alta" };
  if (total >= 8) return { key: "media", label: "média" };
  if (total >= 3) return { key: "baixa", label: "baixa" };
  return { key: "insuficiente", label: "ainda pouca (precisa de mais passagens)" };
}

function nextWindowHint(last, window, intervalHours) {
  if (!window) return null;
  const slot = `${WEEKDAYS[window.weekday]} ${pad(window.hour)}h–${pad((window.hour + 1) % 24)}h`;
  if (intervalHours == null) return `Esperar ${slot} na rota mais frequente`;
  return `Esperar ${slot} · reaparece em cerca de ${formatDuration(intervalHours)}`;
}

export function overview(sightings, { minutes = 120 } = {}) {
  const clock = squareClock(sightings);
  const { grid, byWeekday, byHour } = heatmap(sightings);
  const total = sightings.length;
  const placas = new Set(sightings.map((s) => s.placa).filter(Boolean));
  const todayKey = new Date().toDateString();
  const today = sightings.filter((s) => asDate(s)?.toDateString() === todayKey);
  const { transitions, nextAfterFeira, discarded } = collectTransitions(sightings);

  return {
    total,
    uniquePlates: placas.size,
    today: today.length,
    todayPlates: new Set(today.map((s) => s.placa)).size,
    hot: hotNow(sightings, minutes),
    cameras: topCounts(sightings.map((s) => s.camera), 6),
    rotas: topCounts(sightings.map(routeLabel), 6),
    window: clock.window
      ? { weekday: clock.window.weekday, hour: clock.window.hour, count: clock.window.count }
      : bestWindow(grid),
    goldHours: goldHours(clock.byHour, clock.n || total),
    byWeekday: clock.n ? clock.byWeekday : byWeekday,
    byHour: clock.n ? clock.byHour : byHour,
    grid: clock.n ? clock.grid : grid,
    topPlates: [...byPlaca(sightings).entries()]
      .map(([placa, rows]) => ({ placa, count: rows.length, last: rows.at(-1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    clock,
    hops: Object.values(nextAfterFeira),
    discardedHops: discarded,
    transitions,
  };
}

export function formatOverview(stats) {
  if (!stats.total) {
    return "Ainda não há passagens gravadas. Quando o filtro pegar um alerta, ele entra no radar.";
  }

  const clock = stats.clock;
  const nFeira = clock?.n ?? 0;
  const period = formatPeriod(clock?.period);
  const lines = [
    `Radar Feira · interceptação`,
    ``,
    `${nFeira} origem Feira · ${stats.total} passagens no corredor · ${stats.uniquePlates} placas`,
    `Período: ${period}${clock?.uniqueDays ? ` · ${clock.uniqueDays} dia(s)` : ""} · definição: origem da câmera`,
  ];

  if (clock?.hypothesis) {
    lines.push(
      `Amostra curta (${clock.uniqueDays || 0} dia(s), n=${nFeira}) — trate o relógio como hipótese.`,
    );
  }
  if (clock?.weekendSplit && !clock.weekendSplit.ok) {
    lines.push(clock.weekendSplit.reason);
  }

  if (stats.hot.length) {
    lines.push(``, `Quente agora (2h, origem Feira)`);
    for (const s of stats.hot.slice(0, 6)) {
      const hh = s.dataHora?.slice(-8, -3) || "--:--";
      lines.push(`· ${s.placa} ${hh} · ${shortCamera(s.camera)}`);
    }
  }

  if (clock?.best3h) {
    lines.push(
      ``,
      `Relógio: janela ${pad(clock.best3h.hour)}h–${pad(clock.best3h.endHour)}h (${clock.best3h.count}x, P ${pct(clock.best3h.rawP)}, IC ${pct(clock.best3h.lo)}–${pct(clock.best3h.hi)})`,
    );
  } else if (stats.window) {
    lines.push(
      ``,
      `Melhor janela geral: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h (${stats.window.count}x)`,
    );
  }

  if (clock?.bestHour) {
    lines.push(
      `Hora mais vista: ${pad(clock.bestHour.hour)}h (P suavizada ${pct(clock.bestHour.p)}, bruta ${pct(clock.bestHour.rawP)})`,
    );
  }

  if (stats.hops?.length) {
    lines.push(``, `Próximo ponto depois de Feira`);
    for (const h of stats.hops.slice(0, 3)) {
      lines.push(`· ${hopLine(h)}`);
    }
  } else {
    const d = stats.discardedHops;
    const nDisc = d?.sameGps || 0;
    lines.push(
      ``,
      nDisc
        ? `Próximo ponto: ainda sem hop útil (${nDisc} descartado${nDisc === 1 ? "" : "s"} por mesmo GPS / pórtico invertido).`
        : `Próximo ponto: ainda sem hop útil — falta ping numa câmera à frente.`,
    );
  }

  lines.push(``, `Comandos: /placa ABC1D23 · /horarios · /rotas · /quente`);
  return lines.join("\n");
}

export function formatPlate(stats) {
  if (!stats) return "Placa sem passagens no radar.";

  const clock = stats.clock;
  const eta = stats.eta;
  const rec = stats.recurrence;
  const nFeira = stats.feiraN ?? 0;
  const lines = [
    `${stats.placa} · ${nFeira}x origem Feira · ${stats.total} passagem${stats.total === 1 ? "" : "es"}`,
    `Confiança: ${stats.confidence.label}${clock?.hypothesis ? " · hipótese" : ""}`,
    ``,
    `Como agir`,
  ];

  if (eta?.action) lines.push(`· ${eta.action}`);
  else if (stats.nextHint) lines.push(`· ${stats.nextHint}`);

  if (eta?.hop) {
    lines.push(`· Hop: ${hopLine(eta.hop)}`);
  } else if (stats.rotas?.[0] && isFeiraOrigin(stats.last)) {
    lines.push(`· Posicionar na saída da praça (${stats.rotas[0].key})`);
  }

  if (stats.score) {
    lines.push(`· Prioridade agora: ${stats.score.score}/100 (${bandLabel(stats.score.band)})`);
  }

  if (nFeira < MIN_N_PATTERN) {
    lines.push(`· Ainda poucas passagens — trate a janela como hipótese, não certeza`);
  }

  if (stats.last) {
    lines.push(
      ``,
      `Última: ${stats.last.dataHora || "—"}`,
      `Rota: ${routeLabel(stats.last)}`,
    );
    if (stats.last.mapsUrl) lines.push(`Mapa: ${stats.last.mapsUrl}`);
  }

  if (clock?.best3h && nFeira) {
    lines.push(
      ``,
      `Relógio na praça: ${pad(clock.best3h.hour)}h–${pad(clock.best3h.endHour)}h · P ${pct(clock.best3h.rawP)} (IC ${pct(clock.best3h.lo)}–${pct(clock.best3h.hi)}, n=${nFeira})`,
    );
  } else if (stats.window) {
    const den = nFeira || stats.total;
    const pctSlot = den ? Math.round((stats.window.count / den) * 100) : 0;
    lines.push(
      ``,
      `Melhor hora para esperar: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h–${pad((stats.window.hour + 1) % 24)}h (${pctSlot}% das passagens nesse slot)`,
    );
  }

  if (rec?.nGaps) {
    const raw = rec.samples
      .filter((s) => s.placa === stats.placa)
      .map((s) => formatDuration(s.days * 24))
      .slice(0, 5)
      .join(", ");
    lines.push(
      `Recorrência na praça: mediana ${formatDuration((rec.medianDays || 0) * 24)} (${rec.nGaps} intervalo${rec.nGaps === 1 ? "" : "s"}${raw ? `: ${raw}` : ""})`,
    );
  } else if (nFeira) {
    lines.push(`Recorrência na praça: ainda sem intervalo (só ${nFeira} ping${nFeira === 1 ? "" : "s"} origem Feira).`);
  }

  lines.push(``, `n=${nFeira} origem Feira · ${formatPeriod(clock?.period)} · definição: origem da câmera`);
  return lines.join("\n");
}

export function formatHeatmap(stats, title = "Horários de ouro") {
  if (!stats.total && !stats.clock?.n) return "Sem dados ainda.";
  const grid = stats.clock?.grid || stats.grid;
  const lines = [title, ``];
  const max = Math.max(...grid.flat(), 1);

  lines.push("    " + [0, 6, 12, 18].map((h) => pad(h)).join("  "));
  grid.forEach((row, wd) => {
    const cells = [];
    for (let h = 0; h < 24; h += 6) {
      const chunk = row.slice(h, h + 6).reduce((a, b) => a + b, 0);
      cells.push(hourBar(chunk, max * 3));
    }
    const peak = row.indexOf(Math.max(...row));
    const peakLabel = row[peak] ? `${pad(peak)}h` : "--";
    lines.push(`${WEEKDAYS[wd]} ${cells.join(" ")}  pico ${peakLabel}`);
  });

  const clock = stats.clock;
  if (clock?.bestHour) {
    lines.push(
      ``,
      `Hora mais vista (origem Feira): ${pad(clock.bestHour.hour)}h · P suavizada ${pct(clock.bestHour.p)} · bruta ${pct(clock.bestHour.rawP)} (IC ${pct(clock.bestHour.lo)}–${pct(clock.bestHour.hi)}, n=${clock.n})`,
    );
    if (clock.hypothesis) lines.push(`Amostra curta — hipótese, não padrão semanal.`);
  } else if (stats.window) {
    lines.push(
      ``,
      `Slot mais quente: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h (${stats.window.count}x)`,
    );
  }
  return lines.join("\n");
}

export function formatRoutes(stats, title = "Corredores para interceptação") {
  const hops = stats.hops || [];
  if (hops.length) {
    const lines = [title, ``, `Hops úteis depois de Feira (piso ${HOP.minMinutes} min · ${HOP.minKm} km)`];
    for (const h of hops.slice(0, 6)) {
      lines.push(`· ${hopLine(h)}`);
    }
    return lines.join("\n");
  }

  const rotas = stats.rotas || stats.cameras || [];
  if (!rotas.length) return "Sem rotas gravadas.";
  const lines = [title, ``];
  const max = rotas[0]?.count || 1;
  for (const r of rotas) {
    lines.push(`${r.key}`);
    lines.push(`  ${bar(r.count, max, 8)} ${r.count} passagens`);
  }
  if (stats.discardedHops?.sameGps) {
    lines.push(
      ``,
      `${stats.discardedHops.sameGps} hops descartados (mesmo GPS / pórtico invertido) — não são próximo ponto à frente.`,
    );
  }
  if (stats.window) {
    lines.push(
      ``,
      `Melhor slot geral: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h`,
    );
  }
  return lines.join("\n");
}

export function formatCameras(stats) {
  if (!stats.cameras.length) return "Sem câmeras gravadas.";
  const lines = [`Corredores para interceptação`, ``];
  for (const c of stats.cameras) {
    lines.push(`· ${c.key}`);
    lines.push(`  ${c.count} passagens`);
  }
  return lines.join("\n");
}

export function formatHot(rows, minutes = 120) {
  if (!rows.length) return `Nenhuma passagem origem Feira nos últimos ${minutes} min.`;
  const lines = [`Quente agora (${minutes} min, origem Feira)`, ``];
  for (const s of rows) {
    lines.push(`${s.placa}`);
    lines.push(`  ${s.dataHora || "—"}`);
    lines.push(`  ${s.camera || "—"}`);
    if (s.mapsUrl) lines.push(`  ${s.mapsUrl}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function bandLabel(band) {
  if (band === "go") return "ir agora";
  if (band === "watch") return "observar";
  return "fila baixa";
}

function pct(p) {
  if (p == null || Number.isNaN(p)) return "—";
  const v = p * 100;
  if (v < 1) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

function formatPeriod(period) {
  if (!period?.from && !period?.to) return "sem período";
  const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  return `${fmt(period.from)} → ${fmt(period.to)}`;
}

function shortCamera(value) {
  const t = String(value || "").trim();
  if (t.length <= 42) return t || "—";
  return `${t.slice(0, 40)}…`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDuration(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${hours.toFixed(1).replace(".0", "")} h`;
  const days = hours / 24;
  if (days < 10) return `${days.toFixed(1).replace(".0", "")} d`;
  return `${Math.round(days)} d`;
}

export { WEEKDAYS };
