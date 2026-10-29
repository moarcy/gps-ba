import { useMemo, useState } from "react";
import AddVehicleSheet from "../AddVehicleSheet";
import CrmPanel from "../crm/CrmPanel";
import { formatBRL, formatDate } from "../lib/format";
import LocalizadosPanel from "../localizados/LocalizadosPanel";
import NfsePanel from "../nfse/NfsePanel";
import RadarPanel from "../radar/RadarPanel";
import "./mobile.css";

const SEARCH_TABS = new Set(["local", "feira", "crm", "calendario", "veiculos"]);
const FILTER_TABS = new Set(["resumo", "veiculos", "insights", "crm", "calendario"]);
const NESTED = {
  local: "Local",
  feira: "Feira",
  veiculos: "Veículos",
  insights: "Insights",
  nfse: "NFS-e",
};
const TITLES = {
  crm: "CRM",
  resumo: "Início",
  calendario: "Calendário",
  mais: "Mais",
  ...NESTED,
};

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3.2 3.5 10.2V21h6.2v-6.1h4.6V21h6.2V10.2L12 3.2Z" />
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

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3.2h2v2.1h6V3.2h2v2.1h2.2c.9 0 1.6.7 1.6 1.6v12.3c0 .9-.7 1.6-1.6 1.6H4.8c-.9 0-1.6-.7-1.6-1.6V6.9c0-.9.7-1.6 1.6-1.6H7V3.2Zm12.2 7.2H4.8v8.6h14.4v-8.6ZM7.2 13h2.2v2.2H7.2V13Zm3.7 0h2.2v2.2h-2.2V13Z"
      />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="currentColor" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" fill="currentColor" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 6.2h16v1.7H4V6.2Zm3 5h10v1.7H7v-1.7Zm2.5 5h5v1.7h-5v-1.7Z" />
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

const NAV = [
  ["crm", "CRM", IconCrm],
  ["resumo", "Início", IconHome],
  ["calendario", "Calendário", IconCalendar],
  ["mais", "Mais", IconMore],
];

function saldoClass(value) {
  if (value == null) return "";
  return value < 0 ? "negative" : "positive";
}

