const M_LAT = 111320;

export function metros(aLat, aLon, bLat, bLon) {
  const lat0 = ((aLat + bLat) / 2) * (Math.PI / 180);
  const y = (bLat - aLat) * M_LAT;
  const x = (bLon - aLon) * M_LAT * Math.cos(lat0);
  return Math.hypot(x, y);
}

function pontoNoSegmento(lat, lon, a, b) {
  const lat0 = lat * (Math.PI / 180);
  const mLon = M_LAT * Math.cos(lat0);
  const ax = a[1] * mLon;
  const ay = a[0] * M_LAT;
  const bx = b[1] * mLon;
  const by = b[0] * M_LAT;
  const px = lon * mLon;
  const py = lat * M_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { dist: Math.hypot(px - x, py - y), t };
}

export function projetar(lat, lon, coords) {
  if (!coords || coords.length < 2) return null;
  let best = Infinity;
  let along = 0;
  let acc = 0;
  let total = 0;
  const lens = [];
  for (let i = 1; i < coords.length; i++) {
    const len = metros(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    lens.push(len);
    total += len;
  }
  for (let i = 1; i < coords.length; i++) {
    const hit = pontoNoSegmento(lat, lon, coords[i - 1], coords[i]);
    if (hit.dist < best) {
      best = hit.dist;
      along = total > 0 ? (acc + hit.t * lens[i - 1]) / total : 0;
    }
    acc += lens[i - 1];
  }
  return { dist: best, t: along };
}

export function deveMarcar(registro, segKm, dist) {
  if (!registro || registro.n < 2) return false;
  const span = registro.max - registro.min;
  if (span >= 0.32) return true;
  return segKm <= 0.055 && span >= 0.2 && dist < 20;
}

export function limiteMetros(accuracy) {
  if (accuracy == null || Number.isNaN(accuracy)) return 32;
  return Math.min(38, Math.max(24, accuracy + 14));
}
