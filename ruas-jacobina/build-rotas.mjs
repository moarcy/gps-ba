/**
 * Monta a cobertura de ruas de Jacobina.
 * Saída e volta: Rua Alto Bonito, 262 (Leader).
 * Rode de novo com: node ruas-jacobina/build-rotas.mjs
 * Força novo download: node ruas-jacobina/build-rotas.mjs --refresh
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const cacheFile = path.join(root, "cache", "overpass.json");
const outFile = path.join(root, "..", "dashboard", "public", "jacobina", "cobertura.json");

const CASA = {
  lat: -11.1821498,
  lon: -40.5066646,
  endereco: "Rua Alto Bonito, 262 — Leader, Jacobina",
  nota: "O número 262 não está desenhado no mapa aberto da cidade. O pino fica na Rua Alto Bonito, no Leader.",
};
const KM_DIA = 30;
const URBAN_KM = 8;
const BBOX0 = { south: -11.245, west: -40.57, north: -11.135, east: -40.445 };

const HIGHWAYS =
  /^(motorway|trunk|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$/;

function hav(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLon = (bLon - aLon) * p;
  const la1 = aLat * p;
  const la2 = bLat * p;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nkey(lat, lon) {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function r5(n) {
  return Math.round(n * 1e5) / 1e5;
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

class MinHeap {
  constructor() {
    this.h = [];
  }
  get size() {
    return this.h.length;
  }
  push(pri, val) {
    const h = this.h;
    h.push([pri, val]);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop() {
    const h = this.h;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < h.length && h[l][0] < h[s][0]) s = l;
        if (r < h.length && h[r][0] < h[s][0]) s = r;
        if (s === i) break;
        [h[s], h[i]] = [h[i], h[s]];
        i = s;
      }
    }
    return top;
  }
}

function pathKm(coords) {
  let t = 0;
  for (let i = 1; i < coords.length; i++) t += hav(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  return t;
}

function appendCoords(out, coords) {
  for (const p of coords) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-7 && Math.abs(last[1] - p[1]) < 1e-7) continue;
    out.push(p);
  }
}

function heading(coords) {
  const a = coords[0];
  const b = coords[coords.length - 1];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function turnDelta(h1, h2) {
  let d = Math.abs(h1 - h2) * (180 / Math.PI);
  while (d > 180) d = 360 - d;
  return d;
}

function cleanName(value) {
  return String(value || "")
    .replace(/[\u00a0\u2000-\u200b]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "setor";
}

function skipWay(tags) {
  if (!tags) return true;
  if (tags.area === "yes") return true;
  if (tags.access === "private" || tags.access === "no") return true;
  if (tags.motor_vehicle === "no" || tags.motor_vehicle === "private") return true;
  const hw = tags.highway || "";
  if (hw === "service") {
    const s = tags.service || "";
    if (["driveway", "parking_aisle", "parking", "emergency"].includes(s)) return true;
    if (!tags.name) return true;
    return false;
  }
  return !HIGHWAYS.test(hw);
}

function onewayOf(tags) {
  const v = tags.oneway;
  if (v === "-1" || v === "reverse") return "reverse";
  if (v === "yes" || v === "1" || v === "true" || tags.junction === "roundabout") return "yes";
  return "no";
}

async function fetchOverpass(bbox) {
  const q = `[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"]["area"!~"yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["highway"="service"]["name"]["area"!~"yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["boundary"="administrative"]["admin_level"="10"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["place"~"^(suburb|neighbourhood|quarter)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["place"~"^(suburb|neighbourhood|quarter)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["place"~"^(suburb|neighbourhood|quarter)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;`;
  const urls = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  let lastErr;
  for (const url of urls) {
    try {
      console.log("baixando malha em", url);
      const res = await fetch(url, {
        method: "POST",
        body: q,
        headers: { "User-Agent": "GPS-BA-jacobina/1.0 (rota de cobertura local)" },
        signal: AbortSignal.timeout(200000),
      });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      const json = await res.json();
      if (!json.elements?.length) throw new Error("overpass sem elementos");
      return json;
    } catch (err) {
      lastErr = err;
      console.warn("falhou", url, err.message);
    }
  }
  throw lastErr;
}

function nearBorder(el, bbox) {
  const pts = el.geometry || [];
  for (const p of pts) {
    if (p.lat - bbox.south < 0.0018 || bbox.north - p.lat < 0.0018) return true;
    if (p.lon - bbox.west < 0.0018 || bbox.east - p.lon < 0.0018) return true;
  }
  return false;
}

async function loadRaw() {
  const refresh = process.argv.includes("--refresh");
  if (!refresh) {
    try {
      const txt = await readFile(cacheFile, "utf8");
      console.log("cache", cacheFile);
      return JSON.parse(txt);
    } catch {
      /* segue para download */
    }
  }
  const bbox = { ...BBOX0 };
  const json = await fetchOverpass(bbox);
  const borderWays = json.elements.filter((el) => el.type === "way" && el.tags?.highway && nearBorder(el, bbox));
  console.log("vias na borda do recorte", borderWays.length);
  json.bbox = bbox;
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(json));
  return json;
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function samePt(a, b) {
  return Math.abs(a[0] - b[0]) < 0.00012 && Math.abs(a[1] - b[1]) < 0.00012;
}

