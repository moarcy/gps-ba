const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_BARS = ["░", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function asDate(sighting) {
  if (sighting?.iso) {
    const d = new Date(sighting.iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return sighting?.ts ? new Date(sighting.ts) : null;
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

export function hotNow(sightings, minutes = 120) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const recent = sightings.filter((s) => {
    const d = asDate(s);
    return d && d.getTime() >= cutoff;
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

  const { grid, byWeekday, byHour } = heatmap(rows);
  const total = rows.length;
  const last = [...rows].sort(
    (a, b) => (asDate(b)?.getTime() || 0) - (asDate(a)?.getTime() || 0),
  )[0];
  const window = bestWindow(grid);

  return {
    placa,
    total,
    last,
    cameras: topCounts(rows.map((s) => s.camera)),
    sentidos: topCounts(rows.map((s) => s.faixa).filter(Boolean), 4),
    byWeekday,
    byHour,
    window,
    intervalHours: intervalsHours(rows),
    goldHours: goldHours(byHour, total),
    weekdayPct: byWeekday.map((n) => (total ? n / total : 0)),
  };
}

export function overview(sightings, { minutes = 120 } = {}) {
  const { grid, byWeekday, byHour } = heatmap(sightings);
  const total = sightings.length;
  const placas = new Set(sightings.map((s) => s.placa).filter(Boolean));
  const todayKey = new Date().toDateString();
  const today = sightings.filter((s) => asDate(s)?.toDateString() === todayKey);

  return {
    total,
    uniquePlates: placas.size,
    today: today.length,
    todayPlates: new Set(today.map((s) => s.placa)).size,
    hot: hotNow(sightings, minutes),
    cameras: topCounts(sightings.map((s) => s.camera), 6),
    window: bestWindow(grid),
    goldHours: goldHours(byHour, total),
    byWeekday,
    byHour,
    grid,
    topPlates: [...byPlaca(sightings).entries()]
      .map(([placa, rows]) => ({ placa, count: rows.length, last: rows.at(-1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

export function formatOverview(stats) {
  if (!stats.total) {
    return "Ainda não há passagens gravadas. Quando o filtro pegar um alerta, ele entra no radar.";
  }

  const lines = [
    `Radar de apreensão`,
    ``,
    `${stats.total} passagens · ${stats.uniquePlates} placas`,
    `Hoje: ${stats.today} passagens · ${stats.todayPlates} placas`,
  ];

  if (stats.hot.length) {
    lines.push(``, `Quente agora (2h)`);
    for (const s of stats.hot.slice(0, 8)) {
      const hh = s.dataHora?.slice(-8, -3) || "--:--";
      lines.push(`· ${s.placa} ${hh} · ${shortCamera(s.camera)}`);
    }
  }

  if (stats.window) {
    lines.push(
      ``,
      `Melhor janela geral: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h (${stats.window.count}x)`,
    );
  }

  if (stats.goldHours.length) {
    lines.push(`Horários de ouro: ${stats.goldHours.map((h) => `${pad(h.hour)}h`).join(" · ")}`);
  }

  if (stats.cameras.length) {
    lines.push(``, `Câmeras / corredores`);
    for (const c of stats.cameras) {
      lines.push(`· ${shortCamera(c.key)} (${c.count})`);
    }
  }

  lines.push(``, `Comandos: /placa ABC1D23 · /horarios · /cameras · /quente`);
  return lines.join("\n");
}

export function formatPlate(stats) {
  if (!stats) return "Placa sem passagens no radar.";

  const lines = [
    `${stats.placa} · ${stats.total} passagem${stats.total === 1 ? "" : "es"}`,
  ];

  if (stats.last) {
    lines.push(
      `Última: ${stats.last.dataHora || "—"}`,
      `Câmera: ${stats.last.camera || "—"}`,
    );
    if (stats.last.faixa) lines.push(`Faixa: ${stats.last.faixa}`);
    if (stats.last.mapsUrl) lines.push(`Mapa: ${stats.last.mapsUrl}`);
  }

  if (stats.intervalHours != null) {
    lines.push(`Intervalo típico entre passagens: ${formatDuration(stats.intervalHours)}`);
  }

  if (stats.window) {
    const pct = Math.round((stats.window.count / stats.total) * 100);
    lines.push(
      ``,
      `Melhor hora para esperar: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h–${pad((stats.window.hour + 1) % 24)}h (${pct}% das passagens nesse slot)`,
    );
  }

  lines.push(``, `Probabilidade por dia`);
  const maxWd = Math.max(...stats.byWeekday, 1);
  stats.byWeekday.forEach((n, i) => {
    const pct = Math.round(stats.weekdayPct[i] * 100);
    lines.push(`${WEEKDAYS[i]} ${bar(n, maxWd, 6)} ${n} (${pct}%)`);
  });

  const maxHr = Math.max(...stats.byHour, 1);
  const activeHours = stats.byHour
    .map((n, h) => ({ n, h }))
    .filter((x) => x.n > 0);
  if (activeHours.length) {
    lines.push(``, `Horas com passagem`);
    lines.push(activeHours.map((x) => `${pad(x.h)}h${hourBar(x.n, maxHr)}`).join(" "));
  }

  if (stats.cameras.length) {
    lines.push(``, `Onde costuma aparecer`);
    for (const c of stats.cameras) {
      lines.push(`· ${shortCamera(c.key)} (${c.count})`);
    }
  }

  return lines.join("\n");
}

export function formatHeatmap(stats, title = "Horários de ouro") {
  if (!stats.total) return "Sem dados ainda.";
  const lines = [title, ``];
  const max = Math.max(...stats.grid.flat(), 1);

  lines.push("    " + [0, 6, 12, 18].map((h) => pad(h)).join("  "));
  stats.grid.forEach((row, wd) => {
    const cells = [];
    for (let h = 0; h < 24; h += 6) {
      const chunk = row.slice(h, h + 6).reduce((a, b) => a + b, 0);
      cells.push(hourBar(chunk, max * 3));
    }
    const peak = row.indexOf(Math.max(...row));
    const peakLabel = row[peak] ? `${pad(peak)}h` : "--";
    lines.push(`${WEEKDAYS[wd]} ${cells.join(" ")}  pico ${peakLabel}`);
  });

  if (stats.window) {
    lines.push(
      ``,
      `Slot mais quente: ${WEEKDAYS[stats.window.weekday]} ${pad(stats.window.hour)}h (${stats.window.count}x)`,
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
  if (!rows.length) return `Nenhuma passagem nos últimos ${minutes} min.`;
  const lines = [`Quente agora (${minutes} min)`, ``];
  for (const s of rows) {
    lines.push(`${s.placa}`);
    lines.push(`  ${s.dataHora || "—"}`);
    lines.push(`  ${s.camera || "—"}`);
    if (s.mapsUrl) lines.push(`  ${s.mapsUrl}`);
    lines.push("");
  }
  return lines.join("\n").trim();
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
