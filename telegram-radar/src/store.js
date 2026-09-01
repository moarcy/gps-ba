import fs from "node:fs/promises";
import path from "node:path";

export function createStore(filePath) {
  const dataFile = path.resolve(filePath);
  const settingsFile = path.join(path.dirname(dataFile), "settings.json");
  let sightings = [];
  let settings = { destChatId: null, adminIds: [] };

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
        ...JSON.parse(await fs.readFile(settingsFile, "utf8")),
      };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
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

  return { load, add, all, getSettings, setDestChatId, addAdmin };
}
