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
  const dias = data?.dias || data?.lotes || [];
  const [loc, setLoc] = useState("");
  const [diaId, setDiaId] = useState("");
  const [copied, setCopied] = useState(false);

  const needle = searchQuery.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  useEffect(() => {
    if (!locators.length) return;
    if (!loc || !locators.some((l) => l.id === loc)) {
      const withPend = locators.find((l) => l.pendente > 0) || locators[0];
      setLoc(withPend.id);
    }
  }, [locators, loc]);

  const locDias = useMemo(
    () => dias.filter((d) => d.loc === loc),
    [dias, loc],
  );

  const hit = useMemo(() => {
    if (!needle) return null;
    return dias.find((d) => d.items.some((it) => it.placa.includes(needle))) || null;
  }, [dias, needle]);

  useEffect(() => {
    if (hit) {
      setLoc(hit.loc);
      setDiaId(hit.id);
      return;
    }
    const currentLoc = locators.find((l) => l.id === loc);
    if (!currentLoc) return;
    const stillThere = locDias.some((d) => d.id === diaId);
    if (!stillThere) {
      setDiaId(currentLoc.primeiroPendente || locDias[0]?.id || "");
    }
  }, [hit, loc, locators, locDias, diaId]);

  const dia = locDias.find((d) => d.id === diaId) || locDias[0];
  const diaIndex = Math.max(0, locDias.findIndex((d) => d.id === dia?.id));
  const locator = locators.find((l) => l.id === loc);

  async function copyZap() {
    if (!dia?.whatsapp) return;
    try {
      await navigator.clipboard.writeText(dia.whatsapp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o texto do dia:", dia.whatsapp);
    }
  }

  function go(delta) {
    const next = locDias[diaIndex + delta];
    if (next) setDiaId(next.id);
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
          Um dia de cada vez. Locgram entra sozinho (Evolution no notebook). Você pergunta a posição e marca Sim ou Não.
          Assessoria só depois do Sim.
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
              setDiaId(item.primeiroPendente || "");
            }}
          >
            <strong>{item.nome}</strong>
            <span>
              {item.pendente} pendente · {item.cidade}
            </span>
          </button>
        ))}
      </div>

      {!dia ? (
        <div className="loc-empty">Nenhum dia para {locator?.nome || loc}.</div>
      ) : locator?.pendente === 0 ? (
        <div className="loc-done">
          <strong>{locator.nome} está em dia</strong>
          {locator.sim} com posição · {locator.nao} sem posição
        </div>
      ) : null}

      {dia ? (
        <div className="loc-lote">
          <div className="loc-lote-top">
            <div>
              <h3>
                {locator?.nome} · {dia.diaLabel}
                {` · ${dia.carros} carro${dia.carros === 1 ? "" : "s"}`}
              </h3>
              <p>
                {dia.cidade}
                {dia.juntos ? " · alguns juntos no horário" : ""}
              </p>
            </div>
            <div className="loc-counts">
              <span>
                <b className="pendente">{dia.pendente}</b> ?
              </span>
              <span>
                <b className="sim">{dia.sim}</b> sim
              </span>
              <span>
                <b className="nao">{dia.nao}</b> não
              </span>
            </div>
          </div>

          {dia.dica ? <p className="loc-dica">{dia.dica}</p> : null}

          <button
            type="button"
            className={`loc-copy${copied ? " is-ok" : ""}`}
            onClick={copyZap}
          >
            {copied
              ? "Copiado. Cola no Zap."
              : `Copiar os ${dia.carros} carros de ${dia.diaLabel}`}
          </button>

          <div className="loc-nav">
            <button type="button" disabled={diaIndex <= 0} onClick={() => go(-1)}>
              Dia anterior
            </button>
            <span>
              {diaIndex + 1} / {locDias.length}
            </span>
            <button
              type="button"
              disabled={diaIndex >= locDias.length - 1}
              onClick={() => go(1)}
            >
              Próximo dia
            </button>
          </div>

          {dia.pendente === 0 && diaIndex < locDias.length - 1 ? (
            <button type="button" className="loc-copy is-ok" onClick={() => go(1)}>
              Dia ok. Ir para o próximo
            </button>
          ) : null}

          <div className="loc-cars">
            {dia.items.map((car) => (
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
