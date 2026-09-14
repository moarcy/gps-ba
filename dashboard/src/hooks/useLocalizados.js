import { useCallback, useEffect, useState } from "react";

async function localizadosFetch(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function patchPosicao(data, placa, posicao) {
  if (!data || !placa) return data;
  const dias = (data.dias || data.lotes || []).map((dia) => {
    if (!dia.items?.some((it) => it.placa === placa)) return dia;
    const items = dia.items.map((it) => (it.placa === placa ? { ...it, posicao } : it));
    const counts = { pendente: 0, sim: 0, nao: 0, total: items.length };
    for (const it of items) {
      if (it.posicao === "Sim") counts.sim += 1;
      else if (it.posicao === "Não") counts.nao += 1;
      else counts.pendente += 1;
    }
    return { ...dia, items, ...counts, carros: counts.total };
  });
  const items = dias.flatMap((d) => d.items);
  const counts = { pendente: 0, sim: 0, nao: 0, total: items.length };
  for (const it of items) {
    if (it.posicao === "Sim") counts.sim += 1;
    else if (it.posicao === "Não") counts.nao += 1;
    else counts.pendente += 1;
  }
  const locators = (data.locators || []).map((loc) => {
    const group = items.filter((it) => it.loc === loc.id);
    const locCounts = { pendente: 0, sim: 0, nao: 0, total: group.length };
    for (const it of group) {
      if (it.posicao === "Sim") locCounts.sim += 1;
      else if (it.posicao === "Não") locCounts.nao += 1;
      else locCounts.pendente += 1;
    }
    const primeiro = dias.find((d) => d.loc === loc.id && d.pendente > 0);
    return { ...loc, ...locCounts, primeiroPendente: primeiro?.id || loc.primeiroPendente };
  });
  return { ...data, dias, lotes: dias, locators, counts };
}

export function useLocalizados({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ silent = false, refresh = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const json = await localizadosFetch(
        refresh ? "/api/localizados?refresh=1" : "/api/localizados",
      );
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar localizados");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const mark = useCallback(async ({ placa, posicao, obs }) => {
    setSaving(true);
    setError(null);
    setData((cur) => patchPosicao(cur, placa, posicao));
    try {
      const result = await localizadosFetch("/api/localizados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa, posicao, obs }),
      });
      if (result?.data) setData(result.data);
      return result;
    } catch (err) {
      await load({ silent: true, refresh: true });
      setError(err.message || "Falha ao marcar posição");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [load]);

  const reload = useCallback(
    ({ silent = false } = {}) => load({ silent, refresh: true }),
    [load],
  );

  return { data, loading, error, saving, reload, mark };
}
