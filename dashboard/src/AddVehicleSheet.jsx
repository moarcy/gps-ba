import { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
  placa: "",
  data: "",
  loc1: "",
  banco: "",
  assessoria: "",
  contato: "",
  premio: "",
  nfNr: "",
  apoio: "",
  loc2: "",
  guincho: "",
  overwrite: false,
};

export default function AddVehicleSheet({ open, onClose, onSaved, filters }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setOkMsg("");
    setForm({
      ...EMPTY_FORM,
      data: new Date().toISOString().slice(0, 10),
    });
  }, [open]);

  const assessoriaOptions = useMemo(
    () => filters?.assessorias || [],
    [filters],
  );
  const locOptions = useMemo(() => filters?.localizadores || [], [filters]);
  const bancoOptions = useMemo(() => filters?.bancos || [], [filters]);

  if (!open) return null;

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setOkMsg("");

    if (!form.placa.trim()) {
      setError("Informe a placa.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && body.code === "PLATE_EXISTS") {
        setError(body.error || "Placa já existe.");
        return;
      }
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setOkMsg(
        body.updated
          ? `Placa ${body.placa} atualizada na planilha.`
          : `Placa ${body.placa} adicionada na planilha.`,
      );
      setForm({
        ...EMPTY_FORM,
        data: new Date().toISOString().slice(0, 10),
      });
      await onSaved?.();
    } catch (err) {
      setError(err.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label="Adicionar veículo">
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="sheet sheet-tall">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Adicionar veículo</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>

        <form className="sheet-body add-form" onSubmit={submit}>
          <p className="section-hint">
            Grava na planilha do gestor. No próximo sync o carro continua lá.
          </p>

          <div className="filter">
            <label htmlFor="add-placa">Placa *</label>
            <input
              id="add-placa"
              value={form.placa}
              onChange={(e) => setField("placa", e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              required
            />
          </div>

          <div className="filter">
            <label htmlFor="add-data">Data</label>
            <input
              id="add-data"
              type="date"
              value={form.data}
              onChange={(e) => setField("data", e.target.value)}
            />
          </div>

          <div className="filter">
            <label htmlFor="add-loc1">Localizador</label>
            <input
              id="add-loc1"
              list="add-loc-list"
              value={form.loc1}
              onChange={(e) => setField("loc1", e.target.value)}
              placeholder="Ex.: BIRA"
            />
            <datalist id="add-loc-list">
              {locOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="filter">
            <label htmlFor="add-banco">Banco</label>
            <input
              id="add-banco"
              list="add-banco-list"
              value={form.banco}
              onChange={(e) => setField("banco", e.target.value)}
            />
            <datalist id="add-banco-list">
              {bancoOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="filter">
            <label htmlFor="add-assessoria">Assessoria</label>
            <input
              id="add-assessoria"
              list="add-assessoria-list"
              value={form.assessoria}
              onChange={(e) => setField("assessoria", e.target.value)}
            />
            <datalist id="add-assessoria-list">
              {assessoriaOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="filter">
            <label htmlFor="add-contato">Contato</label>
            <input
              id="add-contato"
              value={form.contato}
              onChange={(e) => setField("contato", e.target.value)}
              placeholder="Auto em SCHULZE / PASCHOALOTTO"
            />
          </div>

          <div className="filter-row">
            <div className="filter">
              <label htmlFor="add-premio">Prêmio</label>
              <input
                id="add-premio"
                inputMode="decimal"
                value={form.premio}
                onChange={(e) => setField("premio", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="filter">
              <label htmlFor="add-nf">NF / Nº</label>
              <input
                id="add-nf"
                value={form.nfNr}
                onChange={(e) => setField("nfNr", e.target.value)}
              />
            </div>
          </div>

          <div className="filter-row">
            <div className="filter">
              <label htmlFor="add-apoio">Apoio</label>
              <input
                id="add-apoio"
                inputMode="decimal"
                value={form.apoio}
                onChange={(e) => setField("apoio", e.target.value)}
              />
            </div>
            <div className="filter">
              <label htmlFor="add-loc2">Loc II</label>
              <input
                id="add-loc2"
                inputMode="decimal"
                value={form.loc2}
                onChange={(e) => setField("loc2", e.target.value)}
              />
            </div>
            <div className="filter">
              <label htmlFor="add-guincho">Guincho</label>
              <input
                id="add-guincho"
                inputMode="decimal"
                value={form.guincho}
                onChange={(e) => setField("guincho", e.target.value)}
              />
            </div>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={form.overwrite}
              onChange={(e) => setField("overwrite", e.target.checked)}
            />
            Sobrescrever se a placa já existir
          </label>

          {error && <p className="form-error">{error}</p>}
          {okMsg && <p className="form-ok">{okMsg}</p>}

          <div className="sheet-foot sheet-foot-inline">
            <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar na planilha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
