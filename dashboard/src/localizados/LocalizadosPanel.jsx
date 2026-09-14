import { useEffect, useMemo, useState } from "react";
import "./localizados.css";

function locClass(posicao) {
  if (posicao === "Sim") return "is-sim";
  if (posicao === "Não") return "is-nao";
  return "";
}

export default function LocalizadosPanel({
  data,
  loading,
  error,
  saving,
  onReload,
  onMark,
  searchQuery = "",
}) {
  const locators = data?.locators || [];
  const lotes = data?.lotes || [];
  const [loc, setLoc] = useState("");
  const [loteId, setLoteId] = useState("");
  const [copied, setCopied] = useState(false);

  const needle = searchQuery.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  useEffect(() => {
    if (!locators.length) return;
    if (!loc || !locators.some((l) => l.id === loc)) {
      const withPend = locators.find((l) => l.pendente > 0) || locators[0];
      setLoc(withPend.id);
    }
  }, [locators, loc]);

  const locLotes = useMemo(
    () => lotes.filter((l) => l.loc === loc),
    [lotes, loc],
  );

  const hit = useMemo(() => {
    if (!needle) return null;
    return lotes.find((l) => l.items.some((it) => it.placa.includes(needle))) || null;
  }, [lotes, needle]);

  useEffect(() => {
    if (hit) {
      setLoc(hit.loc);
      setLoteId(hit.id);
      return;
    }
    const currentLoc = locators.find((l) => l.id === loc);
    if (!currentLoc) return;
    const stillThere = locLotes.some((l) => l.id === loteId);
    if (!stillThere) {
      setLoteId(currentLoc.primeiroPendente || locLotes[0]?.id || "");
    }
  }, [hit, loc, locators, locLotes, loteId]);

  const lote = locLotes.find((l) => l.id === loteId) || locLotes[0];
  const loteIndex = Math.max(0, locLotes.findIndex((l) => l.id === lote?.id));
  const locator = locators.find((l) => l.id === loc);

  async function copyZap() {
    if (!lote?.whatsapp) return;
    try {
      await navigator.clipboard.writeText(lote.whatsapp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o texto do lote:", lote.whatsapp);
    }
  }

  function go(delta) {
    const next = locLotes[loteIndex + delta];
    if (next) setLoteId(next.id);
  }

  if (loading && !data) {
    return <p className="section-hint">Carregando localizados…</p>;
  }

  if (error && !data) {
    return (
      <div className="loc-root">
        <div className="loc-banner">{error}</div>
        <button type="button" className="btn btn-primary" onClick={() => onReload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!locators.length) {
    return (
      <div className="loc-empty">
        Nenhum carro na aba Localizados. Rode o sync dos localizados na planilha.
      </div>
    );
  }

  return (
    <div className="loc-root">
      <div className="loc-head">
        <p className="loc-kicker">Checklist de posição</p>
        <h2>Confirma com o localizador</h2>
        <p className="loc-sub">
          Um lote de até 6. Copia o Zap, pergunta, marca Sim ou Não. Assessoria só depois do Sim.
        </p>
      </div>

      {error ? <div className="loc-banner">{error}</div> : null}

      <div className="loc-people" role="tablist" aria-label="Localizador">
        {locators.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={item.id === loc ? "is-active" : ""}
            onClick={() => {
              setLoc(item.id);
              setLoteId(item.primeiroPendente || "");
            }}
          >
            <strong>{item.nome}</strong>
            <span>
              {item.pendente} pendente · {item.cidade}
            </span>
          </button>
        ))}
      </div>

      {!lote ? (
        <div className="loc-empty">Nenhum lote para {locator?.nome || loc}.</div>
      ) : locator?.pendente === 0 ? (
        <div className="loc-done">
          <strong>{locator.nome} está em dia</strong>
          {locator.sim} com posição · {locator.nao} sem posição
        </div>
      ) : null}

      {lote ? (
        <div className="loc-lote">
          <div className="loc-lote-top">
            <div>
              <h3>
                {locator?.nome} · lote {lote.num}
                {lote.diaLabel ? ` · ${lote.diaLabel}` : ""}
              </h3>
              <p>
                {lote.cidade}
                {lote.tipo ? ` · ${lote.tipo}` : ""}
              </p>
            </div>
            <div className="loc-counts">
              <span>
                <b className="pendente">{lote.pendente}</b> ?
              </span>
              <span>
                <b className="sim">{lote.sim}</b> sim
              </span>
              <span>
                <b className="nao">{lote.nao}</b> não
              </span>
            </div>
          </div>

          {lote.dica ? <p className="loc-dica">{lote.dica}</p> : null}

          <button
            type="button"
            className={`loc-copy${copied ? " is-ok" : ""}`}
            onClick={copyZap}
          >
            {copied ? "Copiado. Cola no Zap." : "Copiar texto do Zap"}
          </button>

          <div className="loc-nav">
            <button type="button" disabled={loteIndex <= 0} onClick={() => go(-1)}>
              Anterior
            </button>
            <span>
              {loteIndex + 1} / {locLotes.length}
            </span>
            <button
              type="button"
              disabled={loteIndex >= locLotes.length - 1}
              onClick={() => go(1)}
            >
              Próximo
            </button>
          </div>

          {lote.pendente === 0 && loteIndex < locLotes.length - 1 ? (
            <button type="button" className="loc-copy is-ok" onClick={() => go(1)}>
              Lote ok. Ir para o próximo
            </button>
          ) : null}

          <div className="loc-cars">
            {lote.items.map((car) => (
              <article
                key={car.placa}
                className={`loc-car ${locClass(car.posicao)}${needle && car.placa.includes(needle) ? " is-hit" : ""}`}
              >
                <div className="loc-car-top">
                  <strong className="placa">{car.placa}</strong>
                  <span>{car.hora || "—"}</span>
                </div>
                <p className="loc-car-meta">
                  {[car.veiculo, car.data, car.local].filter(Boolean).join(" · ")}
                </p>
                <div className="loc-actions">
                  <button
                    type="button"
                    className={`loc-btn-p${car.posicao === "Pendente" ? " is-on" : ""}`}
                    disabled={saving}
                    onClick={() => onMark({ placa: car.placa, posicao: "Pendente" })}
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    className={`loc-btn-s${car.posicao === "Sim" ? " is-on" : ""}`}
                    disabled={saving}
                    onClick={() => onMark({ placa: car.placa, posicao: "Sim" })}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    className={`loc-btn-n${car.posicao === "Não" ? " is-on" : ""}`}
                    disabled={saving}
                    onClick={() => onMark({ placa: car.placa, posicao: "Não" })}
                  >
                    Não
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
