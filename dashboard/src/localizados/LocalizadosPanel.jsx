import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import "./localizados.css";

function locClass(posicao) {
  if (posicao === "Sim") return "is-sim";
  if (posicao === "Não") return "is-nao";
  return "";
}

function countPos(items) {
  const counts = { pendente: 0, sim: 0, nao: 0, total: items.length };
  for (const it of items) {
    if (it.posicao === "Sim") counts.sim += 1;
    else if (it.posicao === "Não") counts.nao += 1;
    else counts.pendente += 1;
  }
  return counts;
}

function compareDays(a, b) {
  if (a === b) return 0;
  if (a === "sem-data") return 1;
  if (b === "sem-data") return -1;
  return a < b ? 1 : -1;
}

function temJuntos(items) {
  const times = items.map((item) => item.ts).filter(Boolean).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] <= 45 * 60 * 1000) return true;
  }
  return false;
}

function mapaDe(obs) {
  const match = String(obs || "").match(/https:\/\/maps\.google\.com\/\?q=-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function lineCar(it) {
  const bits = [it.placa];
  if (it.veiculo) bits.push(it.veiculo);
  if (it.hora) bits.push(`— ${it.hora}`);
  if (it.loc === "CARLOS") bits.push("· Carlos");
  return bits.join(" ");
}

function whatsappDia({ nome, cidade, diaLabel, items, juntos }) {
  const n = items.length;
  const lines = [`${nome}, ${diaLabel} (${cidade}) — ${n} carro${n === 1 ? "" : "s"}.`, ""];
  if (diaLabel === "sem data") {
    lines.push("Estão na lista, mas o Locgram não tem horário. Confirma se ainda tem a posição.");
  } else {
    lines.push(`Última posição ${diaLabel}. Ordem da ronda, do primeiro horário ao último.`);
    if (juntos) lines.push("Alguns bateram quase juntos no horário — devem estar na mesma área.");
  }
  if (items.some((it) => it.loc === "CARLOS")) {
    lines.push("Os marcados com Carlos são dele. Ele trabalha para você.");
  }
  lines.push("");
  items.forEach((it, i) => lines.push(`${i + 1}. ${lineCar(it)}`));
  lines.push("", "Desses, quais você AINDA tem a posição?", "Quando terminar esse dia, te mando o próximo.");
  return lines.join("\n");
}

function mergeBiraCarlos(dias, locators) {
  const byKey = new Map();
  for (const dia of dias) {
    if (dia.loc !== "BIRA" && dia.loc !== "CARLOS") continue;
    const list = byKey.get(dia.diaKey) || [];
    list.push(dia);
    byKey.set(dia.diaKey, list);
  }
  const mergedDias = [...byKey.entries()]
    .sort((a, b) => compareDays(a[0], b[0]))
    .map(([diaKey, parts]) => {
      const items = parts
        .flatMap((part) => part.items)
        .sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.placa.localeCompare(b.placa));
      const base = parts.find((part) => part.loc === "BIRA") || parts[0];
      const counts = countPos(items);
      const juntos = temJuntos(items);
      const cidade = base.cidade || "Salvador";
      return {
        ...base,
        id: `BIRA-${diaKey}`,
        loc: "BIRA",
        diaKey,
        cidade,
        juntos,
        items,
        ...counts,
        carros: counts.total,
        dica: base.diaLabel === "sem data"
          ? "Sem horário no Locgram. Confirma se lembra da área."
          : juntos
            ? `Última posição ${base.diaLabel}. Ordem da ronda. Alguns bateram quase juntos — devem estar perto.`
            : `Última posição ${base.diaLabel}. Ordem da ronda, do primeiro horário ao último.`,
        whatsapp: whatsappDia({
          nome: "Bira",
          cidade,
          diaLabel: base.diaLabel,
          items,
          juntos,
        }),
      };
    });
  const biraItems = mergedDias.flatMap((dia) => dia.items);
  const biraCounts = countPos(biraItems);
  const primeiro = mergedDias.find((dia) => dia.pendente > 0);
  const bira = {
    id: "BIRA",
    nome: "Bira",
    cidade: "Salvador",
    dias: mergedDias.length,
    primeiroPendente: primeiro?.id || mergedDias[0]?.id || null,
    ...biraCounts,
  };
  return {
    dias: [...mergedDias, ...dias.filter((dia) => dia.loc !== "BIRA" && dia.loc !== "CARLOS")],
    locators: [bira, ...locators.filter((item) => item.id !== "BIRA" && item.id !== "CARLOS")].filter(
      (item) => item.total > 0,
    ),
  };
}

function CarFoto({ placa }) {
  const [src, setSrc] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let url = "";
    let cancel = false;
    apiFetch(`/api/localizados/foto?placa=${encodeURIComponent(placa)}`)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancel) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [placa]);

  if (!src) return null;

  return (
    <>
      <button type="button" className="loc-foto" onClick={() => setOpen(true)}>
        <img src={src} alt={`Foto do ${placa}`} />
      </button>
      {open ? (
        <div className="loc-foto-zoom" onClick={() => setOpen(false)} role="presentation">
          <img src={src} alt={`Foto do ${placa}`} />
        </div>
      ) : null}
    </>
  );
}

