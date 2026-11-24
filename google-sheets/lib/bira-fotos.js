import fs from "node:fs";
import path from "node:path";

const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

// Leitura da foto com 1/I ou 0/O. A lista usa a placa válida.
const ALIAS = {
  PL01E09: "PLO1E09",
  PK10A05: "PKI0A05",
};

const DEFAULT_FOTOS = "C:\\Users\\moarc\\AppData\\Local\\Temp\\bira-all";
const DEFAULT_LIDAS = "C:\\Users\\moarc\\AppData\\Local\\Temp\\bira-chat\\lidas";

let indexCache = null;

function fotosDir() {
  return process.env.BIRA_FOTOS_DIR || DEFAULT_FOTOS;
}

function lidasDir() {
  return process.env.BIRA_LIDAS_DIR || DEFAULT_LIDAS;
}

function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8").slice(1);
  }
  if (buf.length > 8 && buf[1] === 0 && buf[3] === 0) return buf.toString("utf16le");
  return buf.toString("utf8");
}

function normPlaca(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function textoFoto(row) {
  return `${row.veiculo || ""} ${row.nota || ""}`.toLowerCase();
}

function fotoDeApreensao(row) {
  return /guincho|cegonha|apreend|p[aá]tio|\bauto\b|\bato\b|deposit[aá]rio/.test(textoFoto(row));
}

function score(row) {
  if (fotoDeApreensao(row)) return -1;
  const certeza = String(row.certeza || "").toLowerCase();
  let points = certeza === "alta" ? 20 : certeza === "baixa" ? 4 : 0;
  const veiculo = textoFoto(row);
  if (/print|documento|mandado|email|fachada/.test(veiculo)) points += 1;
  else if (veiculo && veiculo !== "nenhuma") points += 10;
  return points;
}

export function loadFotoIndex() {
  if (indexCache) return indexCache;
  const map = new Map();
  const lidas = lidasDir();
  const fotos = fotosDir();
  if (!fs.existsSync(lidas) || !fs.existsSync(fotos)) {
    indexCache = map;
    return map;
  }
  const apreendidas = new Set();
  const candidatos = [];
  for (const name of fs.readdirSync(lidas)) {
    if (!name.endsWith(".jsonl")) continue;
    const text = decode(fs.readFileSync(path.join(lidas, name)));
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      let row;
      try {
        row = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const raw = normPlaca(row.placa);
      if (!raw) continue;
      const keys = [];
      if (PLACA.test(raw)) keys.push(raw);
      if (ALIAS[raw] && PLACA.test(ALIAS[raw])) keys.push(ALIAS[raw]);
      if (!keys.length) continue;
      if (fotoDeApreensao(row)) {
        for (const key of keys) apreendidas.add(key);
        continue;
      }
      const arquivo = path.basename(String(row.arquivo || ""));
      if (!arquivo || !fs.existsSync(path.join(fotos, arquivo))) continue;
      candidatos.push({ keys, arquivo, score: score(row) });
    }
  }
  for (const item of candidatos) {
    if (item.score < 0) continue;
    for (const key of item.keys) {
      if (apreendidas.has(key)) continue;
      const prev = map.get(key);
      if (!prev || item.score > prev.score) {
        map.set(key, { arquivo: item.arquivo, score: item.score });
      }
    }
  }
  indexCache = map;
  return map;
}

export function fotoArquivo(placa) {
  const hit = loadFotoIndex().get(normPlaca(placa));
  if (!hit) return null;
  const root = path.resolve(fotosDir());
  const resolved = path.resolve(root, hit.arquivo);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function attachFotos(payload, apreendidas = new Set()) {
  if (!payload?.dias) return payload;
  const known = loadFotoIndex();
  if (!known.size && !apreendidas.size) return payload;
  let changed = false;
  const dias = payload.dias.map((dia) => {
    let touched = false;
    const items = dia.items.map((it) => {
      if (apreendidas.has(it.placa) || !known.has(it.placa)) {
        if (!it.temFoto) return it;
        touched = true;
        changed = true;
        const next = { ...it };
        delete next.temFoto;
        return next;
      }
      if (it.temFoto) return it;
      touched = true;
      changed = true;
      return { ...it, temFoto: true };
    });
    return touched ? { ...dia, items } : dia;
  });
  if (!changed) return payload;
  return { ...payload, dias, lotes: dias };
}