function assembleRings(lines) {
  const unused = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings = [];
  while (unused.length) {
    let ring = unused.pop();
    let guard = unused.length + 2;
    let grew = true;
    while (grew && guard-- > 0) {
      grew = false;
      for (let i = 0; i < unused.length; i++) {
        const line = unused[i];
        const a = ring[0];
        const b = ring[ring.length - 1];
        const c = line[0];
        const d = line[line.length - 1];
        if (samePt(b, c)) {
          ring = ring.concat(line.slice(1));
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (samePt(b, d)) {
          ring = ring.concat(line.slice(0, -1).reverse());
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (samePt(a, d)) {
          ring = line.concat(ring.slice(1));
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (samePt(a, c)) {
          const rev = line.slice().reverse();
          ring = rev.concat(ring.slice(1));
          unused.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][1] * ring[i][0] - ring[i][1] * ring[j][0];
  }
  return Math.abs(s / 2);
}

function extractZones(elements) {
  const polygons = [];
  const points = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const nome = tags.name;
    if (!nome) continue;
    if (el.type === "node" && /suburb|neighbourhood|quarter/.test(tags.place || "")) {
      points.push({ nome, lat: el.lat, lon: el.lon });
      continue;
    }
    if (el.type === "way" && tags.place && el.geometry?.length >= 4) {
      const ring = el.geometry.map((p) => [p.lat, p.lon]);
      if (samePt(ring[0], ring[ring.length - 1])) {
        polygons.push({ nome, rings: [ring], area: ringArea(ring) });
      }
      continue;
    }
    if (el.type !== "relation") continue;
    if (tags.admin_level && Number(tags.admin_level) < 10) continue;
    const lines = [];
    for (const m of el.members || []) {
      if (m.role === "inner" || !m.geometry?.length) continue;
      lines.push(m.geometry.map((p) => [p.lat, p.lon]));
    }
    const rings = assembleRings(lines);
    if (!rings.length) continue;
    const area = rings.reduce((s, r) => s + ringArea(r), 0);
    if (area <= 0) continue;
    polygons.push({ nome, rings, area });
  }
  polygons.sort((a, b) => a.area - b.area);
  return { polygons, points };
}

function buildEdges(elements) {
  const ways = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    if (skipWay(el.tags || {})) continue;
    const pts = [];
    for (const p of el.geometry) {
      const lat = r5(p.lat);
      const lon = r5(p.lon);
      const prev = pts[pts.length - 1];
      if (prev && prev[0] === lat && prev[1] === lon) continue;
      pts.push([lat, lon]);
    }
    if (pts.length < 2) continue;
    ways.push({ pts, tags: el.tags || {} });
  }

  const waysAt = new Map();
  ways.forEach((way, index) => {
    const seen = new Set();
    for (const p of way.pts) {
      const k = nkey(p[0], p[1]);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!waysAt.has(k)) waysAt.set(k, new Set());
      waysAt.get(k).add(index);
    }
  });

  const vertices = new Set();
  ways.forEach((way) => {
    vertices.add(nkey(way.pts[0][0], way.pts[0][1]));
    vertices.add(nkey(way.pts.at(-1)[0], way.pts.at(-1)[1]));
    for (const p of way.pts) {
      const k = nkey(p[0], p[1]);
      if ((waysAt.get(k)?.size || 0) >= 2) vertices.add(k);
    }
  });

  const edges = [];
  const nodes = new Map();
  const touchName = new Map();

  function remember(k, lat, lon, nome) {
    if (!nodes.has(k)) nodes.set(k, { lat, lon });
    if (nome && nome !== "Sem nome") {
      if (!touchName.has(k)) touchName.set(k, new Set());
      touchName.get(k).add(nome);
    }
  }

  for (const way of ways) {
    let nome = cleanName(way.tags.name || "Sem nome") || "Sem nome";
    let pts = way.pts;
    const ow = onewayOf(way.tags);
    if (ow === "reverse") pts = pts.slice().reverse();
    let bucket = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      bucket.push(pts[i]);
      const k = nkey(pts[i][0], pts[i][1]);
      if (i !== pts.length - 1 && !vertices.has(k)) continue;
      if (bucket.length >= 2) {
        const km = pathKm(bucket);
        if (km >= 0.004) {
          const a = nkey(bucket[0][0], bucket[0][1]);
          const b = nkey(bucket.at(-1)[0], bucket.at(-1)[1]);
          if (a !== b) {
            remember(a, bucket[0][0], bucket[0][1], nome);
            remember(b, bucket.at(-1)[0], bucket.at(-1)[1], nome);
            const coords = bucket.map((p) => [p[0], p[1]]);
            edges.push({
              id: edges.length,
              a,
              b,
              coords,
              rev: coords.slice().reverse(),
              km,
              nome,
              oneway: ow === "yes" || ow === "reverse",
              bairro: "setor",
              bairroNome: "Setor",
            });
          }
        }
      }
      bucket = [pts[i]];
    }
  }
  return { edges, nodes, touchName };
}

function clipUrban(edges) {
  const kept = [];
  for (const edge of edges) {
    const mid = edge.coords[Math.floor(edge.coords.length / 2)];
    if (hav(CASA.lat, CASA.lon, mid[0], mid[1]) > URBAN_KM) continue;
    edge.id = kept.length;
    kept.push(edge);
  }
  return kept;
}

function assignBairros(edges, zones) {
  const polys = zones.polygons.filter((poly) => poly.area > 0 && poly.area < 0.0012);
  const points = zones.points.filter((pt) => hav(CASA.lat, CASA.lon, pt.lat, pt.lon) <= URBAN_KM + 0.4);
  for (const edge of edges) {
    const mid = edge.coords[Math.floor(edge.coords.length / 2)];
    let chosen = null;
    for (const poly of polys) {
      if (poly.rings.some((ring) => pointInRing(mid[0], mid[1], ring))) {
        chosen = poly.nome;
        break;
      }
    }
    if (!chosen) {
      let best = Infinity;
      for (const pt of points) {
        const dist = hav(mid[0], mid[1], pt.lat, pt.lon);
        if (dist < best) {
          best = dist;
          chosen = pt.nome;
        }
      }
    }
    edge.bairroNome = cleanName(chosen || "Jacobina") || "Jacobina";
    edge.bairro = slug(edge.bairroNome);
  }
}

function buildAdj(edges) {
  const adj = new Map();
  const adjU = new Map();
  function add(map, arc) {
    if (!map.has(arc.from)) map.set(arc.from, []);
    map.get(arc.from).push(arc);
  }
  for (const e of edges) {
    const go = { from: e.a, to: e.b, km: e.km, coords: e.coords, edgeId: e.id, contra: false };
    const back = { from: e.b, to: e.a, km: e.km, coords: e.rev, edgeId: e.id, contra: e.oneway };
    add(adjU, go);
    add(adjU, back);
    add(adj, go);
    if (!e.oneway) add(adj, { ...back, contra: false });
  }
  return { adj, adjU };
}

function routeTo(adj, start, isGoal) {
  if (isGoal(start)) return { node: start, arcs: [] };
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push(0, start);
  while (heap.size) {
    const popped = heap.pop();
    const d = popped[0];
    const u = popped[1];
    if (d !== dist.get(u)) continue;
    if (u !== start && isGoal(u)) {
      const arcs = [];
      let cur = u;
      while (cur !== start) {
        const arc = prev.get(cur);
        if (!arc) return null;
        arcs.push(arc);
        cur = arc.from;
      }
      arcs.reverse();
      return { node: u, arcs };
    }
    const arcs = adj.get(u);
    if (!arcs) continue;
    for (const arc of arcs) {
      const nd = d + arc.km;
      if (nd < (dist.get(arc.to) ?? Infinity)) {
        dist.set(arc.to, nd);
        prev.set(arc.to, arc);
        heap.push(nd, arc.to);
      }
    }
  }
  return null;
}

function dijkstraAll(adj, start) {
  const dist = new Map([[start, 0]]);
  const heap = new MinHeap();
  heap.push(0, start);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d !== dist.get(u)) continue;
    const arcs = adj.get(u);
    if (!arcs) continue;
    for (const arc of arcs) {
      const nd = d + arc.km;
      if (nd < (dist.get(arc.to) ?? Infinity)) {
        dist.set(arc.to, nd);
        heap.push(nd, arc.to);
      }
    }
  }
  return dist;
}

