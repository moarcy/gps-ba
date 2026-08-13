import { useEffect, useMemo, useState } from "react";
import { formatBRL } from "../lib/format";
import "./nfse.css";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_TOMADOR = {
  tipo: "CNPJ",
  documento: "",
  razaoSocial: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  cep: "",
  telefone: "",
  email: "",
};

export default function NfsePanel({
  data,
  loading,
  error,
  saving,
  onReload,
  runAction,
}) {
  const tomadores = data?.tomadores || [];
  const servicos = data?.servicos || [];
  const config = data?.config || {};
  const emitidas = data?.emitidas || [];

  const [tomadorId, setTomadorId] = useState("");
  const [servicoCodigo, setServicoCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [valorUnitario, setValorUnitario] = useState("");
  const [aliquota, setAliquota] = useState("");
  const [dataFato, setDataFato] = useState(todayIso());
  const [dryRun, setDryRun] = useState(false);
  const [showTomadorForm, setShowTomadorForm] = useState(false);
  const [tomadorForm, setTomadorForm] = useState(EMPTY_TOMADOR);
  const [localMsg, setLocalMsg] = useState("");
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    if (!servicoCodigo && servicos[0]?.codigo) {
      setServicoCodigo(servicos[0].codigo);
    }
  }, [servicos, servicoCodigo]);

  useEffect(() => {
    if (aliquota === "" && config.aliquota != null) {
      setAliquota(String(config.aliquota));
    }
  }, [config.aliquota, aliquota]);

  const selectedServico = useMemo(
    () => servicos.find((s) => s.codigo === servicoCodigo) || null,
    [servicos, servicoCodigo],
  );

  const selectedTomador = useMemo(
    () => tomadores.find((t) => t.id === tomadorId || t.documento === tomadorId) || null,
    [tomadores, tomadorId],
  );

  useEffect(() => {
    if (!selectedServico) return;
    if (!descricao && selectedServico.descricaoPadrao) {
      setDescricao(selectedServico.descricaoPadrao);
    }
  }, [selectedServico, descricao]);

  const qtd = Number(String(quantidade).replace(",", ".")) || 0;
  const unit = Number(String(valorUnitario).replace(",", ".")) || 0;
  const total = Number((qtd * unit).toFixed(2));
  const bankText = config.dados_bancarios || "";

  const previewItems = [
    {
      label: "Serviço",
      descricao: descricao || "—",
      quantidade: qtd,
      valorUnitario: unit,
      valorTotal: total,
    },
    {
      label: "Dados bancários",
      descricao: bankText,
      quantidade: 0,
      valorUnitario: 0,
      valorTotal: 0,
    },
  ];

  const saveTomador = async (event) => {
    event.preventDefault();
    setLocalErr("");
    setLocalMsg("");
    try {
      const result = await runAction({
        action: "upsert_tomador",
        ...tomadorForm,
      });
      setTomadorId(result.tomador?.id || result.tomador?.documento || "");
      setShowTomadorForm(false);
      setTomadorForm(EMPTY_TOMADOR);
      setLocalMsg("Tomador salvo.");
    } catch (err) {
      setLocalErr(err.message || "Falha ao salvar tomador");
    }
  };

  const emit = async (event) => {
    event.preventDefault();
    setLocalErr("");
    setLocalMsg("");

    if (!tomadorId) {
      setLocalErr("Selecione um tomador.");
      return;
    }
    if (!servicoCodigo) {
      setLocalErr("Selecione um serviço.");
      return;
    }
    if (!descricao.trim()) {
      setLocalErr("Informe a descrição.");
      return;
    }

    try {
      const result = await runAction({
        action: "emit",
        tomadorId,
        servicoCodigo,
        descricao,
        quantidade: qtd,
        valorUnitario: unit,
        aliquota: Number(String(aliquota).replace(",", ".")) || undefined,
        dataFato,
        dryRun,
      });

      const numero = result.emitida?.numeroNf || result.worker?.numeroNf;
      const status = result.emitida?.status;
      if (status === "authorized" || result.worker?.ok) {
        setLocalMsg(
          dryRun
            ? "Dry-run ok (formulário preenchido, sem confirmar)."
            : numero
              ? `Nota ${numero} emitida.`
              : "Emissão enviada ao portal.",
        );
      } else {
        setLocalMsg(result.worker?.message || "Emissão processada.");
      }
    } catch (err) {
      setLocalErr(err.message || "Falha ao emitir");
    }
  };

  if (loading && !data) {
    return <div className="empty-state">Carregando NFS-e…</div>;
  }

  return (
    <div className="nfse-panel">
      <div className="nfse-head">
        <div>
          <h2>Emissão NFS-e</h2>
          <p className="nfse-sub">
            Camaçari · portal automatizado
            {data?.workerConfigured ? "" : " · worker não configurado"}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => onReload()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {(error || localErr) && <div className="nfse-banner nfse-banner-error">{localErr || error}</div>}
      {localMsg && <div className="nfse-banner nfse-banner-ok">{localMsg}</div>}

      {!data?.workerConfigured && (
        <div className="nfse-banner">
          Defina <code>NFSE_WORKER_URL</code> e suba o worker Playwright para emitir.
        </div>
      )}

      <form className="nfse-form" onSubmit={emit}>
        <label className="nfse-field">
          <span>Tomador</span>
          <div className="nfse-row">
            <select
              value={tomadorId}
              onChange={(e) => setTomadorId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {tomadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.razaoSocial || t.documento} ({t.documento})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowTomadorForm((v) => !v)}
            >
              {showTomadorForm ? "Fechar" : "+ Tomador"}
            </button>
          </div>
        </label>

        {selectedTomador && (
          <p className="nfse-hint">
            {selectedTomador.logradouro}
            {selectedTomador.numero ? `, ${selectedTomador.numero}` : ""}
            {selectedTomador.municipio
              ? ` · ${selectedTomador.municipio}/${selectedTomador.uf}`
              : ""}
          </p>
        )}

        {showTomadorForm && (
          <div className="nfse-card">
            <h3>Novo tomador</h3>
            <div className="nfse-grid">
              <label>
                <span>Tipo</span>
                <select
                  value={tomadorForm.tipo}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, tipo: e.target.value }))
                  }
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                </select>
              </label>
              <label>
                <span>Documento</span>
                <input
                  value={tomadorForm.documento}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, documento: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="nfse-span-2">
                <span>Razão social</span>
                <input
                  value={tomadorForm.razaoSocial}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, razaoSocial: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="nfse-span-2">
                <span>Logradouro</span>
                <input
                  value={tomadorForm.logradouro}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, logradouro: e.target.value }))
                  }
                />
              </label>
              <label>
                <span>Número</span>
                <input
                  value={tomadorForm.numero}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, numero: e.target.value }))
                  }
                />
              </label>
              <label>
                <span>Bairro</span>
                <input
                  value={tomadorForm.bairro}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, bairro: e.target.value }))
                  }
                />
              </label>
              <label>
                <span>Município</span>
                <input
                  value={tomadorForm.municipio}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, municipio: e.target.value }))
                  }
                />
              </label>
              <label>
                <span>UF</span>
                <input
                  value={tomadorForm.uf}
                  maxLength={2}
                  onChange={(e) =>
                    setTomadorForm((p) => ({
                      ...p,
                      uf: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </label>
              <label>
                <span>CEP</span>
                <input
                  value={tomadorForm.cep}
                  onChange={(e) =>
                    setTomadorForm((p) => ({ ...p, cep: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="nfse-actions">
              <button type="button" className="btn btn-primary" onClick={saveTomador} disabled={saving}>
                Salvar tomador
              </button>
            </div>
          </div>
        )}

        <label className="nfse-field">
          <span>Serviço</span>
          <select
            value={servicoCodigo}
            onChange={(e) => {
              setServicoCodigo(e.target.value);
              setDescricao("");
            }}
            required
          >
            <option value="">Selecione…</option>
            {servicos.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.codigo} · CNAE {s.cnae}
              </option>
            ))}
          </select>
        </label>

        {selectedServico && (
          <p className="nfse-hint">
            CNAE {selectedServico.cnae}
            {selectedServico.servicoDescricao
              ? ` — ${selectedServico.servicoDescricao}`
              : ""}
          </p>
        )}

        <div className="nfse-grid">
          <label>
            <span>Data fato gerador</span>
            <input type="date" value={dataFato} onChange={(e) => setDataFato(e.target.value)} />
          </label>
          <label>
            <span>Alíquota (%)</span>
            <input
              value={aliquota}
              onChange={(e) => setAliquota(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            <span>Quantidade</span>
            <input
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label>
            <span>Valor unitário</span>
            <input
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
        </div>

        <label className="nfse-field">
          <span>Descrição do serviço</span>
          <textarea
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="ESTADIAS REFERENTE AO VEICULO - [MODELO] - PLACA: …"
            required
          />
        </label>

        <div className="nfse-card">
          <h3>Preview dos itens</h3>
          <div className="nfse-items">
            {previewItems.map((item) => (
              <div key={item.label} className="nfse-item">
                <div className="nfse-item-top">
                  <strong>{item.label}</strong>
                  <span>{formatBRL(item.valorTotal)}</span>
                </div>
                <pre className="nfse-item-desc">{item.descricao}</pre>
                <div className="nfse-item-meta">
                  Qtd {item.quantidade} · Unit {formatBRL(item.valorUnitario)}
                </div>
              </div>
            ))}
          </div>
          <p className="nfse-total">
            Total da nota: <strong>{formatBRL(total)}</strong>
          </p>
        </div>

        <label className="nfse-check">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          <span>Dry-run (preenche o portal sem confirmar)</span>
        </label>

        <div className="nfse-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Emitindo…" : dryRun ? "Testar preenchimento" : "Emitir NFS-e"}
          </button>
        </div>
      </form>

      <section className="nfse-history">
        <h3>Últimas emissões</h3>
        {!emitidas.length && <p className="nfse-hint">Nenhuma emissão ainda.</p>}
        <div className="nfse-history-list">
          {emitidas.map((e) => (
            <article key={e.id} className="nfse-history-item">
              <div className="nfse-item-top">
                <strong>
                  {e.numeroNf ? `NF ${e.numeroNf}` : e.status}
                </strong>
                <span>{formatBRL(e.valorTotal || 0)}</span>
              </div>
              <p>
                {e.tomadorNome || e.tomadorId} · {e.servicoCodigo}
              </p>
              <p className="nfse-hint">
                {e.dataFato} · {e.status}
                {e.erro ? ` · ${e.erro}` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
