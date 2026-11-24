import test from "node:test";
import assert from "node:assert/strict";
import { locsDaConferencia, scopeLocalizados } from "./localizados-service.js";

test("a conferência do Bira fica com os carros dele e do Carlos", () => {
  assert.deepEqual(locsDaConferencia("BIRA"), ["BIRA", "CARLOS"]);
  const scoped = scopeLocalizados(
    {
      dias: [
        { id: "BIRA-1", loc: "BIRA", whatsapp: "texto do escritório", items: [{ placa: "AAA1A11", veiculo: "GOL", loc: "BIRA" }] },
        { id: "CARLOS-1", loc: "CARLOS", whatsapp: "oi", items: [{ placa: "BBB1B11", veiculo: "UNO", loc: "CARLOS" }] },
        { id: "MACIEL-1", loc: "MACIEL", whatsapp: "maciel", items: [{ placa: "CCC1C11", veiculo: "FIAT", loc: "MACIEL" }] },
      ],
      locators: [
        { id: "BIRA", total: 1 },
        { id: "CARLOS", total: 1 },
        { id: "MACIEL", total: 1 },
      ],
    },
    ["BIRA", "CARLOS"],
  );
  assert.deepEqual(scoped.dias.map((dia) => dia.loc), ["BIRA", "CARLOS"]);
  assert.equal(scoped.dias[0].whatsapp, "");
  assert.equal(scoped.locators.some((loc) => loc.id === "MACIEL"), false);
  assert.equal(scoped.counts.total, 2);
});
