import { useCallback, useEffect, useState } from "react";

async function radarFetch() {
  const res = await fetch("/api/radar");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export function useRadar({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const json = await radarFetch();
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar o radar Feira");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { data, loading, error, reload: load };
}