function reverseAdj(adj) {
  const rev = new Map();
  for (const arcs of adj.values()) {
    for (const arc of arcs) {
      const back = {
        from: arc.to,
        to: arc.from,
        km: arc.km,
        coords: arc.coords.slice().reverse(),
        edgeId: arc.edgeId,
        contra: arc.contra,
      };
      if (!rev.has(back.from)) rev.set(back.from, []);
      rev.get(back.from).push(back);
    }
  }
  return rev;
}

function travel(adj, from, to, cache) {
  if (from === to) return { km: 0, arcs: [] };
  const key = `${from}>${to}`;
  if (cache.has(key)) return cache.get(key);
  const found = routeTo(adj, from, (n) => n === to);
  const result = found ? { km: found.arcs.reduce((s, a) => s + a.km, 0), arcs: found.arcs } : null;
  cache.set(key, result);
  return result;
}

function coverBairro(edgeIds, depot, edges, open, adj, adjU, nodes) {
  const depart = new Map();
  function allow(node, id) {
    if (!depart.has(node)) depart.set(node, new Set());
    depart.get(node).add(id);
  }
  function close(id) {
    if (!open.has(id)) return;
    open.delete(id);
    const e = edges[id];
    depart.get(e.a)?.delete(id);
    depart.get(e.b)?.delete(id);
  }
  for (const id of edgeIds) {
    if (!open.has(id)) continue;
    const e = edges[id];
    allow(e.a, id);
    if (!e.oneway) allow(e.b, id);
  }

  const pieces = [];
  let pos = depot;
  let prev = null;
  let guard = edgeIds.length * 4 + 20;
  const mine = new Set(edgeIds);

  function claimArc(arc) {
    const segId = mine.has(arc.edgeId) && open.has(arc.edgeId) ? arc.edgeId : null;
    if (segId != null) close(segId);
    const e = edges[arc.edgeId];
    const piece = {
      segId,
      from: arc.from,
      to: arc.to,
      km: arc.km,
      coords: arc.coords,
      nome: e?.nome || "Sem nome",
      bairro: e?.bairroNome || "",
      contra: Boolean(arc.contra),
      dead: segId == null,
    };
    pieces.push(piece);
    prev = piece;
    pos = arc.to;
  }

  function pick(node) {
    const ids = depart.get(node);
    if (!ids || !ids.size) return null;
    let best = null;
    let bestScore = Infinity;
    for (const id of ids) {
      if (!open.has(id)) continue;
      const e = edges[id];
      const dir = node === e.a ? { to: e.b, coords: e.coords } : !e.oneway && node === e.b ? { to: e.a, coords: e.rev } : null;
      if (!dir) continue;
      let score = 0;
      if (prev && prev.nome === e.nome && e.nome !== "Sem nome") score -= 50;
      if (prev?.coords) score += turnDelta(heading(prev.coords), heading(dir.coords)) / 180;
      if (score < bestScore) {
        bestScore = score;
        best = { id, ...dir, km: e.km, nome: e.nome };
      }
    }
    return best;
  }

  const hasWorkAt = (node) => (depart.get(node)?.size || 0) > 0;
  if (!hasWorkAt(pos)) {
    const entry = routeTo(adj, pos, hasWorkAt) || routeTo(adjU, pos, hasWorkAt);
    if (entry) pos = entry.node;
  }

  while (guard-- > 0) {
    let progressed = false;
    let local = pick(pos);
    while (local) {
      claimArc({
        from: pos,
        to: local.to,
        km: local.km,
        coords: local.coords,
        edgeId: local.id,
        contra: false,
      });
      progressed = true;
      local = pick(pos);
    }
    if (![...depart.values()].some((set) => set.size)) break;

    const hasWork = (node) => (depart.get(node)?.size || 0) > 0;
    let found = routeTo(adj, pos, hasWork);
    if (!found) found = routeTo(adjU, pos, hasWork);
    if (found) {
      if (!found.arcs.length) {
        const id = [...(depart.get(pos) || [])].find((edgeId) => open.has(edgeId));
        if (id == null) break;
        const e = edges[id];
        const forward = pos === e.a;
        claimArc({
          from: pos,
          to: forward ? e.b : e.a,
          km: e.km,
          coords: forward ? e.coords : e.rev,
          edgeId: id,
          contra: !forward && e.oneway,
        });
      } else {
        for (const arc of found.arcs) claimArc(arc);
      }
      progressed = true;
      continue;
    }

    let orphan = null;
    for (const set of depart.values()) {
      for (const id of set) {
        orphan = id;
        break;
      }
      if (orphan != null) break;
    }
    if (orphan == null) break;
    const e = edges[orphan];
    const target = nodes.get(e.a);
    const here = nodes.get(pos);
    pieces.push({
      segId: null,
      from: pos,
      to: e.a,
      km: here && target ? hav(here.lat, here.lon, target.lat, target.lon) : 0,
      coords: here && target ? [[here.lat, here.lon], [target.lat, target.lon]] : [],
      nome: "",
      bairro: "",
      contra: false,
      dead: true,
      teleport: true,
    });
    pos = e.a;
    prev = null;
    progressed = true;
    if (!progressed) break;
  }

  return pieces;
}

