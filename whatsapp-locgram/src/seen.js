import fs from "node:fs";
import path from "node:path";

export function createSeenStore(filePath) {
  const seen = new Set();
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      const id = line.trim();
      if (id) seen.add(id);
    }
  }
  return {
    has(id) {
      return Boolean(id) && seen.has(id);
    },
    add(id) {
      if (!id || seen.has(id)) return;
      seen.add(id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, `${id}\n`, "utf8");
    },
  };
}
