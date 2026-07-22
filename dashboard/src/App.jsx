import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AddVehicleSheet from "./AddVehicleSheet";
import CrmPanel from "./crm/CrmPanel";
import { useCrm } from "./hooks/useCrm";
import { useDashboard } from "./hooks/useDashboard";
import { formatBRL, formatDate } from "./lib/format";
import "./index.css";

const CHART_PALETTE = ["#5b8def", "#4aa3a0", "#c4a35a", "#8b7ec8", "#6f9b84", "#b87a7a"];

function highlightIndex(rows, valueKey = "premio") {
  if (!rows.length) return -1;
  let best = 0;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][valueKey] || 0) >= (rows[best][valueKey] || 0)) best = i;
  }
  return best;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>
          {p.name}: {formatBRL(p.value)}
        </div>
      ))}
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.2 3.5 10.2V21h6.2v-6.1h4.6V21h6.2V10.2L12 3.2Z"
      />
    </svg>
  );
}

function IconCars() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.2 16.5h13.6l.9-3.2H4.3l.9 3.2Zm13.1-8.2-.8-2.3c-.2-.7-.9-1.2-1.6-1.2H8.1c-.7 0-1.4.5-1.6 1.2l-.8 2.3H3.5v1.6h17V8.3h-2.2ZM7.4 14.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Zm9.2 0a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"
      />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 19.5h16v1.6H4v-1.6Zm2.2-3.1h2.2V9.2H6.2v7.2Zm4.7 0h2.2V5.8h-2.2v10.6Zm4.7 0h2.2v-5.3h-2.2v5.3Z"
      />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6.2h16v1.7H4V6.2Zm3 5h10v1.7H7v-1.7Zm2.5 5h5v1.7h-5v-1.7Z"
      />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.7 6.3A7.8 7.8 0 0 0 5.4 8.1L4 6.7V12h5.3L7.5 10.2a5.6 5.6 0 1 1 1.3 6.5l-1.3 1.3A7.4 7.4 0 1 0 17.7 6.3Z"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
    </svg>
  );
}

function IconCrm() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5.5h16v2.2H4V5.5Zm0 5.4h10v2.2H4v-2.2Zm0 5.4h16V18.5H4v-2.2Zm12.2-5.4H20v2.2h-3.8v-2.2Z"
      />
    </svg>
  );
}

