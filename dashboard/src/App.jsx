import { useMemo, useState } from "react";
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

export default function App() {
  const { data, loading, error, reload } = useDashboard();
  const [month, setMonth] = useState("all");
  const [assessoria, setAssessoria] = useState("all");
  const [loc1, setLoc1] = useState("all");
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  if (loading && !data) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              GPS <span>BA</span>
            </div>
            <p className="brand-sub">Carregando controle de diligências…</p>
          </div>
        </header>
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="skeleton-kpi" />
          ))}
        </div>
        <div className="panel-grid">
          <SkeletonBlock className="skeleton-panel" />
          <SkeletonBlock className="skeleton-panel" />
        </div>
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
          <p className="state-hint">
            Local: <code>cd google-sheets && npm run api</code>. Na Vercel: confira as
            variáveis de ambiente.
          </p>
          <button className="btn btn-primary" type="button" onClick={() => reload()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const alertPreview = (data?.alerts || []).slice(0, 5);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            GPS <span>BA</span>
          </div>
          <p className="brand-sub">Controle de Diligências · visão gerencial</p>
        </div>
        <div className="top-actions">
          <span className="meta-chip hide-sm">
            {data?.meta?.generatedAt
              ? new Date(data.meta.generatedAt).toLocaleString("pt-BR")
              : ""}
          </span>
          <button
            className="btn btn-ghost hide-sm"
            type="button"
            onClick={() => reload()}
            disabled={loading}
          >
            Cache
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => reload({ refresh: true })}
            disabled={loading}
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {alertPreview.length > 0 && (
        <div className="alerts" role="status">
          {alertPreview.map((a, i) => (
            <span
              key={`${a.placa}-${a.type}-${i}`}
              className={`alert ${a.type === "saldo-negativo" ? "danger" : ""}`}
            >
              <strong>{a.placa}</strong> {a.message}
            </span>
          ))}
          {data.alerts.length > 5 && (
            <span className="alert muted">+{data.alerts.length - 5}</span>
          )}
        </div>
      )}

      <div className="toolbar">
        <button
          type="button"
          className="btn btn-ghost filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>
            Limpar
          </button>
        )}
        <div className="toolbar-spacer" />
        <span className="result-count">
          {filtered.length} veículo{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className={`filters ${filtersOpen ? "is-open" : ""}`}>
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
      </section>

      <section className="kpi-grid" aria-label="Indicadores">
        <article className="kpi">
          <div className="kpi-label">Veículos</div>
          <div className="kpi-value">{filteredTotals.veiculos}</div>
          <div className="kpi-hint">{filteredTotals.semPremio} sem prêmio</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Prêmio</div>
          <div className="kpi-value">{formatBRL(filteredTotals.premio)}</div>
          <div className="kpi-hint">Despesas {formatBRL(filteredTotals.despesas)}</div>
        </article>
        <article className="kpi">
          <div className="kpi-label">Imposto</div>
          <div className="kpi-value">{formatBRL(filteredTotals.imposto)}</div>
          <div className="kpi-hint">13% sobre prêmio</div>
        </article>
        <article className="kpi kpi-accent">
          <div className="kpi-label">Saldo</div>
          <div
            className={`kpi-value ${filteredTotals.saldo < 0 ? "negative" : "positive"}`}
          >
            {formatBRL(filteredTotals.saldo)}
          </div>
          <div className="kpi-hint">Após despesas e imposto</div>
        </article>
      </section>

      <section className="panel-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Prêmio por mês</h2>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(232,220,196,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#9aa6b5"
                  tick={{ fill: "#9aa6b5", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#9aa6b5"
                  width={36}
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

        <div className="panel">
          <div className="panel-head">
            <h2>Top assessorias</h2>
          </div>
          <div className="chart-box">
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
      </section>

      <section className="table-section">
        <div className="panel-head table-head">
          <h2>Veículos</h2>
          <span className="meta-chip hide-sm">Scroll horizontal no celular</span>
        </div>
        <div className="table-wrap" tabIndex={0}>
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
                <tr key={`${v.placa}-${v.data || ""}`}>
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-row">
                    Nenhum veículo com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footer">
        <span>GPS BA · planilha como fonte da verdade</span>
        <span className="hide-sm">{data?.totals?.veiculos ?? 0} registros na base</span>
      </footer>
    </div>
  );
}
