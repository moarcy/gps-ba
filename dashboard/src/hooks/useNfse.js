import { useCallback, useEffect, useState } from "react";

async function nfseFetch(options = {}) {
  const res = await fetch("/api/nfse", options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export function useNfse({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const json = await nfseFetch();
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar NFS-e");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const runAction = useCallback(
    async (payload) => {
      setSaving(true);
      setError(null);
      try {
        const result = await nfseFetch({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await load({ silent: true });
        return result;
      } catch (err) {
        setError(err.message || "Falha na emissão");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  return { data, loading, error, saving, reload: load, runAction };
}