export default function App() {
  const { data, loading, error, reload } = useDashboard();
  const [tab, setTab] = useState("resumo");
  const crm = useCrm({ enabled: tab === "crm" });
  const [month, setMonth] = useState("all");
  const [assessoria, setAssessoria] = useState("all");
  const [loc1, setLoc1] = useState("all");
  const [banco, setBanco] = useState("all");
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [semPremioOnly, setSemPremioOnly] = useState(false);

  useEffect(() => {
    document.body.style.overflow = filtersOpen || addOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen, addOpen]);

  const baseFiltered = useMemo(() => {
    if (!data?.vehicles) return [];
    return data.vehicles.filter((v) => {
      if (month !== "all" && v.monthKey !== month) return false;
      if (assessoria !== "all" && v.assessoria !== assessoria) return false;
      if (loc1 !== "all" && v.loc1 !== loc1) return false;
      if (banco !== "all" && v.banco !== banco) return false;
      if (q.trim()) {
        const needle = q.trim().toUpperCase().replace(/[^A-Z0-9À-Ü\s]/gi, " ");
        const hay = [
          v.placa,
          v.banco,
          v.contato,
          v.assessoria,
          v.loc1,
          v.nfNr,
        ]
          .filter(Boolean)
          .join(" ")
          .toUpperCase();
        if (!hay.includes(needle) && !hay.replace(/\s/g, "").includes(needle.replace(/\s/g, ""))) {
          return false;
        }
      }
      return true;
    });
  }, [data, month, assessoria, loc1, banco, q]);

  const filtered = useMemo(
    () => (semPremioOnly ? baseFiltered.filter((v) => v.premio == null) : baseFiltered),
    [baseFiltered, semPremioOnly],
  );

  const semPremioVehicles = useMemo(
    () => baseFiltered.filter((v) => v.premio == null),
    [baseFiltered],
  );

  const otherAlerts = useMemo(
    () => (data?.alerts || []).filter((a) => a.type !== "sem-premio"),
    [data],
  );

  const filteredTotals = useMemo(() => {
    const withPremio = filtered.filter((v) => v.premio != null);
    const withSaldo = filtered.filter((v) => v.saldo != null);
    return {
      veiculos: filtered.length,
      premio: withPremio.reduce((a, v) => a + (v.premio || 0), 0),
      imposto: withPremio.reduce((a, v) => a + (v.imposto || 0), 0),
      saldo: withSaldo.reduce((a, v) => a + (v.saldo || 0), 0),
      semPremio: filtered.filter((v) => v.premio == null).length,
      // Apoio / Loc / Guincho são sempre despesas.
      despesas: filtered.reduce(
        (a, v) => a + (v.apoio || 0) + (v.loc2 || 0) + (v.guincho || 0),
        0,
      ),
    };
  }, [filtered]);

  const monthChart = useMemo(() => {
    if (!data?.byMonth) return [];
    if (month === "all") return data.byMonth.filter((m) => m.key !== "sem-data");
    return data.byMonth.filter((m) => m.key === month);
  }, [data, month]);

  const assessoriaChart = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      const key = v.assessoria || "(vazio)";
      if (!map.has(key)) map.set(key, { key, premio: 0, veiculos: 0 });
      const b = map.get(key);
      b.veiculos += 1;
      b.premio += v.premio || 0;
    }
    return [...map.values()].sort((a, b) => b.premio - a.premio).slice(0, 8);
  }, [filtered]);

  const activeFilterCount =
    [month, assessoria, loc1, banco].filter((v) => v !== "all").length +
    (q.trim() ? 1 : 0) +
    (semPremioOnly ? 1 : 0);

  const clearFilters = () => {
    setMonth("all");
    setAssessoria("all");
    setLoc1("all");
    setBanco("all");
    setQ("");
    setSemPremioOnly(false);
  };

  const openSemPremio = () => {
    setSemPremioOnly(true);
    setTab("veiculos");
  };

  const monthHighlight = highlightIndex(monthChart);
  const assessoriaHighlight = highlightIndex(assessoriaChart);
  const assessoriaMax = assessoriaChart[0]?.premio || 1;

  const alertCount = otherAlerts.length;

  if (loading && !data) {
    return (
      <div className="app app-shell">
        <header className="app-header">
          <div className="brand-mark">
            GPS <span>BA</span>
          </div>
        </header>
        <div className="kpi-scroll">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="skeleton-kpi" />
          ))}
        </div>
        <SkeletonBlock className="skeleton-panel" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="app state-screen">
        <div className="state-card">
          <p className="state-eyebrow">Conexão</p>
          <h1>Não foi possível carregar os dados</h1>
          <p className="state-body">{error}</p>
          <button className="btn btn-primary btn-block" type="button" onClick={() => reload()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const filtersForm = (
    <>
      <div className="filter">
        <label htmlFor="month">Mês</label>
        <select id="month" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Todos</option>
          {(data?.filters?.months || []).map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter">
        <label htmlFor="assessoria">Assessoria</label>
        <select
          id="assessoria"
          value={assessoria}
          onChange={(e) => setAssessoria(e.target.value)}
        >
          <option value="all">Todas</option>
          {(tab === "crm"
            ? [
                ...new Set([
                  ...(data?.filters?.assessorias || []),
                  ...(crm.data?.filters?.assessorias || []),
                ]),
              ].sort((a, b) => a.localeCompare(b, "pt-BR"))
            : data?.filters?.assessorias || []
          ).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter">
        <label htmlFor="loc1">Localizador</label>
        <select id="loc1" value={loc1} onChange={(e) => setLoc1(e.target.value)}>
          <option value="all">Todos</option>
          {(tab === "crm"
            ? [
                ...new Set([
                  ...(data?.filters?.localizadores || []),
                  ...(crm.data?.filters?.localizadores || []),
                ]),
              ].sort((a, b) => a.localeCompare(b, "pt-BR"))
            : data?.filters?.localizadores || []
          ).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter">
        <label htmlFor="banco">Banco</label>
        <select id="banco" value={banco} onChange={(e) => setBanco(e.target.value)}>
          <option value="all">Todos</option>
          {(data?.filters?.bancos || []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter">
        <label htmlFor="q">Busca</label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Placa, banco, contato…"
          enterKeyHint="search"
        />
      </div>
    </>
  );

  return (
    <div className="app app-shell">
      <header className="app-header">
        <div className="header-row">
          <div>
            <div className="brand-mark">
              GPS <span>BA</span>
            </div>
            <p className="brand-sub hide-mobile">Controle de Diligências</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Adicionar veículo"
              onClick={() => setAddOpen(true)}
            >
              <IconPlus />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-filters"
              aria-label="Filtros"
              onClick={() => setFiltersOpen(true)}
            >
              <IconFilter />
              {activeFilterCount > 0 && <span className="badge">{activeFilterCount}</span>}
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-primary"
              aria-label="Atualizar"
              disabled={loading}
              onClick={() => reload({ refresh: true })}
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              tab === "crm"
                ? "Buscar no CRM: placa, loc, assessoria, status…"
                : "Buscar placa, assessoria, banco, loc…"
            }
            enterKeyHint="search"
            aria-label="Buscar"
          />
        </div>
      </header>

      <main className={`tab-panels tab-${tab}`}>
        <section className="filters desktop-filters desktop-only">{filtersForm}</section>

        {/* RESUMO */}
        <section className={`tab-panel ${tab === "resumo" ? "is-active" : ""}`}>
          <div className="hero-saldo">
            <p className="hero-label">Saldo do período</p>
            <p className={`hero-value ${filteredTotals.saldo < 0 ? "negative" : "positive"}`}>
              {formatBRL(filteredTotals.saldo)}
            </p>
            <p className="hero-meta">
              {filteredTotals.veiculos} veículos
              {activeFilterCount ? " · filtrado" : ""}
              {alertCount ? ` · ${alertCount} alertas` : ""}
            </p>
          </div>

          <div className="kpi-scroll" aria-label="Indicadores">
            <article className="kpi-chip">
              <span>Prêmio</span>
              <strong className="num-premio">{formatBRL(filteredTotals.premio)}</strong>
            </article>
            <article className="kpi-chip">
              <span>Despesas</span>
              <strong className="num-despesa">{formatBRL(filteredTotals.despesas)}</strong>
            </article>
            <article className="kpi-chip">
              <span>Imposto</span>
              <strong className="num-imposto">{formatBRL(filteredTotals.imposto)}</strong>
            </article>
            <article
              className="kpi-chip kpi-chip-action"
              onClick={openSemPremio}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openSemPremio()}
            >
              <span>Sem prêmio</span>
              <strong className="num-alerta">{semPremioVehicles.length}</strong>
            </article>
          </div>

          <div className="panel panel-soft">
            <div className="panel-head">
              <h2>Prêmio por mês</h2>
              <button type="button" className="link-more" onClick={() => setTab("insights")}>
                Ver detalhes ›
              </button>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#6b7380"
                    tick={{ fill: "#8b93a1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#6b7380"
                    width={32}
                    tick={{ fill: "#8b93a1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="premio" name="Prêmio" radius={[8, 8, 8, 8]} barSize={14}>
                    {monthChart.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i === monthHighlight
                            ? CHART_PALETTE[0]
                            : CHART_PALETTE[(i % (CHART_PALETTE.length - 1)) + 1]
                        }
                        fillOpacity={i === monthHighlight ? 1 : 0.72}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {semPremioVehicles.length > 0 && (
            <div className="sem-premio-list" id="sem-premio">
              <div className="panel-head">
                <h2>Sem prêmio</h2>
                <button type="button" className="link-more" onClick={openSemPremio}>
                  Ver todos ›
                </button>
              </div>
              <p className="section-hint">
                {semPremioVehicles.length} veículo
                {semPremioVehicles.length === 1 ? "" : "s"} sem valor de prêmio no período
              </p>
              {semPremioVehicles.slice(0, 6).map((v) => (
                <div key={`sp-${v.placa}-${v.data || ""}`} className="sem-premio-row">
                  <div>
                    <strong className="placa">{v.placa}</strong>
                    <span>
                      {formatDate(v.data)} · {v.assessoria || "Sem assessoria"}
                    </span>
                  </div>
                  <span className="sem-premio-meta">{v.loc1 || "Sem loc"}</span>
                </div>
              ))}
              {semPremioVehicles.length > 6 && (
                <button type="button" className="btn btn-ghost btn-block" onClick={openSemPremio}>
                  +{semPremioVehicles.length - 6} restantes
                </button>
              )}
            </div>
          )}

          {alertCount > 0 && (
            <div className="alert-list">
              <div className="panel-head">
                <h2>Atenção</h2>
                <button type="button" className="link-more" onClick={() => setTab("veiculos")}>
                  Ver veículos ›
                </button>
              </div>
              {otherAlerts.slice(0, 4).map((a, i) => (
                <div
                  key={`${a.placa}-${a.type}-${i}`}
                  className={`alert-row ${a.type === "saldo-negativo" ? "danger" : ""}`}
                >
                  <strong>{a.placa}</strong>
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* VEÍCULOS */}
        <section className={`tab-panel ${tab === "veiculos" ? "is-active" : ""}`}>
          <div className="list-meta">
            <h2>{semPremioOnly ? "Sem prêmio" : "Veículos"}</h2>
            <span>{filtered.length}</span>
          </div>

          {semPremioOnly && (
            <div className="filter-banner">
              <span>Mostrando apenas veículos sem prêmio</span>
              <button type="button" className="link-more" onClick={() => setSemPremioOnly(false)}>
                Limpar
              </button>
            </div>
          )}
          <div className="vehicle-cards">
            {filtered.map((v) => (
              <article key={`${v.placa}-${v.data || ""}`} className="vehicle-card">
                <div className="vehicle-card-top">
                  <div>
                    <p className="placa">{v.placa}</p>
                    <p className="vehicle-sub">
                      {formatDate(v.data)} · {v.loc1 || "Sem loc"}
                    </p>
                  </div>
                  <p
                    className={`vehicle-saldo ${
                      v.saldo == null ? "" : v.saldo < 0 ? "negative" : "positive"
                    }`}
                  >
                    {formatBRL(v.saldo)}
                  </p>
                </div>
                <div className="vehicle-grid">
                  <div>
                    <span>Assessoria</span>
                    <strong>{v.assessoria || "—"}</strong>
                  </div>
                  <div>
                    <span>Prêmio</span>
                    <strong className="num-premio">{formatBRL(v.premio)}</strong>
                  </div>
                  <div>
                    <span>Banco</span>
                    <strong>{v.banco || "—"}</strong>
                  </div>
                  <div>
                    <span>Contato</span>
                    <strong>{v.contato || "—"}</strong>
                  </div>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="empty-state">Nenhum veículo com os filtros atuais.</div>
            )}
          </div>

          {/* Desktop table */}
          <div className="table-wrap desktop-only" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Placa</th>
                  <th>Loc</th>
                  <th>Assessoria</th>
                  <th>Banco</th>
                  <th>Contato</th>
                  <th className="num">Prêmio</th>
                  <th className="num">Imposto</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={`t-${v.placa}-${v.data || ""}`}>
                    <td>{formatDate(v.data)}</td>
                    <td className="placa">{v.placa}</td>
                    <td>{v.loc1 || "—"}</td>
                    <td>{v.assessoria || "—"}</td>
                    <td>{v.banco || "—"}</td>
                    <td>{v.contato || "—"}</td>
                    <td className="num num-premio">{formatBRL(v.premio)}</td>
                    <td className="num num-imposto">{formatBRL(v.imposto)}</td>
                    <td
                      className={`num ${
                        v.saldo == null ? "" : v.saldo < 0 ? "saldo-neg" : "saldo-pos"
                      }`}
                    >
                      {formatBRL(v.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* INSIGHTS */}
        <section className={`tab-panel ${tab === "insights" ? "is-active" : ""}`}>
          <div className="panel panel-soft">
            <div className="panel-head">
              <h2>Top assessorias</h2>
              <span className="chip-soft">Período</span>
            </div>
            <div className="chart-box chart-box-tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={assessoriaChart}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#6b7380"
                    tick={{ fill: "#8b93a1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    width={88}
                    stroke="#6b7380"
                    tick={{ fill: "#8b93a1", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="premio" name="Prêmio" radius={[8, 8, 8, 8]} barSize={12}>
                    {assessoriaChart.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                        fillOpacity={i === assessoriaHighlight ? 1 : 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rank-list">
            <div className="panel-head">
              <h2>Ranking</h2>
            </div>
            {assessoriaChart.map((item, index) => (
              <div key={item.key} className="rank-row">
                <span className="rank-pos">{index + 1}</span>
                <div className="rank-info">
                  <strong>{item.key}</strong>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.max(8, (item.premio / assessoriaMax) * 100)}%` }}
                    />
                  </div>
                  <span>{item.veiculos} veíc.</span>
                </div>
                <strong className="rank-value num-premio">{formatBRL(item.premio)}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* CRM */}
        <section className={`tab-panel ${tab === "crm" ? "is-active" : ""}`}>
          <CrmPanel
            data={crm.data}
            loading={crm.loading}
            error={crm.error}
            saving={crm.saving}
            onReload={crm.reload}
            runAction={crm.runAction}
            searchQuery={q}
            locFilter={loc1}
            assessoriaFilter={assessoria}
          />
        </section>
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav" aria-label="Navegação principal">
        <button
          type="button"
          className={tab === "resumo" ? "is-active" : ""}
          onClick={() => setTab("resumo")}
        >
          <IconHome />
          <span>Resumo</span>
        </button>
        <button
          type="button"
          className={tab === "crm" ? "is-active" : ""}
          onClick={() => setTab("crm")}
        >
          <IconCrm />
          <span>CRM</span>
        </button>
        <button
          type="button"
          className={tab === "veiculos" ? "is-active" : ""}
          onClick={() => setTab("veiculos")}
        >
          <IconCars />
          <span>Veículos</span>
        </button>
        <button
          type="button"
          className={tab === "insights" ? "is-active" : ""}
          onClick={() => setTab("insights")}
        >
          <IconChart />
          <span>Insights</span>
        </button>
      </nav>

      {/* Filter bottom sheet */}
      {filtersOpen && (
        <div className="sheet-root mobile-sheet" role="dialog" aria-modal="true" aria-label="Filtros">
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Fechar filtros"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>Filtros</h2>
              {activeFilterCount > 0 && (
                <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                  Limpar
                </button>
              )}
            </div>
            <div className="sheet-body">{filtersForm}</div>
            <div className="sheet-foot">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => setFiltersOpen(false)}
              >
                Ver {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddVehicleSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        filters={data?.filters}
        onSaved={async () => {
          await reload({ refresh: true });
          setTab("veiculos");
        }}
      />
    </div>
  );
}
