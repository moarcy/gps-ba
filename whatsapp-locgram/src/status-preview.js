import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCrmData } from "../../google-sheets/lib/crm-service.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, "..", "google-sheets", ".env") });
const listFile = path.join(root, "..", "mensagens-assessorias-amanha.txt");
const outDir = path.join(root, "..", "google-sheets", ".cache");
const outTxt = path.join(outDir, "whatsapp-status-preview.txt");
const outJson = path.join(outDir, "whatsapp-plate-logs.json");

const PLATE = /\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/gi;
const PLATE_ONE = /\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/i;

const RULES = [
  [/outro loc|loc atuando|localizado com outro|j[aá] tem (outro )?localizador|j[aá] tem loc\b|quitad|contrato liquidado|contrato baixado|processo extinto|\bpago\b|\bem acordo\b|cliente fez acordo/i, "cancelado", "Cancelado", 90],
  [/apreendid[oa]\b|j[aá] foi apreendido/i, "apreendido", "Apreendido", 80],
  [/est[aá] no p[aá]tio|entrada no p[aá]tio|\bno p[aá]tio\b/i, "no_patio", "No pátio", 70],
  [/mandado (foi )?expedido|mdd expedido|expediu o mandado|(?<!sem )(?<!n[aã]o tem )mandado ativo|mdd ativo|mdd com oficial|mdd para\b|(?<!n[aã]o )tem mandado ativo|(?<!n[aã]o )esse tem mandado/i, "com_mandado", "Com mandado", 60],
  [/n[aã]o (podemos|d[aá])( mais)? apreender|invi[aá]vel|n[aã]o apto|\binapto\b|mandado negativo|mdd negativo/i, "inapto", "Inapto", 50],
  [/temporariamente inapto|temporari|indispon[ií]vel/i, "indisponivel_temp", "Indisponível temp.", 40],
  [/aguardando (o |a )?(mandado|liminar|mdd|bo)|mandado solicitado|mdd solicitado|novo mandado solicitado|pedir (um |o )?(novo )?mandado|solicitar (um |o )?(novo )?mandado|sem mandado|sem liminar|falta (o |de )?mandado|sem bo|n[aã]o v[aã]o fazer bo|ainda sem liminar|n[aã]o tem mandado|pedir (um |o )?requerimento|\bem aberto\b|(?<!se j[aá] )(?<!sem )(?<!n[aã]o )tem liminar|(?<!sem )liminar deferida/i, "aguardando_mandado", "Aguardando mandado", 30],
];

function classify(phrase) {
  const text = String(phrase || "").trim();
  if (text.length < 6) return null;
  if (/\?/.test(text)) return null;
  if (/nova ocorr[eê]ncia/i.test(text)) return null;
  if (/indispon[ií]vel no momento|estava indispon[ií]vel/i.test(text)) return null;
  if (/vou solicitar|agilizar (o |esse )?mandado|tentar expedir|expedir o mandado|v(ou|amos) ver se|ver se j[aá] tem/i.test(text)) return null;
  if (/aguardando a (resposta|reposta)|se j[aá] tem (outro )?localizador/i.test(text)) return null;
  let best = null;
  for (const [pattern, status, label, rank] of RULES) {
    if (!pattern.test(text)) continue;
    if (!best || rank > best.rank) best = { status, label, rank };
  }
  return best ? { status: best.status, label: best.label } : null;
}

function bareAberto(text) {
  return /\bem aberto\b/i.test(text) && !/mandado|liminar|mdd|requerimento|sem bo|localizador|\bloc\b/i.test(text);
}

function clauses(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  const marks = [...flat.toUpperCase().matchAll(/\b([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})\b/g)];
  return marks.map((mark, index) => {
    const forwardEnd = marks[index + 1] ? marks[index + 1].index : Math.min(flat.length, mark.index + 220);
    const back = index === 0 ? Math.max(0, mark.index - 120) : mark.index;
    return { placa: mark[1], phrase: flat.slice(back, forwardEnd).trim() };
  });
}

function parseList(text) {
  const plates = new Map();
  let office = "";
  for (const raw of text.split(/\r?\n/)) {
    const header = raw.match(/^\d{2}\s{2,}(.+?)\s+\|/);
    if (header) {
      office = header[1].trim();
      continue;
    }
    const found = [...raw.matchAll(PLATE)];
    if (!found.length) continue;
    for (const hit of found) {
      const placa = hit[1].toUpperCase();
      const after = raw.slice(hit.index + hit[1].length).replace(/^\s*[-–—:]\s*/, "").trim();
      const note = after.replace(/\s*\[Outras.*$/i, "").trim();
      if (!plates.has(placa)) {
        plates.set(placa, { placa, office, note });
      }
    }
  }
  return plates;
}

function psqlCopy(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "gpsba_evolution_postgres",
      "psql",
      "-U",
      "evolution",
      "-d",
      "evolution_db",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 },
  );
}

