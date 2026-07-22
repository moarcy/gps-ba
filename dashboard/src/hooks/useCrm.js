import { useCallback, useEffect, useState } from "react";

async function crmFetch(options = {}) {
  const res = await fetch("/api/crm", options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function patchPipelineItem(data, ocorrencia) {
  if (!data || !ocorrencia?.placa) return data;
  const placa = ocorrencia.placa;
  return {
    ...data,
    pipeline: (data.pipeline || []).map((p) =>
      p.placa === placa ? { ...p, ...ocorrencia } : p,
    ),
  };
}

export function useCrm({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const json = await crmFetch();
      setData(json);
    } catch (err) {
      setError(err.message || "Falha ao carregar CRM");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const runAction = useCallback(
    async (payload, opts = {}) => {
      const soft = Boolean(opts.soft);
      setSaving(true);
      setError(null);
      try {
        const result = await crmFetch({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (soft) {
          // Atualiza local na hora; sync completo em background
          if (result?.ocorrencia) {
            setData((prev) => patchPipelineItem(prev, result.ocorrencia));
          }
          load({ silent: true });
          return result;
        }

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
