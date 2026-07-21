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
import { useDashboard } from "./hooks/useDashboard";
import { formatBRL, formatDate } from "./lib/format";
import "./index.css";

const CHART_COLORS = ["#d4a017", "#3dba8c", "#6b8cae", "#e05a45", "#c4b59a"];

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

export default function App() {
  const { data, loading, error, reload } = useDashboard();
  const [month, setMonth] = useState("all");
  const [assessoria, setAssessoria] = useState("all");
  const [loc1, setLoc1] = useState("all");
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState("resumo");

  useEffect(() => {
    document.body.style.overflow = filtersOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen]);

  const filtered = useMemo(() => {
    if (!data?.vehicles) return [];
    return data.vehicles.filter((v) => {
      if (month !== "all" && v.monthKey !== month) return false;
      if (assessoria !== "all" && v.assessoria !== assessoria) return false;
      if (loc1 !== "all" && v.loc1 !== loc1) return false;
      if (q.trim()) {
        const needle = q.trim().toUpperCase();
        const hay = `${v.placa} ${v.banco} ${v.contato} ${v.assessoria}`.toUpperCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, month, assessoria, loc1, q]);

  const filteredTotals = useMemo(() => {
    const withPremio = filtered.filter((v) => v.premio != null);
    return {
      veiculos: filtered.length,
      premio: withPremio.reduce((a, v) => a + (v.premio || 0), 0),
      imposto: withPremio.reduce((a, v) => a + (v.imposto || 0), 0),
      saldo: withPremio.reduce((a, v) => a + (v.saldo || 0), 0),
      semPremio: filtered.filter((v) => v.premio == null).length,
      despesas: withPremio.reduce(
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
    [month, assessoria, loc1].filter((v) => v !== "all").length + (q.trim() ? 1 : 0);

  const clearFilters = () => {
    setMonth("all");
    setAssessoria("all");
    setLoc1("all");
    setQ("");
  };

  const alertCount = data?.alerts?.length || 0;

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
          {(data?.filters?.assessorias || []).map((name) => (
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
          {(data?.filters?.localizadores || []).map((name) => (
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
            placeholder="Buscar placa, assessoria…"
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
              <strong>{formatBRL(filteredTotals.premio)}</strong>
            </article>
            <article className="kpi-chip">
              <span>Despesas</span>
              <strong>{formatBRL(filteredTotals.despesas)}</strong>
            </article>
            <article className="kpi-chip">
              <span>Imposto</span>
              <strong>{formatBRL(filteredTotals.imposto)}</strong>
            </article>
            <article className="kpi-chip">
              <span>Sem prêmio</span>
              <strong>{filteredTotals.semPremio}</strong>
            </article>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Prêmio por mês</h2>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(232,220,196,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#9aa6b5"
                    tick={{ fill: "#9aa6b5", fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#9aa6b5"
                    width={32}
                    tick={{ fill: "#9aa6b5", fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="premio" name="Prêmio" radius={[6, 6, 0, 0]}>
                    {monthChart.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {alertCount > 0 && (
            <div className="alert-list">
              <h2>Atenção</h2>
              {(data.alerts || []).slice(0, 4).map((a, i) => (
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
            <h2>Veículos</h2>
            <span>{filtered.length}</span>
          </div>

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
                    <strong>{formatBRL(v.premio)}</strong>
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
                    <td className="num">{formatBRL(v.premio)}</td>
                    <td className="num">{formatBRL(v.imposto)}</td>
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
          <div className="panel">
            <div className="panel-head">
              <h2>Top assessorias</h2>
            </div>
            <div className="chart-box chart-box-tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={assessoriaChart}
                  layout="vertical"
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(232,220,196,0.08)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#9aa6b5"
                    tick={{ fill: "#9aa6b5", fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    width={88}
                    stroke="#9aa6b5"
                    tick={{ fill: "#9aa6b5", fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="premio" name="Prêmio" fill="#d4a017" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rank-list">
            <h2>Ranking</h2>
            {assessoriaChart.map((item, index) => (
              <div key={item.key} className="rank-row">
                <span className="rank-pos">{index + 1}</span>
                <div className="rank-info">
                  <strong>{item.key}</strong>
                  <span>{item.veiculos} veíc.</span>
                </div>
                <strong className="rank-value">{formatBRL(item.premio)}</strong>
              </div>
            ))}
          </div>
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
        <div className="sheet-root" role="dialog" aria-modal="true" aria-label="Filtros">
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
    </div>
  );
}