function splitPieces(pieces, depot, distFrom, distTo, nodes) {
  const slices = [];
  let i = 0;
  const fallback = (node) => {
    const n = nodes.get(node);
    const d = nodes.get(depot);
    if (!n || !d) return 2;
    return hav(d.lat, d.lon, n.lat, n.lon) * 1.35;
  };
  while (i < pieces.length) {
    const go0 = distFrom.get(pieces[i].from) ?? fallback(pieces[i].from);
    let acc = 0;
    let j = i;
    while (j < pieces.length) {
      const next = acc + pieces[j].km;
      const back = distTo.get(pieces[j].to) ?? fallback(pieces[j].to);
      const total = go0 + next + back;
      if (j > i && total > KM_DIA) break;
      acc = next;
      j += 1;
      if (total > KM_DIA) break;
    }
    if (j === i) j = i + 1;
    slices.push(pieces.slice(i, j));
    i = j;
  }
  return slices.filter((s) => s.some((p) => p.segId != null));
}

function simplify(coords) {
  const out = [];
  for (const p of coords) {
    const q = [r5(p[0]), r5(p[1])];
    const last = out[out.length - 1];
    if (!last) {
      out.push(q);
      continue;
    }
    if (hav(last[0], last[1], q[0], q[1]) < 0.012) continue;
    out.push(q);
  }
  if (coords.length) {
    const end = coords[coords.length - 1];
    const q = [r5(end[0]), r5(end[1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
}

function chunkStops(stops) {
  const clean = [];
  for (const s of stops) {
    const q = [r5(s[0]), r5(s[1])];
    const last = clean[clean.length - 1];
    if (last && hav(last[0], last[1], q[0], q[1]) < 0.03) continue;
    clean.push(q);
  }
  if (clean.length < 2) return [];
  const trechos = [];
  let i = 0;
  while (i < clean.length - 1) {
    const end = Math.min(i + 9, clean.length - 1);
    trechos.push({
      de: clean[i],
      ate: clean[end],
      via: clean.slice(i + 1, end),
    });
    if (end <= i) break;
    i = end;
  }
  return trechos;
}

function sampleRoute(coords, stepKm) {
  if (coords.length < 2) return coords.map((p) => [p[0], p[1]]);
  const out = [[coords[0][0], coords[0][1]]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += hav(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    if (acc >= stepKm) {
      out.push([coords[i][0], coords[i][1]]);
      acc = 0;
    }
  }
  const end = coords[coords.length - 1];
  const last = out[out.length - 1];
  if (last[0] !== end[0] || last[1] !== end[1]) out.push([end[0], end[1]]);
  return out;
}

function materializeDay(slices, depot, adj, casa, edges, cache) {
  const pieces = [];
  for (let s = 0; s < slices.length; s++) {
    if (s > 0) {
      const link = travel(adj, slices[s - 1].at(-1).to, slices[s][0].from, cache);
      if (link) for (const arc of link.arcs) pieces.push({ ...arcPiece(arc, edges), dead: true, segId: null });
    }
    pieces.push(...slices[s]);
  }
  if (!pieces.length) return null;
  const go = travel(adj, depot, pieces[0].from, cache);
  const back = travel(adj, pieces.at(-1).to, depot, cache);
  const trilha = [[casa.lat, casa.lon]];
  if (go) for (const arc of go.arcs) appendCoords(trilha, arc.coords);
  for (const p of pieces) appendCoords(trilha, p.coords);
  if (back) for (const arc of back.arcs) appendCoords(trilha, arc.coords);
  trilha.push([casa.lat, casa.lon]);

  const covered = [];
  const seen = new Set();
  for (const p of pieces) {
    if (p.segId == null || seen.has(p.segId)) continue;
    seen.add(p.segId);
    covered.push(p.segId);
  }
  const kmRuas = covered.reduce((s, id) => s + edges[id].km, 0);
  const km = (go?.km || 0) + pieces.reduce((s, p) => s + p.km, 0) + (back?.km || 0);
  const contra = pieces.some((p) => p.contra && p.segId != null);

  const stops = sampleRoute(trilha, 0.3);
  return { covered, kmRuas, km, contra, trilha: simplify(trilha), trechos: chunkStops(stops) };
}

function arcPiece(arc, edges) {
  const e = edges[arc.edgeId];
  return {
    segId: null,
    from: arc.from,
    to: arc.to,
    km: arc.km,
    coords: arc.coords,
    nome: e?.nome || "",
    bairro: e?.bairroNome || "",
    contra: Boolean(arc.contra),
    dead: true,
  };
}

function snapDepot(nodes, touchName) {
  let best = null;
  let bestD = Infinity;
  for (const [k, n] of nodes) {
    let d = hav(CASA.lat, CASA.lon, n.lat, n.lon);
    const names = touchName.get(k);
    if ([...(names || [])].some((name) => /alto bonito/i.test(name))) d -= 0.2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function selfTest() {
  const edges = [];
  const nodes = new Map();
  const coords = [
    [-11.18, -40.51],
    [-11.18, -40.509],
    [-11.181, -40.509],
    [-11.181, -40.51],
  ];
  coords.forEach((c, i) => nodes.set(String(i), { lat: c[0], lon: c[1] }));
  for (let i = 0; i < 4; i++) {
    const a = String(i);
    const b = String((i + 1) % 4);
    const line = [coords[i], coords[(i + 1) % 4]];
    edges.push({
      id: i,
      a,
      b,
      coords: line,
      rev: line.slice().reverse(),
      km: 0.12,
      nome: `Rua ${i}`,
      oneway: false,
      bairro: "teste",
      bairroNome: "Teste",
    });
  }
  const { adj, adjU } = buildAdj(edges);
  const open = new Set(edges.map((e) => e.id));
  const pieces = coverBairro([0, 1, 2, 3], "0", edges, open, adj, adjU, nodes);
  const got = new Set(pieces.filter((p) => p.segId != null).map((p) => p.segId));
  if (got.size !== 4 || open.size !== 0) {
    throw new Error(`teste da rota falhou: cobertas ${got.size}, abertas ${open.size}`);
  }
  console.log("teste da rota ok");
}

function plan(edges, nodes, touchName) {
  const { adj, adjU } = buildAdj(edges);
  const depot = snapDepot(nodes, touchName);
  if (!depot) throw new Error("não achei um cruzamento perto da casa");
  const depotNode = nodes.get(depot);
  console.log("depot", depot, `${depotNode.lat}, ${depotNode.lon}`);

  const distFrom = dijkstraAll(adj, depot);
  const distTo = dijkstraAll(reverseAdj(adj), depot);
  const open = new Set(edges.map((e) => e.id));
  const byBairro = new Map();
  for (const e of edges) {
    if (!byBairro.has(e.bairro)) byBairro.set(e.bairro, { id: e.bairro, nome: e.bairroNome, ids: [], lat: 0, lon: 0, km: 0 });
    const b = byBairro.get(e.bairro);
    b.ids.push(e.id);
    const mid = e.coords[Math.floor(e.coords.length / 2)];
    b.lat += mid[0] * e.km;
    b.lon += mid[1] * e.km;
    b.km += e.km;
  }
  const ordem = [...byBairro.values()].sort((a, b) => {
    const da = hav(CASA.lat, CASA.lon, a.lat / a.km, a.lon / a.km);
    const db = hav(CASA.lat, CASA.lon, b.lat / b.km, b.lon / b.km);
    return da - db;
  });

  const cache = new Map();
  const blocks = [];
  for (const bairro of ordem) {
    const ids = bairro.ids.filter((id) => open.has(id));
    if (!ids.length) continue;
    const pieces = coverBairro(ids, depot, edges, open, adj, adjU, nodes);
    blocks.push(...splitPieces(pieces, depot, distFrom, distTo, nodes));
    console.log(bairro.nome, "blocos", blocks.length, "faltam", open.size);
  }
  for (const id of [...open]) {
    const edge = edges[id];
    open.delete(id);
    blocks.push([{
      segId: id,
      from: edge.a,
      to: edge.b,
      km: edge.km,
      coords: edge.coords,
      nome: edge.nome,
      bairro: edge.bairroNome,
      contra: false,
      dead: false,
    }]);
  }

  const dias = [];
  let group = [];
  let groupKm = 0;
  const flush = () => {
    if (!group.length) return;
    const day = materializeDay(group, depot, adj, CASA, edges, cache);
    if (day?.covered.length) dias.push(day);
    group = [];
    groupKm = 0;
  };
  for (const block of blocks) {
    const blockKm = block.reduce((sum, piece) => sum + piece.km, 0);
    if (!group.length) {
      group = [block];
      groupKm = blockKm;
      continue;
    }
    const link = travel(adj, group.at(-1).at(-1).to, block[0].from, cache);
    const go = distFrom.get(group[0][0].from);
    const back = distTo.get(block.at(-1).to);
    const total = (go ?? Infinity) + groupKm + (link?.km ?? Infinity) + blockKm + (back ?? Infinity);
    if (link && total <= KM_DIA) {
      group.push(block);
      groupKm += link.km + blockKm;
    } else {
      flush();
      group = [block];
      groupKm = blockKm;
    }
  }
  flush();

  return { dias, depot, distFrom };
}

function publish(edges, dias) {
  const segMeta = edges.map((e) => ({
    id: `s${e.id}`,
    bairro: e.bairro,
    nome: e.nome,
    km: r3(e.km),
    mao: e.oneway,
    coords: e.coords.map((p) => [r5(p[0]), r5(p[1])]),
  }));

  const bairroRoll = new Map();
  const diasOut = dias.map((day, index) => {
    const ruasMap = new Map();
    for (const id of day.covered) {
      const e = edges[id];
      if (!bairroRoll.has(e.bairro)) {
        bairroRoll.set(e.bairro, { id: e.bairro, nome: e.bairroNome, km: 0, segmentos: 0 });
      }
      const roll = bairroRoll.get(e.bairro);
      roll.km += e.km;
      roll.segmentos += 1;
      const key = e.nome;
      if (!ruasMap.has(key)) ruasMap.set(key, { nome: key, km: 0, ids: [], mao: false });
      const rua = ruasMap.get(key);
      rua.km += e.km;
      rua.ids.push(`s${id}`);
      rua.mao = rua.mao || e.oneway;
    }
    const nomes = [];
    for (const id of day.covered) {
      const nome = edges[id].bairroNome;
      if (!nomes.includes(nome)) nomes.push(nome);
    }
    const titulo = nomes.length <= 3 ? nomes.join(" · ") : `${nomes.slice(0, 2).join(" · ")} + ${nomes.length - 2}`;
    return {
      id: `d${index + 1}`,
      ordem: index + 1,
      bairros: nomes,
      titulo,
      km: r2(day.km),
      kmRuas: r2(day.kmRuas),
      curto: day.km < 16,
      contra: Boolean(day.contra),
      segmentos: day.covered.map((id) => `s${id}`),
      ruas: [...ruasMap.values()]
        .map((r) => ({ ...r, km: r2(r.km) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      trilha: day.trilha,
      trechos: day.trechos,
    };
  });

  for (const dia of diasOut) {
    for (const nome of dia.bairros) {
      const found = [...bairroRoll.values()].find((b) => b.nome === nome);
      if (found) found.dias = (found.dias || 0) + (dia.bairros.length === 1 ? 1 : 1 / dia.bairros.length);
    }
  }

  const kmTotal = segMeta.reduce((s, e) => s + e.km, 0);
  const payload = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    cidade: "Jacobina",
    kmPorDia: KM_DIA,
    casa: CASA,
    totais: {
      km: r2(kmTotal),
      segmentos: segMeta.length,
      ruas: new Set(segMeta.map((s) => s.nome).filter((n) => n !== "Sem nome")).size,
      dias: diasOut.length,
      bairros: bairroRoll.size,
    },
    bairros: [...bairroRoll.values()]
      .map((b) => ({ ...b, km: r2(b.km), dias: Math.max(1, Math.round(b.dias || 1)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    segmentos: segMeta,
    dias: diasOut,
  };

  const seen = new Map();
  for (const dia of diasOut) {
    for (const id of dia.segmentos) seen.set(id, (seen.get(id) || 0) + 1);
  }
  const missing = segMeta.filter((s) => !seen.has(s.id)).length;
  const dup = [...seen.values()].filter((n) => n > 1).length;
  if (missing || dup) throw new Error(`cobertura incompleta: faltam ${missing}, duplicados ${dup}`);
  return payload;
}

async function main() {
  selfTest();
  const raw = await loadRaw();
  console.log("elementos", raw.elements.length);
  const built = buildEdges(raw.elements);
  const edges = clipUrban(built.edges);
  const { nodes, touchName } = built;
  console.log("trechos na cidade", edges.length, "de", built.edges.length);
  const zones = extractZones(raw.elements);
  console.log("polígonos", zones.polygons.length, "pontos", zones.points.length, zones.polygons.map((p) => p.nome).slice(0, 30));
  assignBairros(edges, zones);
  const km = edges.reduce((s, e) => s + e.km, 0);
  console.log("km de rua", km.toFixed(1));
  const { dias } = plan(edges, nodes, touchName);
  const payload = publish(edges, dias);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(payload));
  console.log("gravado", outFile);
  console.log(payload.totais);
  console.log(
    "primeiros dias:",
    payload.dias.slice(0, 8).map((d) => `${d.id} ${d.titulo} ${d.km}km ${d.ruas.length} ruas`).join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