function csvField(value) {
  let out = "";
  let i = 0;
  if (value[i] === '"') i += 1;
  for (; i < value.length; i++) {
    if (value[i] === '"') {
      if (value[i + 1] === '"') {
        out += '"';
        i += 1;
        continue;
      }
      return { value: out, rest: value.slice(i + 1) };
    }
    out += value[i];
  }
  return { value: out, rest: "" };
}

function parseCsvLine(line) {
  const fields = [];
  let rest = line;
  while (rest) {
    if (rest[0] === ",") rest = rest.slice(1);
    const next = csvField(rest);
    fields.push(next.value);
    rest = next.rest;
  }
  return fields;
}

function loadMessages() {
  const body = `regexp_replace(COALESCE(
      message->>'conversation',
      message->'extendedTextMessage'->>'text',
      message->'imageMessage'->>'caption',
      message->'documentMessage'->>'caption',
      message->'videoMessage'->>'caption',
      ''
    ), '[[:cntrl:]]', ' ', 'g')`;
  const sql = `
SET search_path TO evolution_api;
COPY (
  SELECT "messageTimestamp"::text,
         COALESCE(key->>'remoteJid', ''),
         CASE WHEN COALESCE(key->>'fromMe', 'false') = 'true' THEN 'true' ELSE 'false' END,
         left(${body}, 2000)
  FROM "Message"
  WHERE length(btrim(${body})) > 0
  ORDER BY 2, 1
) TO STDOUT WITH (FORMAT csv, FORCE_QUOTE *);
`;
  const out = [];
  for (const line of psqlCopy(sql).split(/\n/)) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed || trimmed.startsWith("SET") || !trimmed.startsWith('"')) continue;
    const [ts, jid, fromMe, text] = parseCsvLine(trimmed);
    if (!text) continue;
    out.push({ ts, jid, fromMe: fromMe === "true", text });
  }
  return out;
}

