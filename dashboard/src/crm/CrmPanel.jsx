import { useMemo, useState } from "react";
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
function Card({ item, labels, onOpen }) {
  return (
    <button type="button" className="crm-card" onClick={() => onOpen(item.placa)}>
      <div className="crm-card-top">
        <strong className="placa">{item.placa}</strong>
        {item.rastreado && <span className="tag-rastreado">Rastreado</span>}
      </div>
      <p className="crm-card-sub">{item.assessoria || "Sem assessoria"}</p>
      <p className="crm-card-meta">
        {item.veiculo ? `${item.veiculo.slice(0, 28)}${item.veiculo.length > 28 ? "…" : ""}` : "—"}
      </p>
      <div className="crm-card-foot">
        <span>{labels[item.status] || item.status}</span>
        <span>Contato {formatShortDate(item.proximoContato)}</span>
      </div>
    </button>
  );
}

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

export default function CrmPanel({ data, loading, error, saving, onReload, runAction }) {
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

  const labels = data?.meta?.statusLabels || STATUS_LABELS;
  const pipeline = data?.pipeline || [];
  const byStatus = data?.byStatus || {};
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
      const key = p.dataPrevista.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return map;
  }, [data, payFilter]);

  const monthCells = buildMonthMatrix(calCursor.year, calCursor.month);
  const monthLabel = new Date(calCursor.year, calCursor.month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const openDetail = (placa) => {
    setSelectedPlaca(placa);
    setCrmTab("detalhe");
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
            ...(selected ? [["detalhe", "Detalhe"]] : []),
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

      {crmTab === "filas" && (
        <div className="crm-kanban">
          {STATUS_ORDER.filter(
            (s) =>
              !["entregue", "cancelado", "apreendido", "aguardando_pagamento", "removido"].includes(
                s,
              ),
          ).map((status) => {
            const items = byStatus[status] || [];
            if (!items.length && ["inapto"].includes(status)) return null;
            return (
              <section key={status} className="crm-column">
                <header>
                  <h3>{labels[status] || status}</h3>
                  <span>{items.length}</span>
                </header>
                <div className="crm-column-body">
                  {items.map((item) => (
                    <Card key={item.placa} item={item} labels={labels} onOpen={openDetail} />
                  ))}
                  {!items.length && <p className="crm-empty-col">Vazio</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {crmTab === "followups" && (
        <div className="crm-list">
          {(data?.followUps || []).length === 0 && (
            <div className="empty-state">Nenhum follow-up nos próximos 7 dias.</div>
          )}
          {(data?.followUps || []).map((item) => (
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
          {(data?.patio || []).length === 0 && (
            <div className="empty-state">Nenhum veículo no pátio.</div>
          )}
          {(data?.patio || []).map((item) => (
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

      {crmTab === "detalhe" && selected && (
        <div className="crm-detail">
          <div className="crm-detail-head">
            <div>
              <p className="placa">{selected.placa}</p>
              <p className="crm-card-sub">
                {selected.veiculo || "—"}
                {selected.cor ? ` · ${selected.cor}` : ""}
                {selected.uf ? ` · ${selected.uf}` : ""}
              </p>
            </div>
            <div className="crm-detail-tags">
              {selected.rastreado && <span className="tag-rastreado">Rastreado</span>}
              {(data?.pendingByPlaca?.[selected.placa] || []).length > 0 && (
                <span className="tag-pagamento-pendente">
                  {(data.pendingByPlaca[selected.placa] || []).length} pag. pendente
                </span>
              )}
            </div>
          </div>

          <div className="vehicle-grid">
            <div>
              <span>Assessoria</span>
              <strong>{selected.assessoria || "—"}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{selected.telefone || "—"}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{labels[selected.status] || selected.status}</strong>
            </div>
            <div>
              <span>Próx. contato</span>
              <strong>{formatShortDate(selected.proximoContato)}</strong>
            </div>
            <div>
              <span>Pátio</span>
              <strong>{selected.patio || "—"}</strong>
            </div>
            <div>
              <span>Diárias</span>
              <strong>{selected.diarias ?? "—"}</strong>
            </div>
          </div>

          <div className="crm-actions">
            <p className="section-hint">
              Apreensão → pátio → entregue (cliente busca no pátio). Pagamento é à parte e pode ficar
              em aberto por prazo.
            </p>
            <div className="crm-status-actions">
              {(NEXT_STATUS[selected.status] || []).map((st) => (
                <button
                  key={st}
                  type="button"
                  className="btn btn-ghost"
                  disabled={saving}
                  onClick={() => runAction({ action: "update", placa: selected.placa, status: st })}
                >
                  {NEXT_STATUS_ACTION_LABELS[st] || labels[st] || st}
                </button>
              ))}
            </div>
            <div className="crm-flag-row">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() =>
                  runAction({
                    action: "update",
                    placa: selected.placa,
                    rastreado: !selected.rastreado,
                  })
                }
              >
                {selected.rastreado ? "Remover rastreado" : "Marcar rastreado"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() =>
                  runAction({
                    action: "update",
                    placa: selected.placa,
                    usaGuincho: !selected.usaGuincho,
                  })
                }
              >
                Guincho: {selected.usaGuincho ? "sim" : "não"}
              </button>
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
                Registrar contato (+7 dias)
              </button>
            </div>
          </div>

          <div className="panel panel-soft">
            <h3>Pagamento previsto</h3>
            <p className="section-hint">
              Independente do pátio: Apreensão, Guincho, Estadia ou Plus — com forma PIX / recibo /
              NF.
            </p>
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
            </div>
          </div>

          <div className="panel panel-soft">
            <h3>Timeline</h3>
            <div className="filter">
              <label>Nova nota</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-block"
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
              Adicionar nota
            </button>
            <div className="crm-timeline">
              {timeline.map((t) => (
                <div key={t.id} className="crm-timeline-item">
                  <span className="crm-timeline-type">{t.tipo}</span>
                  <p>{t.mensagem}</p>
                  <small>{formatDateTime(t.dataHora)}</small>
                </div>
              ))}
              {!timeline.length && <p className="section-hint">Sem eventos ainda.</p>}
            </div>
          </div>

          <div className="crm-bridge">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={saving || selected.noControle}
              onClick={() =>
                runAction({
                  action: "bridge",
                  placa: selected.placa,
                  overwrite: true,
                })
              }
            >
              {selected.noControle ? "Já no Controle" : "Enviar ao Controle Diligências"}
            </button>
          </div>
        </div>
      )}

      {crmTab === "detalhe" && !selected && (
        <div className="empty-state">Selecione um veículo nas filas.</div>
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
