import { useCallback, useEffect, useState } from "react";

async function crmFetch(options = {}) {
  const res = await fetch("/api/crm", options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export function useCrm({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await crmFetch();
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar CRM");
    } finally {
      setLoading(false);
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
        const result = await crmFetch({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await load();
        return result;
      } catch (err) {
        setError(err.message || "Falha ao salvar");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  return { data, loading, error, saving, reload: load, runAction };
}
