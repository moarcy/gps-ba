import { useMemo, useState } from "react";
import { STATUS_LABELS } from "../crm/status";
import RadarMap from "./RadarMap";
import "./radar.css";

function formatWhen(iso, fallback) {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return fallback || "—";
}

function pct(p) {
  if (p == null || Number.isNaN(p)) return "—";
  const v = p * 100;
  if (v < 1) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatPeriod(period) {
  if (!period?.from && !period?.to) return "sem período";
  return `${formatWhen(period.from)} → ${formatWhen(period.to)}`;
}

function formatDays(days) {
  if (days == null) return "—";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} min`;
  if (days < 10) return `${days.toFixed(1).replace(".0", "")} d`;
  return `${Math.round(days)} d`;
}

function crmChip(record) {
  if (!record) return { label: "Fora do CRM", kind: "muted" };
  if (record.status === "inapto" || record.status === "cancelado") {
    return { label: STATUS_LABELS[record.status] || record.status, kind: "bad" };
  }
  if (record.temMandado || record.status === "com_mandado") {
    return { label: "Apto · mandado", kind: "go" };
  }
  return {
    label: STATUS_LABELS[record.status] || record.status || "No CRM",
    kind: "warn",
  };
}

function withCrmScore(plate, crm, formula = {}) {
  const base = Number(plate.score) || 0;
  let delta = 0;
  if (crm) {
    if (crm.status === "inapto" || crm.status === "cancelado") delta = formula.crmInapto ?? -35;
    else if (crm.temMandado || crm.status === "com_mandado") delta = formula.crmMandado ?? 20;
    else delta = formula.crmKnown ?? 5;
  }
  const score = Math.max(0, Math.min(100, base + delta));
  const band = score >= 50 ? "go" : score >= 30 ? "watch" : "low";
  return { score, band };
}

function ago(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function bandLabel(band) {
  if (band === "go") return "ir agora";
  if (band === "watch") return "observar";
  return "fila baixa";
}

function hopLabel(h) {
  const iqr =
    h.q25 != null && h.q75 != null ? `IQR ${Math.round(h.q25)}–${Math.round(h.q75)} min` : null;
  const bits = [
    `${h.count}x`,
    `~${Math.round(h.median || h.minutes || 0)} min`,
    iqr,
    h.p != null ? `P ${pct(h.p)}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export default function RadarPanel({
  data,
  loading,
  error,
  onReload,
  searchQuery = "",
  crmByPlaca = {},
  active = false,
  phone = false,
}) {
  const [placa, setPlaca] = useState("");
  const [cameraId, setCameraId] = useState("");

  const formula = data?.scoreFormula || {};
  const clock = data?.clock;
  const quality = data?.quality;
  const meta = data?.meta || {};

  const plates = useMemo(() => {
    const q = searchQuery.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const rows = (data?.plates || []).map((p) => {
      const crm = crmByPlaca[p.placa];
      const scored = withCrmScore(p, crm, formula);
      return { ...p, ...scored };
    });
    return rows
      .filter((p) => {
        if (q && !p.placa.includes(q)) return false;
        if (cameraId && !(p.points || []).some((pt) => String(pt.camera || "").toUpperCase() === cameraId)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.score - a.score || b.feira - a.feira);
  }, [data, searchQuery, cameraId, crmByPlaca, formula]);

  const selected = useMemo(
    () => plates.find((p) => p.placa === placa) || (data?.plates || []).find((p) => p.placa === placa) || null,
    [data, placa, plates],
  );

  const hops = useMemo(() => Object.values(data?.nextAfterFeira || {}), [data]);
  const camerasWithGeo = (data?.cameras || []).filter((c) => c.lat != null && c.lon != null);
  const discardedGps = quality?.discardedHops?.sameGps || 0;

  return (
    <div className="radar-panel">
      {!phone && (
        <div className="radar-head">
          <div>
            <p className="radar-kicker">Operação isolada</p>
            <h2>Feira · veículos pesados</h2>
            <p className="radar-sub">
              GO só quando a origem da câmera é Feira. Destino Feira e pórtico invertido (mesmo GPS)
              não disparam ordem de rua.
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => onReload?.()} disabled={loading}>
            Atualizar
          </button>
        </div>
      )}

      {error && <div className="radar-banner radar-banner-error">{error}</div>}
      {loading && !data && <p className="section-hint">Lendo o radar…</p>}

      {!loading && meta.sightings === 0 && (
        <div className="radar-banner">
          Ainda não há histórico. No PC, na pasta <code>telegram-radar</code>, rode{" "}
          <code>npm run import:history</code> — o sistema lê o Painel RK pela sua sessão.
        </div>
      )}

      {phone ? (
        <p className="radar-kpi-line">
          Hoje <strong>{meta.today || 0}</strong>
          {" · "}Quente <strong>{meta.hot || 0}</strong>
          {" · "}Feira <strong>{meta.feiraOrigin || clock?.n || 0}</strong>
          {" · "}
          <strong>{meta.plates || 0}</strong> placas
        </p>
      ) : (
      <div className="radar-kpis">
        <article>
          <span>Hoje na praça</span>
          <strong>{meta.today || 0}</strong>
        </article>
        <article>
          <span>Quente (2h)</span>
          <strong>{meta.hot || 0}</strong>
        </article>
        <article>
          <span>Origem Feira</span>
          <strong>{meta.feiraOrigin || clock?.n || 0}</strong>
        </article>
        <article>
          <span>Placas</span>
          <strong>{meta.plates || 0}</strong>
        </article>
      </div>
      )}

      {!phone && clock && clock.n > 0 && (
        <div className="radar-clock">
          <div className="panel-head">
            <h2>Relógio da praça</h2>
            <span>
              n={clock.n} origem Feira · {clock.uniqueDays || "—"} dia(s) · {formatPeriod(clock.period)}
            </span>
          </div>
          {clock.best3h && (
            <p className="radar-clock-main">
              Janela {pad(clock.best3h.hour)}h–{pad(clock.best3h.endHour)}h · {clock.best3h.count}x · P{" "}
              {pct(clock.best3h.rawP)}{" "}
              <em>
                IC {pct(clock.best3h.lo)}–{pct(clock.best3h.hi)}
              </em>
            </p>
          )}
          {clock.bestHour && (
            <p className="section-hint">
              Hora mais vista: {pad(clock.bestHour.hour)}h · P suavizada {pct(clock.bestHour.p)} (bruta{" "}
              {pct(clock.bestHour.rawP)}). Laplace + Wilson — 1 hit não vira 100%.
            </p>
          )}
          {clock.hypothesis && (
            <p className="radar-note">
              Hipótese de horário (n&lt;8 ou menos de 5 dias no recorte) — não tratar como padrão semanal.
            </p>
          )}
          {clock.weekendSplit && !clock.weekendSplit.ok && (
            <p className="section-hint">{clock.weekendSplit.reason}</p>
          )}
        </div>
      )}

      {!phone && (
      <div className="radar-hops">
        <div className="panel-head">
          <h2>Próximo ponto depois de Feira</h2>
        </div>
        {hops.length > 0 ? (
          hops.slice(0, 6).map((h) => (
            <button
              key={`${h.from}-${h.to}`}
              type="button"
              className="radar-hop"
              onClick={() => setCameraId(h.to)}
            >
              <strong>{h.to}</strong>
              <span>{hopLabel(h)}</span>
            </button>
          ))
        ) : (
          <p className="section-hint">
            Ainda sem hop útil (câmera à frente com ≥5 min e ≥0,5 km).{" "}
            {discardedGps
              ? `${discardedGps === 1 ? "1 transição tinha" : `${discardedGps} transições tinham`} o mesmo GPS — pórtico invertido, não deslocamento.`
              : "Falta ping numa câmera depois da praça."}
          </p>
        )}
      </div>
      )}

      {!phone && quality && (
        <p className="radar-quality">
          n={quality.n} corredor · {quality.feiraOrigin} origem Feira · {formatPeriod(quality.period)} ·
          definição: origem da câmera
          {quality.camerasWithoutGps ? ` · ${quality.camerasWithoutGps} câmera(s) sem GPS` : ""}
          {quality.sameGpsOpposite?.length
            ? ` · ${quality.sameGpsOpposite.length} câmera(s) no mesmo GPS da praça (sentido oposto)`
            : ""}
        </p>
      )}

      <div className="radar-map-wrap">
        <RadarMap
          cameras={camerasWithGeo}
          trajectory={selected?.points || []}
          selectedCamera={cameraId}
          onSelectCamera={(id) => setCameraId((cur) => (cur === id ? "" : id))}
          active={active}
        />
        <p className="radar-legend">
          <span className="dot feira" /> Feira de Santana (origem)
          <span className="dot hop" /> outras câmeras da mesma placa
          {selected ? ` · trajeto ${selected.placa}` : " · toque numa placa para ver o caminho"}
        </p>
      </div>

      <div className="radar-split">
        <div className="radar-plates">
          <div className="panel-head">
            <h2>Fila agora</h2>
            <span>{plates.length}</span>
          </div>
          {plates.length === 0 && <p className="section-hint">Nenhuma placa com o filtro atual.</p>}
          {plates.slice(0, 80).map((p) => {
            const crm = crmByPlaca[p.placa];
            const chip = crmChip(crm);
            const band = p.band || p.scoreBand;
            const when = ago(p.lastIso) || formatWhen(p.lastIso, p.lastDataHora);
            return (
              <button
                key={p.placa}
                type="button"
                className={`radar-plate ${placa === p.placa ? "is-active" : ""}`}
                onClick={() => setPlaca((cur) => (cur === p.placa ? "" : p.placa))}
              >
                {phone ? (
                  <>
                    <strong className="placa">{p.placa}</strong>
                    <span>{when}</span>
                    <em className={`radar-chip ${band === "go" ? "go" : band === "watch" ? "warn" : "muted"}`}>
                      {bandLabel(band)}
                    </em>
                  </>
                ) : (
                  <>
                    <div>
                      <strong className="placa">{p.placa}</strong>
                      <span>
                        {p.feira}x Feira · {p.total} passagem{p.total === 1 ? "" : "ens"} · score {p.score}
                      </span>
                    </div>
                    <div className="radar-plate-chips">
                      <em className={`radar-chip ${p.scoreBand === "go" ? "go" : p.scoreBand === "watch" ? "warn" : "muted"}`}>
                        {bandLabel(p.scoreBand)}
                      </em>
                      <em className={`radar-chip ${chip.kind}`}>{chip.label}</em>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {!phone && (
        <div className="radar-detail">
          {selected ? (
            <>
              <div className="panel-head">
                <h2>{selected.placa}</h2>
                <span>
                  {selected.score}/100 · {bandLabel(selected.scoreBand)}
                </span>
              </div>
              {selected.action && <p className="radar-action">{selected.action}</p>}
              <p className="section-hint">
                Última: {selected.lastCamera || "—"} · {formatWhen(selected.lastIso, selected.lastDataHora)}
              </p>
              {selected.eta?.hop && (
                <p className="section-hint">
                  Hop: {selected.eta.hop.to} · {hopLabel(selected.eta.hop)}
                </p>
              )}
              {selected.recurrence?.nGaps > 0 && (
                <p className="section-hint">
                  Recorrência na praça: mediana {formatDays(selected.recurrence.medianDays)} (
                  {selected.recurrence.nGaps} intervalo
                  {selected.recurrence.nGaps === 1 ? "" : "s"})
                </p>
              )}
              {selected.scoreReasons?.length > 0 && (
                <p className="radar-reasons">{selected.scoreReasons.join(" · ")}</p>
              )}
              <ol className="radar-timeline">
                {(selected.points || []).map((pt, i) => (
                  <li key={`${pt.iso}-${i}`} className={pt.feira ? "is-feira" : ""}>
                    <strong>{pt.camera || "câmera"}</strong>
                    <span>
                      {formatWhen(pt.iso, pt.dataHora)}
                      {pt.rota ? ` · ${pt.rota}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="section-hint">Selecione uma placa para ver como agir, hop e horário.</p>
          )}
        </div>
        )}
      </div>

      {phone && selected && (
        <div className="sheet-root mobile-sheet" role="dialog" aria-modal="true" aria-label={selected.placa}>
          <button type="button" className="sheet-backdrop" aria-label="Fechar" onClick={() => setPlaca("")} />
          <div className="sheet sheet-tall">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2 className="placa">{selected.placa}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setPlaca("")}>
                Fechar
              </button>
            </div>
            <div className="sheet-body">
              <p className="section-hint">
                {selected.score}/100 · {bandLabel(selected.band || selected.scoreBand)} · {selected.feira}x Feira
                {" · "}
                {crmChip(crmByPlaca[selected.placa]).label}
              </p>
              {selected.action && <p className="radar-action">{selected.action}</p>}
              <p className="section-hint">
                Última: {selected.lastCamera || "—"} · {formatWhen(selected.lastIso, selected.lastDataHora)}
              </p>
              {selected.eta?.hop && (
                <p className="section-hint">
                  Próximo ponto: {selected.eta.hop.to} · {hopLabel(selected.eta.hop)}
                </p>
              )}
              <ol className="radar-timeline">
                {(selected.points || []).map((pt, i) => (
                  <li key={`${pt.iso}-${i}`} className={pt.feira ? "is-feira" : ""}>
                    <strong>{pt.camera || "câmera"}</strong>
                    <span>
                      {formatWhen(pt.iso, pt.dataHora)}
                      {pt.rota ? ` · ${pt.rota}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