export default function LocalizadosPanel({
  data,
  loading,
  error,
  saving,
  onReload,
  onMark,
  searchQuery = "",
  phone = false,
  conferir = false,
}) {
  const rawLocators = data?.locators || [];
  const rawDias = data?.dias || data?.lotes || [];
  const view = useMemo(() => mergeBiraCarlos(rawDias, rawLocators), [rawDias, rawLocators]);
  const locators = view.locators;
  const dias = view.dias;
  const [loc, setLoc] = useState("");
  const [diaId, setDiaId] = useState("");
  const [copied, setCopied] = useState(false);
  const [soFoto, setSoFoto] = useState(!conferir);

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
  const fotoDias = useMemo(
    () => locDias.filter((d) => d.items.some((it) => it.temFoto)),
    [locDias],
  );
  const fotosOnly = conferir ? false : soFoto;
  const navDias = fotosOnly && fotoDias.length && !needle ? fotoDias : locDias;

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
    const pool = fotosOnly && fotoDias.length ? fotoDias : locDias;
    const stillThere = pool.some((d) => d.id === diaId);
    if (!stillThere) {
      setDiaId(pool[0]?.id || currentLoc.primeiroPendente || "");
    }
  }, [hit, loc, locators, locDias, fotoDias, diaId, fotosOnly]);

  const dia = navDias.find((d) => d.id === diaId) || navDias[0];
  const diaIndex = Math.max(0, navDias.findIndex((d) => d.id === dia?.id));
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
    const next = navDias[diaIndex + delta];
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
    <div className={`loc-root${phone ? " is-phone" : ""}`}>
      {!phone && (
        <div className="loc-head">
          <p className="loc-kicker">Checklist de posição</p>
          <h2>{conferir ? "Conferir veículos" : "Confirma com o localizador"}</h2>
          <p className="loc-sub">
            {conferir
              ? "Um dia de cada vez. Sim se você ainda tem a posição, Não se não tem. O carro do Carlos leva a tag Carlos."
              : "Um dia de cada vez, Bira e Carlos juntos. O carro do Carlos leva a tag Carlos. A miniatura é a foto do Zap do Bira. Sim e Não gravam a posição."}
          </p>
        </div>
      )}

      {error ? <div className="loc-banner">{error}</div> : null}

      {!conferir && <div className="loc-people" role="tablist" aria-label="Localizador">
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
              {phone ? item.pendente : `${item.pendente} pendente · ${item.cidade}`}
            </span>
          </button>
        ))}
      </div>}

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

          {!phone && dia.dica ? <p className="loc-dica">{dia.dica}</p> : null}

          {!phone && !conferir ? (
            <button
              type="button"
              className={`loc-copy${copied ? " is-ok" : ""}`}
              onClick={copyZap}
            >
              {copied
                ? "Copiado. Cola no Zap."
                : `Copiar os ${dia.carros} carros de ${dia.diaLabel}`}
            </button>
          ) : null}

          {!phone && !conferir && dia.items.some((car) => car.temFoto) ? (
            <button
              type="button"
              className={`loc-copy${soFoto ? " is-ok" : ""}`}
              onClick={() => setSoFoto((on) => !on)}
            >
              {soFoto
                ? `Fotos deste dia (${dia.items.filter((car) => car.temFoto).length}). Ver o dia inteiro`
                : `Ver só as ${dia.items.filter((car) => car.temFoto).length} fotos deste dia`}
            </button>
          ) : null}
          {!phone && !conferir && !dia.items.some((car) => car.temFoto) ? (
            <p className="loc-dica">Este dia ainda não tem foto do Zap do Bira.</p>
          ) : null}

          <div className="loc-nav">
            <button type="button" disabled={diaIndex <= 0} onClick={() => go(-1)}>
              Dia anterior
            </button>
            <span>
              {diaIndex + 1} / {navDias.length}
              {fotosOnly && fotoDias.length ? " com foto" : ""}
            </span>
            <button
              type="button"
              disabled={diaIndex >= navDias.length - 1}
              onClick={() => go(1)}
            >
              Próximo dia
            </button>
          </div>

          {dia.pendente === 0 && diaIndex < navDias.length - 1 ? (
            <button type="button" className="loc-copy is-ok" onClick={() => go(1)}>
              Dia ok. Ir para o próximo
            </button>
          ) : null}

          <div className="loc-cars">
            {(fotosOnly && dia.items.some((car) => car.temFoto)
              ? dia.items.filter((car) => car.temFoto)
              : dia.items
            ).map((car) => (
              <article
                key={car.placa}
                className={`loc-car ${locClass(car.posicao)}${needle && car.placa.includes(needle) ? " is-hit" : ""}`}
              >
                {car.temFoto ? <CarFoto placa={car.placa} /> : null}
                <div className="loc-car-top">
                  <strong className="placa">
                    {car.placa}
                    {car.loc === "CARLOS" ? <span className="loc-tag">Carlos</span> : null}
                  </strong>
                  <span>{car.hora || "—"}</span>
                </div>
                <p className="loc-car-meta">
                  {[car.veiculo, phone ? null : car.data, car.local].filter(Boolean).join(" · ")}
                </p>
                {mapaDe(car.obs) ? (
                  <a className="loc-mapa" href={mapaDe(car.obs)} target="_blank" rel="noreferrer">
                    Ver no mapa
                  </a>
                ) : null}
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