function isoFromTs(ts) {
  const n = Number(ts);
  if (!n) return "";
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function stamp(ts) {
  const iso = isoFromTs(ts);
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia" });
}

function worthLogging(phrase, placa) {
  if (/detalhes e outras informa|entre em contato com o escrit[oó]rio|nova ocorr[eê]ncia/i.test(phrase)) {
    return false;
  }
  if (classify(phrase)) return true;
  const rest = phrase.replace(new RegExp(placa, "i"), "").replace(/[^A-Za-zÀ-ú0-9]/g, "");
  if (/^(porgentileza|obrigad[oa]|bomdia|boatarde|boanoite)+$/i.test(rest)) return false;
  return rest.length >= 12;
}

async function plateUniverse() {
  const plates = parseList(fs.readFileSync(listFile, "utf8"));
  const data = await getCrmData();
  let fromCrm = 0;
  for (const item of data.pipeline || []) {
    const placa = String(item.placa || "").trim().toUpperCase();
    if (!PLATE_ONE.test(placa)) continue;
    fromCrm += 1;
    const current = plates.get(placa);
    if (current) {
      current.crmStatus = item.status || "";
      if (!current.office) current.office = String(item.assessoria || "").trim();
      continue;
    }
    plates.set(placa, {
      placa,
      office: String(item.assessoria || "").trim(),
      note: "",
      crmStatus: item.status || "",
    });
  }
  return { plates, fromCrm };
}

function remember(placa) {
  if (plates.has(placa)) return;
  plates.set(placa, { placa, office: "", note: "", crmStatus: "" });
}

function pushEvent(placa, event) {
  if (!logs.has(placa)) logs.set(placa, []);
  logs.get(placa).push(event);
}

function noteIso(note) {
  const match = String(note || "").match(/(\d{2})\/(\d{2})/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const year = month > 11 || (month === 11 && day > 2) ? 2025 : 2026;
  return new Date(Date.UTC(year, month - 1, day, 15, 0, 0)).toISOString();
}

const { plates, fromCrm } = await plateUniverse();
const messages = loadMessages();
const logs = new Map();
const byChat = new Map();
for (const msg of messages) {
  if (!byChat.has(msg.jid)) byChat.set(msg.jid, []);
  byChat.get(msg.jid).push(msg);
}

let inherited = 0;
for (const list of byChat.values()) {
  let open = null;
  for (const msg of list) {
    if (/\bexemplo\s*:/i.test(msg.text)) continue;
    const found = [];
    const seen = new Set();
    for (const clause of clauses(msg.text)) {
      if (seen.has(clause.placa)) continue;
      seen.add(clause.placa);
      found.push(clause);
    }
    for (const clause of found) {
      const suggestion = classify(clause.phrase);
      if (!plates.has(clause.placa) && (!suggestion || bareAberto(clause.phrase))) continue;
      if (!worthLogging(clause.phrase, clause.placa)) continue;
      remember(clause.placa);
      pushEvent(clause.placa, {
        ts: Number(msg.ts) || 0,
        iso: isoFromTs(msg.ts),
        fromMe: Boolean(msg.fromMe),
        phrase: clause.phrase.slice(0, 240),
        status: suggestion?.status || "",
        label: suggestion?.label || "",
        source: "mensagem",
      });
    }
    const ts = Number(msg.ts) || 0;
    if (found.length === 1) {
      open = { placa: found[0].placa, ts, gap: 0 };
      continue;
    }
    if (found.length > 1) {
      open = null;
      continue;
    }
    if (!open) continue;
    const limit = open.ts > 1e12 ? 36 * 3600 * 1000 : 36 * 3600;
    if (ts - open.ts > limit || open.gap >= 15) {
      open = null;
      continue;
    }
    open.gap += 1;
    if (msg.text.length > 220) continue;
    const suggestion = classify(msg.text);
    if (!suggestion) continue;
    if (bareAberto(msg.text) && !plates.has(open.placa)) continue;
    remember(open.placa);
    pushEvent(open.placa, {
      ts,
      iso: isoFromTs(msg.ts),
      fromMe: Boolean(msg.fromMe),
      phrase: msg.text.slice(0, 240),
      status: suggestion.status,
      label: suggestion.label,
      source: "resposta",
    });
    inherited += 1;
  }
}

let fromList = 0;
for (const item of plates.values()) {
  const suggestion = classify(item.note);
  if (!suggestion) continue;
  const events = logs.get(item.placa) || [];
  if (events.some((event) => event.status && event.source !== "lista")) continue;
  const iso = noteIso(item.note);
  pushEvent(item.placa, {
    ts: iso ? Date.parse(iso) / 1000 : 0,
    iso,
    fromMe: true,
    phrase: item.note.slice(0, 240),
    status: suggestion.status,
    label: suggestion.label,
    source: "lista",
  });
  fromList += 1;
}

const records = [];
for (const item of plates.values()) {
  const events = (logs.get(item.placa) || []).sort((a, b) => a.ts - b.ts);
  const chatClassified = events.filter((event) => event.status && event.source !== "lista");
  const listClassified = events.filter((event) => event.status && event.source === "lista");
  const classified = chatClassified.length ? chatClassified : listClassified;
  const rankOf = {
    cancelado: 90,
    apreendido: 80,
    no_patio: 70,
    com_mandado: 60,
    inapto: 50,
    indisponivel_temp: 40,
    aguardando_mandado: 30,
  };
  const column = classified.reduce((best, event) => {
    const rank = rankOf[event.status] || 0;
    if (!best || rank > best.rank || (rank === best.rank && event.ts >= best.ts)) {
      return { event, rank };
    }
    return best;
  }, null)?.event || null;
  if (!events.length && !column) continue;
  records.push({
    ...item,
    column: column?.status || "",
    columnLabel: column?.label || "",
    columnAt: column?.iso || "",
    events,
  });
}

records.sort((a, b) => (a.office || "").localeCompare(b.office || "") || a.placa.localeCompare(b.placa));

const withColumn = records.filter((row) => row.column);
const novaComColuna = records.filter((row) => row.crmStatus === "nova" && row.column);
const lines = [];
lines.push("Log por placa — pesquisa individual nas mensagens gravadas");
lines.push(`Gerado: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}`);
lines.push(`Placas pesquisadas: ${plates.size} (${fromCrm} já no CRM)`);
lines.push(`Placas com evento: ${records.length}`);
lines.push(`Placas com coluna: ${withColumn.length}`);
lines.push(`Nova que muda de coluna: ${novaComColuna.length}`);
lines.push(`Respostas ligadas à placa anterior: ${inherited}`);
lines.push(`Coluna só pela lista: ${fromList}`);
lines.push("");
for (const row of records) {
  lines.push(`${row.placa}  ${row.columnLabel || "sem coluna"}  ${row.office}`);
  if (row.note) lines.push(`  lista: ${row.note}`);
  for (const event of row.events) {
    const quem = event.fromMe ? "você" : "zap";
    lines.push(`  ${stamp(event.ts)}  ${quem}  ${event.label || "nota"}  ${event.phrase}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outTxt, lines.join("\n"), "utf8");
fs.writeFileSync(outJson, JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2), "utf8");

console.log(lines.slice(0, 8).join("\n"));
console.log(`Relatório: ${outTxt}`);
const byLabel = new Map();
for (const row of withColumn) byLabel.set(row.columnLabel, (byLabel.get(row.columnLabel) || 0) + 1);
for (const [label, count] of [...byLabel.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label}: ${count}`);
}
const locked = new Set(["apreendido", "no_patio", "aguardando_pagamento", "removido", "entregue"]);
const moves = new Map();
for (const row of withColumn) {
  if (row.crmStatus === row.column) continue;
  if (locked.has(row.crmStatus)) continue;
  const key = `${row.crmStatus || "fora do CRM"} -> ${row.columnLabel}`;
  moves.set(key, (moves.get(key) || 0) + 1);
}
console.log("Mudanças de coluna:");
for (const [key, count] of [...moves.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}  ${key}`);
}
