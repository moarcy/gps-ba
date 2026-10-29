import { isFeiraOrigin } from "./filter.js";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Hop útil = deslocamento real, não as duas faixas do mesmo pórtico. */
export const HOP = {
  minMinutes: 5,
  maxMinutes: 12 * 60,
  minKm: 0.5,
  sameGpsKm: 0.15,
};

const NEXT_ALPHA = 0.5;

export function asDate(s) {
  if (s?.iso) {
    const d = new Date(s.iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return s?.ts ? new Date(s.ts) : null;
}

export function haversineKm(a, b) {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isFeiraCamera(s) {
  return isFeiraOrigin(s);
}

export function cameraId(s) {
  const name = String(s.camera || s.from || s.name || "").trim() || "(sem nome)";
  return name.toUpperCase().replace(/\s+/g, " ");
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(nums, p) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function iqrStats(nums) {
  if (!nums.length) return { n: 0, median: null, q25: null, q75: null };
  return {
    n: nums.length,
    median: median(nums),
    q25: quantile(nums, 0.25),
    q75: quantile(nums, 0.75),
  };
}

export function isSameGps(a, b, km = HOP.sameGpsKm) {
  const d = haversineKm(a, b);
  return d != null && d < km;
}

export function hopMinutes(prev, next) {
  const t0 = asDate(prev);
  const t1 = asDate(next);
  if (!t0 || !t1) return null;
  return (t1 - t0) / 60000;
}

export function classifyHop(prev, next) {
  const minutes = hopMinutes(prev, next);
  if (minutes == null) return { keep: false, reason: "sem-data" };
  if (minutes <= 0) return { keep: false, reason: "delta-invalido" };
  if (minutes > HOP.maxMinutes) return { keep: false, reason: "too-slow" };
  const from = cameraId(prev);
  const to = cameraId(next);
  if (from === to) return { keep: false, reason: "same-camera", minutes };
  const dist = haversineKm(prev, next);
  if (dist != null && dist < HOP.minKm) {
    return { keep: false, reason: "same-gps", minutes, km: dist };
  }
  if (minutes < HOP.minMinutes) {
    return { keep: false, reason: "too-fast", minutes, km: dist };
  }
  return { keep: true, minutes, km: dist };
}

export function isUsefulHop(prev, next) {
  return classifyHop(prev, next).keep;
}

function emptyDiscarded() {
  return { sameGps: 0, tooFast: 0, tooSlow: 0, sameCamera: 0, other: 0 };
}

function bumpDiscarded(discarded, reason) {
  if (reason === "same-gps") discarded.sameGps += 1;
  else if (reason === "too-fast") discarded.tooFast += 1;
  else if (reason === "too-slow") discarded.tooSlow += 1;
  else if (reason === "same-camera") discarded.sameCamera += 1;
  else discarded.other += 1;
}

function smoothDestinations(list) {
  const k = list.length;
  const n = list.reduce((a, d) => a + d.count, 0);
  const categories = k + 1;
  const pUnknown = n + NEXT_ALPHA * categories > 0 ? NEXT_ALPHA / (n + NEXT_ALPHA * categories) : 1;
  return list
    .map((d) => {
      const box = iqrStats(d.minutes);
      return {
        from: d.from,
        to: d.to,
        count: d.count,
        fromFeira: d.fromFeira,
        toFeira: d.toFeira,
        n: box.n,
        median: box.median,
        q25: box.q25,
        q75: box.q75,
        minutes: Math.round(box.median || 0),
        p: (d.count + NEXT_ALPHA) / (n + NEXT_ALPHA * categories),
        pUnknown,
      };
    })
    .sort((a, b) => b.count - a.count || b.p - a.p);
}

export function collectTransitions(sightings) {
  const rows = (sightings || []).filter((s) => s.placa);
  const byPlaca = new Map();
  for (const s of rows) {
    if (!byPlaca.has(s.placa)) byPlaca.set(s.placa, []);
    byPlaca.get(s.placa).push(s);
  }

  const transitionMap = new Map();
  const discarded = emptyDiscarded();

  for (const list of byPlaca.values()) {
    const ordered = [...list].sort(
      (a, b) => (asDate(a)?.getTime() || 0) - (asDate(b)?.getTime() || 0),
    );
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      const hop = classifyHop(prev, next);
      if (!hop.keep) {
        bumpDiscarded(discarded, hop.reason);
        continue;
      }
      const from = cameraId(prev);
      const to = cameraId(next);
      const key = `${from}||${to}`;
      if (!transitionMap.has(key)) {
        transitionMap.set(key, {
          from,
          to,
          count: 0,
          minutes: [],
          fromFeira: isFeiraCamera(prev),
          toFeira: isFeiraCamera(next),
        });
      }
      const tr = transitionMap.get(key);
      tr.count += 1;
      tr.minutes.push(hop.minutes);
      tr.fromFeira = tr.fromFeira || isFeiraCamera(prev);
      tr.toFeira = tr.toFeira || isFeiraCamera(next);
    }
  }

  const transitions = smoothDestinations([...transitionMap.values()]);
  discarded.total = discarded.sameGps + discarded.tooFast + discarded.tooSlow + discarded.sameCamera + discarded.other;

  const nextAfterFeira = {};
  for (const t of transitions.filter((x) => x.fromFeira)) {
    if (!nextAfterFeira[t.from] || t.count > nextAfterFeira[t.from].count) {
      nextAfterFeira[t.from] = t;
    }
  }

  return { transitions, nextAfterFeira, discarded, byPlaca };
}

export function buildRadarPayload(sightings) {
  const rows = (sightings || []).filter((s) => s.placa);
  const camerasMap = new Map();

  for (const s of rows) {
    const id = cameraId(s);
    if (!camerasMap.has(id)) {
      camerasMap.set(id, {
        id,
        name: s.camera || id,
        lat: s.lat,
        lon: s.lon,
        count: 0,
        feira: isFeiraCamera(s),
        plates: new Set(),
      });
    }
    const cam = camerasMap.get(id);
    cam.count += 1;
    cam.plates.add(s.placa);
    cam.feira = cam.feira || isFeiraCamera(s);
    if (cam.lat == null && s.lat != null) {
      cam.lat = s.lat;
      cam.lon = s.lon;
    }
  }

  const cameras = [...camerasMap.values()].map((c) => ({
    ...c,
    plates: c.plates.size,
  }));

  const { transitions, nextAfterFeira, discarded, byPlaca } = collectTransitions(rows);
  const plates = [];

  for (const [placa, list] of byPlaca) {
    const ordered = [...list].sort(
      (a, b) => (asDate(a)?.getTime() || 0) - (asDate(b)?.getTime() || 0),
    );
    const last = ordered.at(-1);
    const feiraHits = ordered.filter(isFeiraCamera);
    const lastFeira = feiraHits.at(-1);
    plates.push({
      placa,
      total: ordered.length,
      feira: feiraHits.length,
      lastCamera: last?.camera || "",
      lastRota: last?.rota || last?.faixa || "",
      lastIso: last?.iso || null,
      lastDataHora: last?.dataHora || "",
      lastLat: last?.lat ?? null,
      lastLon: last?.lon ?? null,
      lastOrigem: last?.origemRota || "",
      lastDestino: last?.destinoRota || "",
      last: last
        ? {
            placa,
            camera: last.camera,
            faixa: last.faixa,
            rota: last.rota,
            origemRota: last.origemRota,
            destinoRota: last.destinoRota,
            iso: last.iso,
            dataHora: last.dataHora,
            lat: last.lat,
            lon: last.lon,
            weekday: last.weekday,
            hour: last.hour,
          }
        : null,
      lastFeiraIso: lastFeira?.iso || null,
      proprietario: last?.proprietario || "",
      points: ordered
        .filter((s) => s.lat != null && s.lon != null)
        .map((s) => ({
          lat: s.lat,
          lon: s.lon,
          camera: s.camera,
          dataHora: s.dataHora,
          iso: s.iso,
          rota: s.rota || s.faixa || "",
          feira: isFeiraCamera(s),
        })),
    });
  }

  const sliced = transitions.slice(0, 80);
  plates.sort((a, b) => b.feira - a.feira || b.total - a.total);

  const feiraCameras = cameras.filter((c) => c.feira);
  const gpsPairs = [];
  for (const cam of cameras) {
    if (cam.lat == null) continue;
    cam.nearFeiraKm = feiraCameras
      .map((f) => haversineKm(cam, f))
      .filter((n) => n != null)
      .sort((a, b) => a - b)[0] ?? null;
    cam.porticoInvertido =
      !cam.feira && cam.nearFeiraKm != null && cam.nearFeiraKm < HOP.sameGpsKm;
    if (cam.porticoInvertido) {
      gpsPairs.push({ camera: cam.id, nearFeiraKm: cam.nearFeiraKm });
    }
  }

  const todayKey = new Date().toDateString();
  const todayRows = rows.filter((s) => asDate(s)?.toDateString() === todayKey);
  const todayFeira = todayRows.filter(isFeiraCamera);
  const hot = rows.filter((s) => {
    const d = asDate(s);
    return d && Date.now() - d.getTime() <= 2 * 60 * 60 * 1000 && isFeiraCamera(s);
  });

  const dates = rows.map(asDate).filter(Boolean).sort((a, b) => a - b);
  const camerasWithoutGps = cameras.filter((c) => c.lat == null || c.lon == null).length;

  return {
    meta: {
      sightings: rows.length,
      plates: plates.length,
      cameras: cameras.length,
      feiraCameras: feiraCameras.length,
      feiraOrigin: rows.filter(isFeiraCamera).length,
      today: todayFeira.length,
      todayCorridor: todayRows.length,
      hot: new Set(hot.map((s) => s.placa)).size,
      period: {
        from: dates[0]?.toISOString() || null,
        to: dates.at(-1)?.toISOString() || null,
      },
      definition: "origem Feira (isFeiraOrigin)",
    },
    quality: {
      n: rows.length,
      feiraOrigin: rows.filter(isFeiraCamera).length,
      period: {
        from: dates[0]?.toISOString() || null,
        to: dates.at(-1)?.toISOString() || null,
      },
      definition: "origem Feira (isFeiraOrigin)",
      camerasWithoutGps,
      sameGpsOpposite: gpsPairs,
      discardedHops: discarded,
      mixedNote:
        "Payload inclui o corredor (origem ou destino Feira) e as outras câmeras da mesma placa. GO só origem Feira.",
    },
    cameras: cameras.sort((a, b) => Number(b.feira) - Number(a.feira) || b.count - a.count),
    transitions: sliced,
    nextAfterFeira,
    plates,
    weekdays: countBy(rows.filter(isFeiraCamera), (s) => WEEKDAYS[s.weekday] || WEEKDAYS[asDate(s)?.getDay()] || "?"),
    hours: countHours(rows.filter(isFeiraCamera)),
  };
}

function countBy(rows, keyFn) {
  const map = new Map();
  for (const s of rows) {
    const k = keyFn(s) || "?";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}

function countHours(rows) {
  const hours = Array(24).fill(0);
  for (const s of rows) {
    const h = s.hour != null ? s.hour : asDate(s)?.getHours();
    if (h >= 0 && h < 24) hours[h] += 1;
  }
  return hours.map((count, hour) => ({ hour, count })).filter((x) => x.count);
}

export { WEEKDAYS };
