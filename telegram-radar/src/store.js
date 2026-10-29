import fs from "node:fs/promises";
import path from "node:path";

export function createStore(filePath) {
  const dataFile = path.resolve(filePath);
  const settingsFile = path.join(path.dirname(dataFile), "settings.json");
  let sightings = [];
  let settings = {
    destChatId: null,
    adminIds: [],
    lastSourceMessageId: 0,
    notifiedFps: [],
  };

  async function ensureDir() {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
  }

  async function load() {
    await ensureDir();
    try {
      const raw = await fs.readFile(dataFile, "utf8");
      sightings = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      sightings = [];
    }
    try {
      settings = {
        destChatId: null,
        adminIds: [],
        lastSourceMessageId: 0,
        notifiedFps: [],
        ...JSON.parse(await fs.readFile(settingsFile, "utf8")),
      };
      if (!Array.isArray(settings.notifiedFps)) settings.notifiedFps = [];
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    if (!settings.lastSourceMessageId) {
      const inferred = sightings.reduce(
        (max, s) => Math.max(max, Number(s.messageId) || 0),
        0,
      );
      if (inferred) {
        settings.lastSourceMessageId = inferred;
        await saveSettings();
      }
    }
    return { sightings, settings };
  }

  async function saveSettings() {
    await ensureDir();
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), "utf8");
  }

  function fingerprint(alerta) {
    return [alerta.placa, alerta.iso || alerta.dataHora, alerta.camera]
      .join("|")
      .toUpperCase();
  }

  async function add(alerta, extra = {}) {
    const fp = fingerprint(alerta);
    if (sightings.some((s) => s.fp === fp)) {
      return { sighting: sightings.find((s) => s.fp === fp), duplicate: true };
    }
    const sighting = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      ts: Date.now(),
      fp,
      ...alerta,
      raw: alerta.raw,
      ...extra,
    };
    sightings.push(sighting);
    await ensureDir();
    await fs.appendFile(dataFile, `${JSON.stringify(sighting)}\n`, "utf8");
    return { sighting, duplicate: false };
  }

  function all() {
    return sightings;
  }

  function hasPlaca(placa) {
    const p = String(placa || "").toUpperCase();
    return Boolean(p) && sightings.some((s) => s.placa === p);
  }

  function knownPlates() {
    return new Set(sightings.map((s) => s.placa).filter(Boolean));
  }

  function getSettings() {
    return settings;
  }

  async function setDestChatId(id) {
    settings.destChatId = id;
    await saveSettings();
  }

  async function addAdmin(id) {
    const n = Number(id);
    if (!settings.adminIds.includes(n)) {
      settings.adminIds.push(n);
      await saveSettings();
    }
  }

  function lastSourceMessageId() {
    return Number(settings.lastSourceMessageId) || 0;
  }

  let cursorDirty = 0;

  async function setLastSourceMessageId(id, { flush = false } = {}) {
    const n = Number(id);
    if (Number.isFinite(n) && n > lastSourceMessageId()) {
      settings.lastSourceMessageId = n;
      cursorDirty += 1;
    }
    if (flush || cursorDirty >= 25) {
      cursorDirty = 0;
      await saveSettings();
    }
  }

  async function flushSettings() {
    cursorDirty = 0;
    await saveSettings();
  }

  function wasNotified(fp) {
    return Boolean(fp) && settings.notifiedFps.includes(fp);
  }

  async function markNotified(fp) {
    if (!fp || settings.notifiedFps.includes(fp)) return;
    settings.notifiedFps.push(fp);
    if (settings.notifiedFps.length > 8000) {
      settings.notifiedFps = settings.notifiedFps.slice(-6000);
    }
    await saveSettings();
  }

  async function savePhoto(placa, id, buffer) {
    if (!buffer?.length) return "";
    await ensureDir();
    const dir = path.join(path.dirname(dataFile), "photos", placa);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${id}.jpg`);
    await fs.writeFile(file, buffer);
    return file;
  }

  async function importMany(items) {
    let added = 0;
    const existing = new Set(sightings.map((s) => s.fp));
    const lines = [];
    for (const alerta of items) {
      const fp = fingerprint(alerta);
      if (existing.has(fp)) continue;
      existing.add(fp);
      const sighting = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        ts: Date.now(),
        fp,
        ...alerta,
        raw: alerta.raw,
      };
      sightings.push(sighting);
      lines.push(JSON.stringify(sighting));
      added += 1;
    }
    if (lines.length) {
      await ensureDir();
      await fs.appendFile(dataFile, `${lines.join("\n")}\n`, "utf8");
    }
    return { added, total: sightings.length };
  }

  return {
    load,
    add,
    all,
    hasPlaca,
    knownPlates,
    lastSourceMessageId,
    setLastSourceMessageId,
    flushSettings,
    getSettings,
    setDestChatId,
    addAdmin,
    savePhoto,
    importMany,
    wasNotified,
    markNotified,
  };
}
