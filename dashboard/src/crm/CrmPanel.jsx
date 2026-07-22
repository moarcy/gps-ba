import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL } from "../lib/format";
import NewOcorrenciaSheet from "./NewOcorrenciaSheet";
import {
  NEXT_STATUS,
  NEXT_STATUS_ACTION_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  formatDateTime,
  formatShortDate,
} from "./status";
import "./crm.css";

const PAY_CATEGORIAS = [
  ["apreensao", "Apreensão"],
  ["guincho", "Guincho"],
  ["estadia", "Estadia"],
  ["plus", "Plus"],
];

const PAY_FORMAS = [
  ["pix", "PIX"],
  ["recibo", "Recibo"],
  ["nf", "NF"],
];

const CAT_LABEL = Object.fromEntries(PAY_CATEGORIAS);
const FORMA_LABEL = Object.fromEntries(PAY_FORMAS);

function payTag(ev) {
  const cat = CAT_LABEL[ev.categoria] || ev.categoria || "Apreensão";
  const forma = FORMA_LABEL[ev.tipo] || (ev.tipo || "PIX").toUpperCase();
  return `${cat} · ${forma}`;
}
function Card({ item, labels, onOpen, dragging, onDragStart, onDragEnd }) {
  return (
    <article
      className={`crm-card ${dragging ? "is-dragging" : ""}`}
      draggable
      onDragStart={(e) => onDragStart?.(e, item)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(item.placa)}
    >
      <div className="crm-card-main">
        <div className="crm-card-top">
          <strong className="placa">{item.placa}</strong>
          {item.rastreado && <span className="tag-rastreado">Rastreado</span>}
        </div>
        <p className="crm-card-sub">{item.assessoria || "Sem assessoria"}</p>
        <p className="crm-card-meta">
          {item.localizador ? `${item.localizador} · ` : ""}
          {item.veiculo
            ? `${item.veiculo.slice(0, 24)}${item.veiculo.length > 24 ? "…" : ""}`
            : "—"}
        </p>
        <div className="crm-card-foot">
          <span>{labels[item.status] || item.status}</span>
          <span>Contato {formatShortDate(item.proximoContato)}</span>
        </div>
      </div>
      <span className="crm-card-grip" aria-hidden="true">
        ⋮⋮
      </span>
    </article>
  );
}

const KANBAN_STATUSES = STATUS_ORDER.filter(
  (s) => !["entregue", "cancelado", "apreendido", "aguardando_pagamento", "removido"].includes(s),
);

function buildMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function matchesCrmSearch(item, query, labels = {}) {
  const raw = String(query || "").trim();
  if (!raw) return true;
  const needle = raw.toUpperCase();
  const compact = needle.replace(/[^A-Z0-9]/g, "");
  const hay = [
    item.placa,
    item.localizador,
    item.assessoria,
    item.telefone,
    item.veiculo,
    item.cor,
    item.origem,
    item.uf,
    item.patio,
    item.status,
    labels[item.status],
    item.rastreado ? "RASTREADO" : "",
    item.temMandado ? "MANDADO" : "",
    item.observacoes,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (hay.includes(needle)) return true;
  if (compact && hay.replace(/[^A-Z0-9]/g, "").includes(compact)) return true;
  return false;
}

export default function CrmPanel({
  data,
  loading,
  error,
  saving,
  onReload,
  runAction,
  searchQuery = "",
  locFilter = "all",
  assessoriaFilter = "all",
}) {
  const [crmTab, setCrmTab] = useState("filas");
  const [selectedPlaca, setSelectedPlaca] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [note, setNote] = useState("");
  const [payForm, setPayForm] = useState({
    dataPrevista: new Date().toISOString().slice(0, 10),
    categoria: "apreensao",
    tipo: "pix",
    valor: "",
    nota: "",
    placa: "",
  });
  const [calCursor, setCalCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [payFilter, setPayFilter] = useState("all");
  const [calFormOpen, setCalFormOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("resumo");
  const [dragPlaca, setDragPlaca] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const suppressOpenRef = useRef(false);

  const labels = data?.meta?.statusLabels || STATUS_LABELS;
  const pipeline = useMemo(() => {
    const all = data?.pipeline || [];
    const locNeedle = String(locFilter || "all").trim().toUpperCase();
    const assNeedle = String(assessoriaFilter || "all").trim().toUpperCase();
    return all.filter((item) => {
      if (locNeedle !== "ALL") {
        const loc = String(item.localizador || "").trim().toUpperCase();
        if (loc !== locNeedle) return false;
      }
      if (assNeedle !== "ALL") {
        const ass = String(item.assessoria || "").trim().toUpperCase();
        if (ass !== assNeedle) return false;
      }
      return matchesCrmSearch(item, searchQuery, labels);
    });
  }, [data, searchQuery, labels, locFilter, assessoriaFilter]);

  const pipelinePlacas = useMemo(() => new Set(pipeline.map((p) => p.placa)), [pipeline]);

  const byStatus = useMemo(() => {
    const map = {};
    for (const s of STATUS_ORDER) map[s] = [];
    for (const item of pipeline) {
      const key = STATUS_ORDER.includes(item.status) ? item.status : "nova";
      map[key].push(item);
    }
    return map;
  }, [pipeline]);

  const followUps = useMemo(() => {
    const list = data?.followUps || [];
    return list.filter((item) => pipelinePlacas.has(item.placa));
  }, [data, pipelinePlacas]);

  const patio = useMemo(() => {
    const list = data?.patio || [];
    return list.filter((item) => pipelinePlacas.has(item.placa));
  }, [data, pipelinePlacas]);

  const selected = pipeline.find((p) => p.placa === selectedPlaca) || null;
  const timeline = useMemo(
    () => (data?.timeline || []).filter((t) => !selectedPlaca || t.placa === selectedPlaca),
    [data, selectedPlaca],
  );
  const pagamentosPlaca = useMemo(
    () => (data?.pagamentos || []).filter((p) => p.placa === selectedPlaca),
    [data, selectedPlaca],
  );

  const calendarDays = useMemo(() => {
    const map = new Map();
    for (const p of data?.pagamentos || []) {
      if (!p.dataPrevista) continue;
      if (payFilter === "pago" && !p.pago) continue;
      if (payFilter === "aberto" && p.pago) continue;
      // Com busca ativa, só mostra pagamentos das placas filtradas
      if (searchQuery.trim() && !pipelinePlacas.has(p.placa)) continue;
      const key = p.dataPrevista.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [data, payFilter, searchQuery, pipelinePlacas]);

  const monthCells = buildMonthMatrix(calCursor.year, calCursor.month);
  const monthLabel = new Date(calCursor.year, calCursor.month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const openDetail = (placa) => {
    if (suppressOpenRef.current) return;
    setSelectedPlaca(placa);
    setDetailTab("resumo");
  };

  const closeDetail = () => {
    setSelectedPlaca(null);
    setNote("");
  };

  useEffect(() => {
    if (!selectedPlaca) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedPlaca]);

  const moveToStatus = async (placa, status) => {
    const current = (data?.pipeline || []).find((p) => p.placa === placa);
    if (!current || current.status === status) return;
    await runAction({ action: "update", placa, status });
  };

  const onCardDragStart = (e, item) => {
    suppressOpenRef.current = true;
    setDragPlaca(item.placa);
    e.dataTransfer.setData("text/placa", item.placa);
    e.dataTransfer.setData("text/plain", item.placa);
    e.dataTransfer.effectAllowed = "move";
  };

  const onCardDragEnd = () => {
    setDragPlaca(null);
    setDragOverStatus(null);
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 80);
  };

  const onColumnDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStatus !== status) setDragOverStatus(status);
  };

  const onColumnDrop = async (e, status) => {
    e.preventDefault();
    const placa = e.dataTransfer.getData("text/placa") || dragPlaca;
    setDragOverStatus(null);
    setDragPlaca(null);
    if (!placa || saving) return;
    await moveToStatus(placa, status);
  };

  const openCalForm = (isoDate) => {
    setPayForm((p) => ({
      ...p,
      dataPrevista: isoDate || p.dataPrevista || new Date().toISOString().slice(0, 10),
      placa: selectedPlaca || p.placa || "",
      categoria: "apreensao",
      tipo: "pix",
      valor: "",
      nota: "",
    }));
    setCalFormOpen(true);
  };

  const submitCalPagamento = async () => {
    if (!payForm.placa) return;
    const occ = pipeline.find((p) => p.placa === payForm.placa);
    await runAction({
      action: "pagamento",
      placa: payForm.placa,
      assessoria: occ?.assessoria || "",
      dataPrevista: payForm.dataPrevista,
      categoria: payForm.categoria,
      tipo: payForm.tipo,
      valor: payForm.valor,
      nota: payForm.nota,
      pago: false,
    });
    setCalFormOpen(false);
  };

  if (loading && !data) {
    return <div className="empty-state">Carregando CRM…</div>;
  }

  if (error && !data) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={onReload}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="crm-root">
      <div className="crm-toolbar">
        <div className="crm-subnav">
          {[
            ["filas", "Filas"],
            ["followups", "Follow-ups"],
            ["calendario", "Calendário"],
            ["patio", "Pátio"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={crmTab === id ? "is-active" : ""}
              onClick={() => setCrmTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
          + Ocorrência
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {searchQuery.trim() && (
        <p className="section-hint">
          Busca “{searchQuery.trim()}”: {pipeline.length} veículo
          {pipeline.length === 1 ? "" : "s"} no CRM
        </p>
      )}

      {crmTab === "filas" && (
        <>
          <p className="crm-dnd-hint">Arraste o card entre as colunas para mudar o status.</p>
          <div className="crm-kanban">
            {KANBAN_STATUSES.map((status) => {
              const items = byStatus[status] || [];
              if (!items.length && ["inapto"].includes(status)) return null;
              return (
                <section
                  key={status}
                  className={`crm-column ${dragOverStatus === status ? "is-drop-target" : ""}`}
                  onDragOver={(e) => onColumnDragOver(e, status)}
                  onDragLeave={() => {
                    if (dragOverStatus === status) setDragOverStatus(null);
                  }}
                  onDrop={(e) => onColumnDrop(e, status)}
                >
                  <header>
                    <h3>{labels[status] || status}</h3>
                    <span>{items.length}</span>
                  </header>
                  <div className="crm-column-body">
                    {items.map((item) => (
                      <Card
                        key={item.placa}
                        item={item}
                        labels={labels}
                        onOpen={openDetail}
                        dragging={dragPlaca === item.placa}
                        onDragStart={onCardDragStart}
                        onDragEnd={onCardDragEnd}
                      />
                    ))}
                    {!items.length && <p className="crm-empty-col">Solte aqui</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {crmTab === "followups" && (
        <div className="crm-list">
          {followUps.length === 0 && (
            <div className="empty-state">Nenhum follow-up nos próximos 7 dias.</div>
          )}
          {followUps.map((item) => (
            <button
              key={item.placa}
              type="button"
              className={`crm-follow-row urgency-${item.urgency}`}
              onClick={() => openDetail(item.placa)}
            >
              <div>
                <strong className="placa">{item.placa}</strong>
                <span>
                  {item.assessoria || "—"} · {labels[item.status]}
                </span>
              </div>
              <div className="crm-follow-right">
                {item.rastreado && <span className="tag-rastreado">Rastreado</span>}
                <strong>{formatShortDate(item.proximoContato)}</strong>
                <span className="urgency-label">{item.urgency}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {crmTab === "calendario" && (
        <div className="crm-calendar">
          <div className="crm-cal-head">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setCalCursor((c) => {
                  const d = new Date(c.year, c.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
            >
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setCalCursor((c) => {
                  const d = new Date(c.year, c.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
            >
              ›
            </button>
          </div>

          <div className="crm-cal-actions">
            <p className="section-hint">
              Toque num dia ou em “+ Recebimento” para agendar Apreensão / Guincho / Estadia / Plus.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openCalForm(new Date().toISOString().slice(0, 10))}
            >
              + Recebimento
            </button>
          </div>

          <div className="crm-pay-filters">
            {[
              ["all", "Todos"],
              ["aberto", "Em aberto"],
              ["pago", "Pagos"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={payFilter === id ? "is-active" : ""}
                onClick={() => setPayFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {calFormOpen && (
            <div className="panel panel-soft crm-cal-form">
              <div className="panel-head">
                <h2>Agendar recebimento</h2>
                <button type="button" className="link-more" onClick={() => setCalFormOpen(false)}>
                  Fechar
                </button>
              </div>
              <div className="filter">
                <label>Placa</label>
                <select
                  value={payForm.placa}
                  onChange={(e) => setPayForm((p) => ({ ...p, placa: e.target.value }))}
                >
                  <option value="">Selecione…</option>
                  {pipeline.map((p) => (
                    <option key={p.placa} value={p.placa}>
                      {p.placa}
                      {p.assessoria ? ` · ${p.assessoria}` : ""}
                      {p.localizador ? ` · ${p.localizador}` : ""}
                      {p.rastreado ? " · rastreado" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-row">
                <div className="filter">
                  <label>Data prevista</label>
                  <input
                    type="date"
                    value={payForm.dataPrevista}
                    onChange={(e) => setPayForm((p) => ({ ...p, dataPrevista: e.target.value }))}
                  />
                </div>
                <div className="filter">
                  <label>Recebimento</label>
                  <select
                    value={payForm.categoria}
                    onChange={(e) => setPayForm((p) => ({ ...p, categoria: e.target.value }))}
                  >
                    {PAY_CATEGORIAS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter">
                  <label>Forma</label>
                  <select
                    value={payForm.tipo}
                    onChange={(e) => setPayForm((p) => ({ ...p, tipo: e.target.value }))}
                  >
                    {PAY_FORMAS.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="filter">
                <label>Valor</label>
                <input
                  inputMode="decimal"
                  value={payForm.valor}
                  onChange={(e) => setPayForm((p) => ({ ...p, valor: e.target.value }))}
                />
              </div>
              <div className="filter">
                <label>Nota</label>
                <input
                  value={payForm.nota}
                  onChange={(e) => setPayForm((p) => ({ ...p, nota: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={saving || !payForm.placa}
                onClick={submitCalPagamento}
              >
                Salvar no calendário
              </button>
            </div>
          )}

          <div className="crm-cal-grid">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={`${d}-${i}`} className="crm-cal-dow">
                {d}
              </div>
            ))}
            {monthCells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} className="crm-cal-cell is-empty" />;
              const key = `${calCursor.year}-${String(calCursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const events = calendarDays.get(key) || [];
              return (
                <div key={key} className={`crm-cal-cell ${events.length ? "has-events" : ""}`}>
                  <button
                    type="button"
                    className="crm-cal-day-btn"
                    onClick={() => openCalForm(key)}
                    title="Agendar recebimento neste dia"
                  >
                    {day}
                  </button>
                  {events.map((ev) => {
                    const tracked = pipeline.find((p) => p.placa === ev.placa)?.rastreado;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        className={`crm-cal-tag ${ev.pago ? "is-paid" : ""} ${tracked ? "is-tracked" : ""}`}
                        onClick={() => openDetail(ev.placa)}
                        title={`${ev.placa} ${payTag(ev)}`}
                      >
                        {payTag(ev)} {ev.assessoria || ev.placa}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {crmTab === "patio" && (
        <div className="crm-list">
          {patio.length === 0 && (
            <div className="empty-state">Nenhum veículo no pátio.</div>
          )}
          {patio.map((item) => (
            <button
              key={item.placa}
              type="button"
              className="crm-follow-row"
              onClick={() => openDetail(item.placa)}
            >
              <div>
                <strong className="placa">{item.placa}</strong>
                <span>
                  {item.patio || "Pátio"} · entrada {formatShortDate(item.dataEntradaPatio)}
                </span>
              </div>
              <div className="crm-follow-right">
                {item.rastreado && <span className="tag-rastreado">Rastreado</span>}
                <strong>{item.diarias ?? 0} diárias</strong>
                {item.valorDiaria != null && (
                  <span>{formatBRL((item.diarias || 0) * item.valorDiaria)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="sheet-root crm-detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhe ${selected.placa}`}
        >
          <button type="button" className="sheet-backdrop" aria-label="Fechar" onClick={closeDetail} />
          <div className="sheet sheet-tall">
            <div className="sheet-handle" />
            <header className="crm-sheet-head">
              <div className="crm-sheet-title">
                <p className="crm-sheet-placa">{selected.placa}</p>
                <p className="crm-sheet-sub">
                  {[selected.veiculo, selected.cor, selected.uf].filter(Boolean).join(" · ") ||
                    "Sem descrição"}
                </p>
                <p className="crm-sheet-meta-line">
                  {selected.localizador || "—"}
                  {selected.assessoria ? ` · ${selected.assessoria}` : ""}
                </p>
              </div>
              <button type="button" className="crm-sheet-close" onClick={closeDetail} aria-label="Fechar">
                ✕
              </button>
            </header>

            <div className="crm-sheet-chips">
              <span className="crm-status-chip">{labels[selected.status] || selected.status}</span>
              {selected.rastreado && <span className="tag-rastreado">Rastreado</span>}
              {(data?.pendingByPlaca?.[selected.placa] || []).length > 0 && (
                <span className="tag-pagamento-pendente">
                  {(data.pendingByPlaca[selected.placa] || []).length} pend.
                </span>
              )}
            </div>

            <div className="crm-detail-tabs" role="tablist">
              {[
                ["resumo", "Dados"],
                ["pagamento", "Recebimentos"],
                ["historico", "Histórico"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === id}
                  className={detailTab === id ? "is-active" : ""}
                  onClick={() => setDetailTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="sheet-body crm-sheet-body">
              {detailTab === "resumo" && (
                <>
                  <dl className="crm-facts">
                    <div>
                      <dt>Próx. contato</dt>
                      <dd>{formatShortDate(selected.proximoContato)}</dd>
                    </div>
                    <div>
                      <dt>Ocorrência</dt>
                      <dd>{formatShortDate(selected.dataOcorrencia)}</dd>
                    </div>
                    <div>
                      <dt>Pátio</dt>
                      <dd>{selected.patio || "—"}</dd>
                    </div>
                    <div>
                      <dt>Diárias</dt>
                      <dd>{selected.diarias ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Entrada</dt>
                      <dd>{formatShortDate(selected.dataEntradaPatio)}</dd>
                    </div>
                    <div>
                      <dt>Origem</dt>
                      <dd>{selected.origem || "—"}</dd>
                    </div>
                  </dl>

                  {selected.telefone && (
                    <a className="crm-phone-link" href={`tel:${selected.telefone.replace(/\D/g, "")}`}>
                      {selected.telefone}
                    </a>
                  )}

                  <div className="crm-toggle-row">
                    <button
                      type="button"
                      className={`crm-toggle ${selected.rastreado ? "is-on" : ""}`}
                      disabled={saving}
                      onClick={() =>
                        runAction({
                          action: "update",
                          placa: selected.placa,
                          rastreado: !selected.rastreado,
                        })
                      }
                    >
                      Rastreado
                    </button>
                    <button
                      type="button"
                      className={`crm-toggle ${selected.usaGuincho ? "is-on" : ""}`}
                      disabled={saving}
                      onClick={() =>
                        runAction({
                          action: "update",
                          placa: selected.placa,
                          usaGuincho: !selected.usaGuincho,
                        })
                      }
                    >
                      Guincho
                    </button>
                    <button
                      type="button"
                      className={`crm-toggle ${selected.temMandado ? "is-on" : ""}`}
                      disabled={saving}
                      onClick={() =>
                        runAction({
                          action: "update",
                          placa: selected.placa,
                          temMandado: !selected.temMandado,
                        })
                      }
                    >
                      Mandado
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-block"
                    disabled={saving || selected.noControle}
                    onClick={() =>
                      runAction({
                        action: "bridge",
                        placa: selected.placa,
                        overwrite: true,
                      })
                    }
                  >
                    {selected.noControle ? "Já está no Controle" : "Enviar ao Controle"}
                  </button>
                </>
              )}

              {detailTab === "pagamento" && (
                <>
                  <div className="filter-row">
                    <div className="filter">
                      <label>Data</label>
                      <input
                        type="date"
                        value={payForm.dataPrevista}
                        onChange={(e) => setPayForm((p) => ({ ...p, dataPrevista: e.target.value }))}
                      />
                    </div>
                    <div className="filter">
                      <label>Tipo</label>
                      <select
                        value={payForm.categoria}
                        onChange={(e) => setPayForm((p) => ({ ...p, categoria: e.target.value }))}
                      >
                        {PAY_CATEGORIAS.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="filter">
                      <label>Forma</label>
                      <select
                        value={payForm.tipo}
                        onChange={(e) => setPayForm((p) => ({ ...p, tipo: e.target.value }))}
                      >
                        {PAY_FORMAS.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="filter">
                    <label>Valor</label>
                    <input
                      inputMode="decimal"
                      value={payForm.valor}
                      onChange={(e) => setPayForm((p) => ({ ...p, valor: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={saving}
                    onClick={() =>
                      runAction({
                        action: "pagamento",
                        ...payForm,
                        placa: selected.placa,
                        assessoria: selected.assessoria,
                        pago: false,
                      })
                    }
                  >
                    Agendar recebimento
                  </button>
                  <div className="crm-pay-list">
                    {pagamentosPlaca.map((p) => (
                      <div key={p.id} className="crm-pay-item">
                        <div>
                          <strong>
                            {payTag(p)} · {formatShortDate(p.dataPrevista)}
                          </strong>
                          <span>{p.valor != null ? formatBRL(p.valor) : "—"}</span>
                        </div>
                        <button
                          type="button"
                          className="link-more"
                          disabled={saving || p.pago}
                          onClick={() =>
                            runAction({
                              action: "pagamento",
                              id: p.id,
                              placa: p.placa,
                              dataPrevista: p.dataPrevista,
                              categoria: p.categoria,
                              tipo: p.tipo,
                              assessoria: p.assessoria,
                              valor: p.valor,
                              nota: p.nota,
                              pago: true,
                            })
                          }
                        >
                          {p.pago ? "Pago" : "Marcar pago"}
                        </button>
                      </div>
                    ))}
                    {!pagamentosPlaca.length && (
                      <p className="section-hint">Nenhum recebimento agendado.</p>
                    )}
                  </div>
                </>
              )}

              {detailTab === "historico" && (
                <>
                  <div className="crm-note-box">
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Escreva uma nota…"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving || !note.trim()}
                      onClick={async () => {
                        await runAction({
                          action: "timeline",
                          placa: selected.placa,
                          tipo: "nota",
                          mensagem: note.trim(),
                        });
                        setNote("");
                      }}
                    >
                      Salvar
                    </button>
                  </div>
                  <div className="crm-timeline">
                    {timeline.map((t) => (
                      <div key={t.id} className="crm-timeline-item">
                        <div className="crm-timeline-meta">
                          <span className="crm-timeline-type">{t.tipo}</span>
                          <small>{formatDateTime(t.dataHora)}</small>
                        </div>
                        <p>{t.mensagem}</p>
                      </div>
                    ))}
                    {!timeline.length && <p className="section-hint">Sem eventos ainda.</p>}
                  </div>
                </>
              )}
            </div>

            <div className="sheet-foot crm-sheet-foot">
              {(NEXT_STATUS[selected.status] || []).slice(0, 2).map((st) => (
                <button
                  key={st}
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => moveToStatus(selected.placa, st)}
                >
                  {NEXT_STATUS_ACTION_LABELS[st] || labels[st] || st}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() =>
                  runAction({
                    action: "timeline",
                    placa: selected.placa,
                    tipo: "contato",
                    mensagem: "Contato com assessoria registrado",
                  })
                }
              >
                Contato +7d
              </button>
            </div>
          </div>
        </div>
      )}

      <NewOcorrenciaSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={async (payload) => {
          const result = await runAction({ action: "create", ...payload });
          if (result?.ocorrencia?.placa) openDetail(result.ocorrencia.placa);
        }}
      />
    </div>
  );
}
