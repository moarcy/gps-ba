import { useEffect, useState } from "react";

const EMPTY = {
  placa: "",
  dataOcorrencia: "",
  veiculo: "",
  cor: "",
  origem: "",
  uf: "",
  assessoria: "",
  telefone: "",
  localizador: "",
  rastreado: false,
  observacoes: "",
  rawWhatsapp: "",
  overwrite: false,
};

export default function NewOcorrenciaSheet({ open, onClose, onCreate }) {
  const [mode, setMode] = useState("whatsapp");
  const [paste, setPaste] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("whatsapp");
    setPaste("");
    setError("");
    setForm({ ...EMPTY, dataOcorrencia: new Date().toISOString().slice(0, 10) });
  }, [open]);

  if (!open) return null;

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const parsePaste = async () => {
    setError("");
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", text: paste }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Falha ao extrair");
      const f = body.fields || {};
      setForm((prev) => ({
        ...prev,
        placa: f.placa || "",
        veiculo: f.veiculo || "",
        cor: f.cor || "",
        origem: f.origem || "",
        uf: f.uf || "",
        assessoria: f.assessoria || "",
        telefone: f.telefone || "",
        rawWhatsapp: f.rawWhatsapp || paste,
      }));
      if (!body.ok) setError(body.error || "Revise os campos extraídos");
      setMode("form");
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.placa.trim()) {
      setError("Informe a placa.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        ...form,
        rawWhatsapp: form.rawWhatsapp || paste,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label="Nova ocorrência">
      <button type="button" className="sheet-backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="sheet sheet-tall">
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>Nova ocorrência</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="sheet-body add-form">
          <div className="crm-mode-tabs">
            <button
              type="button"
              className={mode === "whatsapp" ? "is-active" : ""}
              onClick={() => setMode("whatsapp")}
            >
              Colar WhatsApp
            </button>
            <button
              type="button"
              className={mode === "form" ? "is-active" : ""}
              onClick={() => setMode("form")}
            >
              Manual
            </button>
          </div>

          {mode === "whatsapp" ? (
            <>
              <p className="section-hint">Cole a mensagem “Nova ocorrência” do WhatsApp.</p>
              <div className="filter">
                <label htmlFor="wa-paste">Mensagem</label>
                <textarea
                  id="wa-paste"
                  rows={8}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={"Nova ocorrência\n🚗 PJW2687 - HR-V ..."}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={parsePaste}
                disabled={!paste.trim()}
              >
                Extrair dados
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="filter">
                <label htmlFor="crm-placa">Placa *</label>
                <input
                  id="crm-placa"
                  value={form.placa}
                  onChange={(e) => setField("placa", e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="filter">
                <label htmlFor="crm-data">Data</label>
                <input
                  id="crm-data"
                  type="date"
                  value={form.dataOcorrencia}
                  onChange={(e) => setField("dataOcorrencia", e.target.value)}
                />
              </div>
              <div className="filter">
                <label htmlFor="crm-veiculo">Veículo</label>
                <input
                  id="crm-veiculo"
                  value={form.veiculo}
                  onChange={(e) => setField("veiculo", e.target.value)}
                />
              </div>
              <div className="filter-row">
                <div className="filter">
                  <label htmlFor="crm-cor">Cor</label>
                  <input
                    id="crm-cor"
                    value={form.cor}
                    onChange={(e) => setField("cor", e.target.value)}
                  />
                </div>
                <div className="filter">
                  <label htmlFor="crm-uf">UF</label>
                  <input
                    id="crm-uf"
                    value={form.uf}
                    onChange={(e) => setField("uf", e.target.value.toUpperCase())}
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="filter">
                <label htmlFor="crm-origem">Origem</label>
                <input
                  id="crm-origem"
                  value={form.origem}
                  onChange={(e) => setField("origem", e.target.value)}
                />
              </div>
              <div className="filter">
                <label htmlFor="crm-ass">Assessoria</label>
                <input
                  id="crm-ass"
                  value={form.assessoria}
                  onChange={(e) => setField("assessoria", e.target.value)}
                />
              </div>
              <div className="filter">
                <label htmlFor="crm-tel">Telefone</label>
                <input
                  id="crm-tel"
                  value={form.telefone}
                  onChange={(e) => setField("telefone", e.target.value)}
                />
              </div>
              <div className="filter">
                <label htmlFor="crm-loc">Localizador</label>
                <input
                  id="crm-loc"
                  value={form.localizador}
                  onChange={(e) => setField("localizador", e.target.value)}
                />
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.rastreado}
                  onChange={(e) => setField("rastreado", e.target.checked)}
                />
                Rastreado (prioridade)
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.overwrite}
                  onChange={(e) => setField("overwrite", e.target.checked)}
                />
                Sobrescrever se a placa já existir
              </label>
              <div className="filter">
                <label htmlFor="crm-obs">Observações</label>
                <textarea
                  id="crm-obs"
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setField("observacoes", e.target.value)}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar ocorrência"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
