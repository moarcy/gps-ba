import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useDashboard({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/dashboard?refresh=1" : "/api/dashboard";
      const res = await apiFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load();
  }, [enabled, load]);

  return { data, loading, error, reload: load };
}