export default function MobileApp({
  tab,
  setTab,
  q,
  setQ,
  month,
  setMonth,
  assessoria,
  setAssessoria,
  loc1,
  setLoc1,
  banco,
  setBanco,
  semPremioOnly,
  setSemPremioOnly,
  clearFilters,
  filtersOpen,
  setFiltersOpen,
  addOpen,
  setAddOpen,
  data,
  loading,
  error,
  reload,
  filtered,
  filteredTotals,
  semPremioVehicles,
  otherAlerts,
  assessoriaChart,
  bancoChart,
  crm,
  nfse,
  localizados,
  radar,
  crmByPlaca,
}) {
  const [vehicle, setVehicle] = useState(null);
  const [insight, setInsight] = useState("assessoria");

  const assessoriaOptions = useMemo(() => {
    if (tab !== "crm" && tab !== "calendario") return data?.filters?.assessorias || [];
    return [
      ...new Set([
        ...(data?.filters?.assessorias || []),
        ...(crm.data?.filters?.assessorias || []),
      ]),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tab, data, crm.data]);

  const locOptions = useMemo(() => {
    if (tab !== "crm" && tab !== "calendario") return data?.filters?.localizadores || [];
    return [
      ...new Set([
        ...(data?.filters?.localizadores || []),
        ...(crm.data?.filters?.localizadores || []),
      ]),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tab, data, crm.data]);

  const monthLabel = data?.filters?.months?.find((m) => m.key === month)?.label || month;
  const sheetCount =
    [month, assessoria, loc1, banco].filter((v) => v !== "all").length + (semPremioOnly ? 1 : 0);

  const refreshing =
    loading ||
    (tab === "nfse" && nfse.loading) ||
    (tab === "local" && localizados.loading) ||
    (tab === "feira" && radar.loading) ||
    ((tab === "crm" || tab === "calendario") && crm.loading);

  const refresh = () => {
    if (tab === "nfse") nfse.reload();
    else if (tab === "crm" || tab === "calendario") crm.reload();
    else if (tab === "local") localizados.reload();
    else if (tab === "feira") radar.reload();
    else reload({ refresh: true });
  };

  const openSemPremio = () => {
    setSemPremioOnly(true);
    setTab("veiculos");
  };

  const searchPlaceholder =
    tab === "crm" || tab === "calendario"
      ? "Placa, loc, assessoria, status"
      : tab === "local"
        ? "Placa do dia"
        : tab === "feira"
          ? "Placa no radar"
          : "Placa, banco, contato";

  const dashNeeded = tab === "resumo" || tab === "veiculos" || tab === "insights";
  const insightRows = insight === "assessoria" ? assessoriaChart : bancoChart;

  let body = null;
  if (dashNeeded && loading && !data) {
    body = <p className="section-hint">Carregando o controle…</p>;
  } else if (dashNeeded && error && !data) {
    body = (
      <div className="phone-state">
        <p className="hero-label">Conexão</p>
        <h1>Não foi possível carregar</h1>
        <p className="section-hint">{error}</p>
        <button className="btn btn-primary btn-block" type="button" onClick={() => reload()}>
          Tentar de novo
        </button>
      </div>
    );
  } else if (tab === "local") {
    body = (
      <LocalizadosPanel
        phone
        data={localizados.data}
        loading={localizados.loading}
        error={localizados.error}
        saving={localizados.saving}
        onReload={localizados.reload}
        onMark={localizados.mark}
        searchQuery={q}
      />
    );
  } else if (tab === "feira") {
    body = (
      <RadarPanel
        phone
        data={radar.data}
        loading={radar.loading}
        error={radar.error}
        onReload={radar.reload}
        searchQuery={q}
        crmByPlaca={crmByPlaca}
        active={tab === "feira"}
      />
    );
  } else if (tab === "crm" || tab === "calendario") {
    body = (
      <CrmPanel
        phone
        view={tab === "calendario" ? "calendario" : undefined}
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
    );
  } else if (tab === "resumo") {
    body = (
      <>
        <section className="phone-hero">
          <p className="hero-label">Saldo do período</p>
          <p className={`phone-hero-value ${saldoClass(filteredTotals.saldo)}`}>
            {formatBRL(filteredTotals.saldo)}
          </p>
          <p className="hero-meta">{filteredTotals.veiculos} veículos</p>
        </section>
        <div className="phone-group">
          <button type="button" className="phone-row" onClick={() => setTab("insights")}>
            <span>Prêmio</span>
            <strong className="num-premio">{formatBRL(filteredTotals.premio)}</strong>
          </button>
          <div className="phone-row">
            <span>Despesas</span>
            <strong className="num-despesa">{formatBRL(filteredTotals.despesas)}</strong>
          </div>
          <div className="phone-row">
            <span>Imposto</span>
            <strong className="num-imposto">{formatBRL(filteredTotals.imposto)}</strong>
          </div>
          <button type="button" className="phone-row" onClick={openSemPremio}>
            <span>Sem prêmio</span>
            <strong className="num-alerta">{semPremioVehicles.length}</strong>
          </button>
        </div>
        {otherAlerts.length > 0 && (
          <div className="phone-group">
            <p className="phone-group-label">Atenção</p>
            {otherAlerts.slice(0, 3).map((a, i) => (
              <button
                key={`${a.placa}-${a.type}-${i}`}
                type="button"
                className="phone-row"
                onClick={() => {
                  setQ(a.placa);
                  setTab("veiculos");
                }}
              >
                <span className="phone-row-text">
                  <strong className="placa">{a.placa}</strong>
                  <span className="phone-sub">{a.message}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else if (tab === "veiculos") {
    body = (
      <div className="phone-group">
        {filtered.length === 0 && (
          <p className="section-hint">Nenhum veículo com os filtros atuais.</p>
        )}
        {filtered.map((v) => (
          <button
            key={`${v.placa}-${v.data || ""}`}
            type="button"
            className="phone-row"
            onClick={() => setVehicle(v)}
          >
            <span className="phone-row-text">
              <strong className="placa">{v.placa}</strong>
              <span className="phone-sub">{formatDate(v.data)}</span>
            </span>
            <strong className={saldoClass(v.saldo)}>{formatBRL(v.saldo)}</strong>
          </button>
        ))}
      </div>
    );
  } else if (tab === "insights") {
    body = (
      <>
        <div className="phone-segment" role="tablist" aria-label="Ranking">
          <button
            type="button"
            className={insight === "assessoria" ? "is-active" : ""}
            onClick={() => setInsight("assessoria")}
          >
            Assessorias
          </button>
          <button
            type="button"
            className={insight === "banco" ? "is-active" : ""}
            onClick={() => setInsight("banco")}
          >
            Bancos
          </button>
        </div>
        <div className="phone-group">
          {insightRows.length === 0 && <p className="section-hint">Nenhum dado no período.</p>}
          {insightRows.map((item, index) => (
            <div key={item.key} className="phone-row">
              <span className="phone-rank">{index + 1}</span>
              <span className="phone-row-text">
                <strong>{item.key}</strong>
                <span className="phone-sub">{item.veiculos} veíc.</span>
              </span>
              <strong className="num-premio">{formatBRL(item.premio)}</strong>
            </div>
          ))}
        </div>
      </>
    );
  } else if (tab === "nfse") {
    body = (
      <NfsePanel
        phone
        data={nfse.data}
        loading={nfse.loading}
        error={nfse.error}
        saving={nfse.saving}
        onReload={nfse.reload}
        runAction={nfse.runAction}
      />
    );
  } else {
    body = (
      <div className="phone-group">
        <button type="button" className="phone-row" onClick={() => setTab("local")}>
          <span>Local</span>
          <span className="phone-chevron">›</span>
        </button>
        <button type="button" className="phone-row" onClick={() => setTab("feira")}>
          <span>Feira</span>
          <span className="phone-chevron">›</span>
        </button>
        <button type="button" className="phone-row" onClick={() => setTab("veiculos")}>
          <span>Veículos</span>
          <span className="phone-chevron">{data ? filtered.length : ""} ›</span>
        </button>
        <button type="button" className="phone-row" onClick={() => setTab("insights")}>
          <span>Insights</span>
          <span className="phone-chevron">›</span>
        </button>
        <button type="button" className="phone-row" onClick={() => setTab("nfse")}>
          <span>NFS-e</span>
          <span className="phone-chevron">›</span>
        </button>
        <button type="button" className="phone-row" onClick={() => setAddOpen(true)}>
          <span>Adicionar veículo</span>
          <span className="phone-chevron">›</span>
        </button>
      </div>
    );
  }

  const chips = [];
  if (FILTER_TABS.has(tab)) {
    if (month !== "all") chips.push({ key: "month", label: monthLabel, clear: () => setMonth("all") });
    if (assessoria !== "all") {
      chips.push({ key: "ass", label: assessoria, clear: () => setAssessoria("all") });
    }
    if (loc1 !== "all" && tab !== "local") {
      chips.push({ key: "loc", label: loc1, clear: () => setLoc1("all") });
    }
    if (banco !== "all") chips.push({ key: "banco", label: banco, clear: () => setBanco("all") });
    if (semPremioOnly) {
      chips.push({ key: "sp", label: "Sem prêmio", clear: () => setSemPremioOnly(false) });
    }
  }

  return (
    <div className="phone">
      <header className="phone-header">
        <div className="phone-top">
          {NESTED[tab] ? (
            <button type="button" className="phone-back" onClick={() => setTab("mais")}>
              ‹ Mais
            </button>
          ) : (
            <div className="brand-mark phone-brand">
              GPS <span>BA</span>
            </div>
          )}
          <div className="phone-tools">
            {FILTER_TABS.has(tab) && (
              <button
                type="button"
                className="phone-icon"
                aria-label="Filtros"
                onClick={() => setFiltersOpen(true)}
              >
                <IconFilter />
                {sheetCount > 0 && <span className="badge">{sheetCount}</span>}
              </button>
            )}
            <button
              type="button"
              className="phone-icon phone-icon-primary"
              aria-label="Atualizar"
              disabled={refreshing}
              onClick={refresh}
            >
              <IconRefresh />
            </button>
          </div>
        </div>
        <h1 className="phone-title">{TITLES[tab] || "GPS BA"}</h1>
        {SEARCH_TABS.has(tab) && (
          <div className="phone-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              enterKeyHint="search"
              aria-label="Buscar"
            />
          </div>
        )}
      </header>

      {chips.length > 0 && (
        <div className="phone-chips">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="phone-chip" onClick={chip.clear} aria-label={`Remover ${chip.label}`}>
              {chip.label} ×
            </button>
          ))}
        </div>
      )}

      <main className="phone-main">{body}</main>

      <nav className="phone-nav" aria-label="Navegação principal">
        {NAV.map(([id, label, Icon]) => {
          const active = id === "mais" ? Boolean(NESTED[tab] || tab === "mais") : tab === id;
          return (
            <button
              key={id}
              type="button"
              className={active ? "is-active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

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
              {sheetCount > 0 && (
                <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                  Limpar
                </button>
              )}
            </div>
            <div className="sheet-body">
              <div className="filter">
                <label htmlFor="phone-month">Mês</label>
                <select id="phone-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                  <option value="all">Todos</option>
                  {(data?.filters?.months || []).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter">
                <label htmlFor="phone-assessoria">Assessoria</label>
                <select
                  id="phone-assessoria"
                  value={assessoria}
                  onChange={(e) => setAssessoria(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {assessoriaOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter">
                <label htmlFor="phone-loc">Localizador</label>
                <select id="phone-loc" value={loc1} onChange={(e) => setLoc1(e.target.value)}>
                  <option value="all">Todos</option>
                  {locOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter">
                <label htmlFor="phone-banco">Banco</label>
                <select id="phone-banco" value={banco} onChange={(e) => setBanco(e.target.value)}>
                  <option value="all">Todos</option>
                  {(data?.filters?.bancos || []).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sheet-foot">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => setFiltersOpen(false)}
              >
                {tab === "crm" || tab === "calendario" || tab === "insights"
                  ? "Aplicar"
                  : `Ver ${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {vehicle && (
        <div className="sheet-root mobile-sheet" role="dialog" aria-modal="true" aria-label={vehicle.placa}>
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Fechar"
            onClick={() => setVehicle(null)}
          />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2 className="placa">{vehicle.placa}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setVehicle(null)}>
                Fechar
              </button>
            </div>
            <div className="sheet-body">
              <div className="phone-group">
                <div className="phone-row">
                  <span>Data</span>
                  <strong>{formatDate(vehicle.data)}</strong>
                </div>
                <div className="phone-row">
                  <span>Saldo</span>
                  <strong className={saldoClass(vehicle.saldo)}>{formatBRL(vehicle.saldo)}</strong>
                </div>
                <div className="phone-row">
                  <span>Prêmio</span>
                  <strong className="num-premio">{formatBRL(vehicle.premio)}</strong>
                </div>
                <div className="phone-row">
                  <span>Imposto</span>
                  <strong className="num-imposto">{formatBRL(vehicle.imposto)}</strong>
                </div>
                <div className="phone-row">
                  <span>Assessoria</span>
                  <strong>{vehicle.assessoria || "—"}</strong>
                </div>
                <div className="phone-row">
                  <span>Banco</span>
                  <strong>{vehicle.banco || "—"}</strong>
                </div>
                <div className="phone-row">
                  <span>Localizador</span>
                  <strong>{vehicle.loc1 || "—"}</strong>
                </div>
                <div className="phone-row">
                  <span>Contato</span>
                  <strong>{vehicle.contato || "—"}</strong>
                </div>
              </div>
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
