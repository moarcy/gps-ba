import { useEffect, useMemo, useRef, useState } from "react";
import { deveMarcar, limiteMetros, metros, projetar } from "./geo";
import JacobinaMap from "./JacobinaMap";
import "./jacobina.css";

const KEY = "gpsba-jacobina-cobertura";

function kmLabel(n) {
  return `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function loadFeitos(geradoEm) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || raw.geradoEm !== geradoEm) return new Set();
    return new Set(raw.feitos || []);
  } catch {
    return new Set();
  }
}

function saveFeitos(geradoEm, feitos) {
  localStorage.setItem(KEY, JSON.stringify({ geradoEm, feitos: [...feitos] }));
}

function mapsUrl(trecho) {
  const fmt = (p) => `${p[0]},${p[1]}`;
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(trecho.de),
    destination: fmt(trecho.ate),
    travelmode: "driving",
  });
  if (trecho.via?.length) params.set("waypoints", trecho.via.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dayStats(day, feitos) {
  let done = 0;
  for (const id of day.segmentos) if (feitos.has(id)) done += 1;
  const total = day.segmentos.length;
  return {
    done,
    total,
    completo: total > 0 && done === total,
    parcial: done > 0 && done < total,
    pct: total ? done / total : 0,
  };
}

export default function JacobinaPanel({ searchQuery = "", active = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [feitos, setFeitos] = useState(null);
  const [diaId, setDiaId] = useState(null);
  const [bairro, setBairro] = useState("todos");
  const [lista, setLista] = useState("abertas");
  const [trecho, setTrecho] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [seguir, setSeguir] = useState(false);
  const [posicao, setPosicao] = useState(null);
  const [gpsMsg, setGpsMsg] = useState("");
  const [ruaAgora, setRuaAgora] = useState("");
  const hitsRef = useRef(new Map());
  const ultimoRef = useRef(null);
  const feitosRef = useRef(null);
  const diaRef = useRef(null);
  const segRef = useRef(new Map());
  const wakeRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    fetch("/jacobina/cobertura.json")
      .then((res) => {
        if (!res.ok) throw new Error("A malha de Jacobina ainda não está no site.");
        return res.json();
      })
      .then((json) => {
        if (!cancel) setData(json);
      })
      .catch((err) => {
        if (!cancel) setError(err.message || "Falha ao abrir as rotas.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    setFeitos(loadFeitos(data.geradoEm));
  }, [data]);

  const segById = useMemo(() => {
    const map = new Map();
    for (const seg of data?.segmentos || []) map.set(seg.id, seg);
    return map;
  }, [data]);

  const kmById = useMemo(() => {
    const map = new Map();
    for (const seg of data?.segmentos || []) map.set(seg.id, seg.km || 0);
    return map;
  }, [data]);

  const progresso = useMemo(() => {
    if (!data || !feitos) return { km: 0, dias: 0 };
    let km = 0;
    for (const id of feitos) km += kmById.get(id) || 0;
    const dias = data.dias.filter((day) => dayStats(day, feitos).completo).length;
    return { km, dias };
  }, [data, feitos, kmById]);

  const proximo = useMemo(() => {
    if (!data || !feitos) return null;
    return data.dias.find((day) => !dayStats(day, feitos).completo) || null;
  }, [data, feitos]);

  useEffect(() => {
    if (!data || !feitos || diaId) return;
    setDiaId((proximo || data.dias[0])?.id || null);
  }, [data, feitos, diaId, proximo]);

  useEffect(() => {
    setTrecho(0);
    hitsRef.current = new Map();
    ultimoRef.current = null;
  }, [diaId]);

  const dia = data?.dias.find((day) => day.id === diaId) || null;
  feitosRef.current = feitos;
  diaRef.current = dia;
  segRef.current = segById;

  useEffect(() => {
    if (!gpsOn || !active) return undefined;
    if (!navigator.geolocation) {
      setGpsMsg("Este aparelho não entregou a localização.");
      setGpsOn(false);
      setSeguir(false);
      return undefined;
    }
    let watch = 0;
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !navigator.wakeLock || wakeRef.current) return;
      navigator.wakeLock.request("screen").then((lock) => {
        wakeRef.current = lock;
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", aoVoltar);
    watch = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        setPosicao({ lat, lon, accuracy });
        if (accuracy > 45) {
          setGpsMsg(`Sinal fraco (${Math.round(accuracy)} m). Chega o celular na janela.`);
          return;
        }
        const antes = ultimoRef.current;
        if (antes && metros(antes.lat, antes.lon, lat, lon) < 8) return;
        ultimoRef.current = { lat, lon };
        const diaAtual = diaRef.current;
        const feitosAtuais = feitosRef.current;
        if (!diaAtual || !feitosAtuais) return;
        const limite = limiteMetros(accuracy);
        const novos = [];
        let perto = "";
        let pertoDist = Infinity;
        for (const id of diaAtual.segmentos) {
          if (feitosAtuais.has(id)) continue;
          const seg = segRef.current.get(id);
          if (!seg) continue;
          const hit = projetar(lat, lon, seg.coords);
          if (!hit || hit.dist > limite + 8) continue;
          if (hit.dist < pertoDist && seg.nome && seg.nome !== "Sem nome") {
            pertoDist = hit.dist;
            perto = seg.nome;
          }
          if (hit.dist > limite) continue;
          const rec = hitsRef.current.get(id) || { min: hit.t, max: hit.t, n: 0 };
          rec.min = Math.min(rec.min, hit.t);
          rec.max = Math.max(rec.max, hit.t);
          rec.n += 1;
          hitsRef.current.set(id, rec);
          if (deveMarcar(rec, seg.km, hit.dist)) novos.push(id);
        }
        setRuaAgora(perto);
        setGpsMsg(`Precisão ${Math.round(accuracy)} m${perto ? ` · ${perto}` : ""}`);
        if (!novos.length) return;
        setFeitos((prev) => {
          const next = new Set(prev || []);
          let added = 0;
          for (const id of novos) {
            if (next.has(id)) continue;
            next.add(id);
            hitsRef.current.delete(id);
            added += 1;
            if (added >= 4) break;
          }
          if (!added) return prev;
          if (data) saveFeitos(data.geradoEm, next);
          return next;
        });
      },
      (err) => {
        const texto =
          err.code === 1
            ? "Permissão de localização negada. Libera nas configurações do navegador."
            : "Não consegui ler o GPS agora.";
        setGpsMsg(texto);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener("visibilitychange", aoVoltar);
      wakeRef.current?.release?.().catch(() => {});
      wakeRef.current = null;
    };
  }, [gpsOn, active, data]);

  const q = searchQuery.trim().toLocaleLowerCase("pt-BR");
  const diasLista = useMemo(() => {
    if (!data || !feitos) return [];
    return data.dias.filter((day) => {
      if (bairro !== "todos" && !day.bairros.includes(bairro)) return false;
      const st = dayStats(day, feitos);
      if (lista === "feitas" && !st.completo) return false;
      if (lista === "abertas" && st.completo) return false;
      if (!q) return true;
      return (
        day.titulo.toLocaleLowerCase("pt-BR").includes(q) ||
        day.ruas.some((rua) => rua.nome.toLocaleLowerCase("pt-BR").includes(q))
      );
    });
  }, [data, feitos, bairro, lista, q]);

  function mudar(mutator) {
    setFeitos((prev) => {
      const next = mutator(new Set(prev || []));
      if (data) saveFeitos(data.geradoEm, next);
      return next;
    });
  }

  function marcarDia(day, on) {
    mudar((next) => {
      for (const id of day.segmentos) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function marcarRua(rua, on) {
    mudar((next) => {
      for (const id of rua.ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function copiar(day) {
    const linhas = [
      `Jacobina · ${day.titulo} · dia ${day.ordem}`,
      `Saída e volta: ${data.casa.endereco}`,
      `${kmLabel(day.km)} de volante · ${kmLabel(day.kmRuas)} de rua nova`,
      "",
      ...day.ruas.map((rua) => `- ${rua.nome}${rua.mao ? " (mão única)" : ""}`),
    ];
    await navigator.clipboard.writeText(linhas.join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  }

  if (error) {
    return (
      <div className="jacobina">
        <p className="jacobina-kicker">Jacobina</p>
        <h2>Ruas da cidade</h2>
        <p className="jacobina-note">{error}</p>
      </div>
    );
  }

  if (!data || !feitos) {
    return (
      <div className="jacobina">
        <p className="jacobina-kicker">Jacobina</p>
        <h2>Ruas da cidade</h2>
        <p className="jacobina-note">Abrindo a malha e os dias de rota…</p>
      </div>
    );
  }

  const pct = data.totais.km ? Math.round((progresso.km / data.totais.km) * 100) : 0;
  const stats = dia ? dayStats(dia, feitos) : null;
  const trechoAtual = dia?.trechos?.[trecho] || null;
  const bairroSelecionado = data.bairros.find((item) => item.nome === bairro);

  return (
    <div className="jacobina">
      <div>
        <p className="jacobina-kicker">Jacobina</p>
        <h2>Ruas da cidade</h2>
        <p className="jacobina-sub">
          Escolhe o dia e toca em acompanhar. O mapa segue o carro e a rua fica verde quando você passa.
          Cada dia sai e volta na {data.casa.endereco}. O Google Maps continua disponível se quiser a voz do caminho.
        </p>
      </div>

      <div className="jacobina-kpis">
        <article>
          <span>Ruas feitas</span>
          <strong>
            {kmLabel(progresso.km)} · {pct}%
          </strong>
        </article>
        <article>
          <span>Dias fechados</span>
          <strong>
            {progresso.dias} de {data.totais.dias}
          </strong>
        </article>
        <article>
          <span>Cidade</span>
          <strong>
            {kmLabel(data.totais.km)} · {data.totais.bairros} bairros
          </strong>
        </article>
      </div>

      <div className="jacobina-layout">
        <div className="jacobina-map-col">
          <div className="jacobina-map-wrap">
            <JacobinaMap
              segmentos={data.segmentos}
              dia={dia}
              feitos={feitos}
              casa={data.casa}
              bairroId={bairroSelecionado?.id || "todos"}
              active={active}
              posicao={posicao}
              seguir={seguir}
              onDrag={() => setSeguir(false)}
            />
            <div className="jacobina-gps">
              {!gpsOn && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setGpsMsg("Pedindo a localização…");
                    setGpsOn(true);
                    setSeguir(true);
                    navigator.wakeLock?.request("screen").then((lock) => {
                      wakeRef.current = lock;
                    }).catch(() => {});
                  }}
                >
                  Acompanhar agora
                </button>
              )}
              {gpsOn && (
                <>
                  <button type="button" className="btn" onClick={() => setSeguir(true)} disabled={seguir}>
                    {seguir ? "Seguindo você" : "Centralizar em mim"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setGpsOn(false);
                      setSeguir(false);
                      setRuaAgora("");
                      setGpsMsg("Acompanhamento parado.");
                      wakeRef.current?.release?.().catch(() => {});
                      wakeRef.current = null;
                    }}
                  >
                    Parar
                  </button>
                </>
              )}
              {gpsMsg && <p className="jacobina-note">{gpsMsg}</p>}
              {ruaAgora && gpsOn && <p className="jacobina-note">Agora: {ruaAgora}</p>}
            </div>
            <div className="jacobina-legend">
              <span><i style={{ background: "#9aa3b2" }} />A fazer</span>
              <span><i style={{ background: "#e6c36a" }} />Este dia</span>
              <span><i style={{ background: "#7dcea0" }} />Feita</span>
              <span><i style={{ background: "#f4e2a8" }} />Caminho</span>
              <span><i style={{ background: "#5b8def" }} />Você</span>
            </div>
          </div>

          {dia && stats && (
            <section className="jacobina-day">
              <div className="jacobina-row-top">
                <strong>
                  Dia {dia.ordem} · {dia.titulo}
                </strong>
                <span className={`jacobina-pill${stats.completo ? " is-done" : stats.parcial ? " is-partial" : ""}`}>
                  {stats.completo ? "Feito" : stats.parcial ? "No meio" : "A fazer"}
                </span>
              </div>
              <span className="jacobina-meta">
                {kmLabel(dia.km)} com ida e volta · {kmLabel(dia.kmRuas)} de rua nova · {dia.ruas.length} ruas
                {dia.curto ? " · dia curto, dá para emendar o próximo" : ""}
              </span>
              <p className="jacobina-note">
                Com o GPS ligado, basta seguir o amarelo. A rua fica verde sozinha depois que o carro percorre o trecho. O Google Maps é a voz, se quiser.
              </p>
              {dia.contra && (
                <p className="jacobina-note">
                  Tem trecho de mão única no meio do caminho. Se o mapa mandar contra o fluxo, contorne e siga a rua.
                </p>
              )}
              <div className="jacobina-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!trechoAtual}
                  onClick={() => window.open(mapsUrl(trechoAtual), "_blank", "noopener,noreferrer")}
                >
                  Abrir trecho {trecho + 1} de {dia.trechos.length} no Google Maps
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={trecho <= 0}
                  onClick={() => setTrecho((n) => Math.max(0, n - 1))}
                >
                  Trecho anterior
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={trecho >= dia.trechos.length - 1}
                  onClick={() => setTrecho((n) => n + 1)}
                >
                  Próximo trecho
                </button>
                <button type="button" className="btn" onClick={() => marcarDia(dia, !stats.completo)}>
                  {stats.completo ? "Reabrir este dia" : "Marcar dia como feito"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => copiar(dia)}>
                  {copiado ? "Lista copiada" : "Copiar ruas"}
                </button>
              </div>
              <div className="jacobina-ruas">
                {dia.ruas.map((rua) => {
                  const on = rua.ids.every((id) => feitos.has(id));
                  const match = q && rua.nome.toLocaleLowerCase("pt-BR").includes(q);
                  return (
                    <button
                      key={rua.nome}
                      type="button"
                      className={`jacobina-street${on ? " is-done" : ""}`}
                      onClick={() => marcarRua(rua, !on)}
                    >
                      <span>
                        {on ? "✓ " : ""}
                        {match ? <strong>{rua.nome}</strong> : rua.nome}
                        {rua.mao ? " · mão única" : ""}
                      </span>
                      <span className="jacobina-meta">{kmLabel(rua.km)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <p className="jacobina-note">{data.casa.nota}</p>
        </div>

        <aside className="jacobina-list">
          {proximo && (
            <button type="button" className="jacobina-next" onClick={() => setDiaId(proximo.id)}>
              <span className="jacobina-kicker">Próxima saída</span>
              <strong>
                Dia {proximo.ordem} · {proximo.titulo}
              </strong>
              <span className="jacobina-meta">{kmLabel(proximo.km)} · {proximo.ruas.length} ruas</span>
            </button>
          )}
          <div className="jacobina-tools">
            <select value={bairro} onChange={(e) => setBairro(e.target.value)} aria-label="Bairro">
              <option value="todos">Todos os bairros</option>
              {data.bairros.map((item) => (
                <option key={item.id} value={item.nome}>
                  {item.nome}
                </option>
              ))}
            </select>
            <select value={lista} onChange={(e) => setLista(e.target.value)} aria-label="Situação dos dias">
              <option value="abertas">A fazer</option>
              <option value="feitas">Feitos</option>
              <option value="todas">Todos</option>
            </select>
          </div>
          <div className="jacobina-days">
            {diasLista.length === 0 && <p className="jacobina-note">Nenhum dia com esse filtro.</p>}
            {diasLista.map((day) => {
              const st = dayStats(day, feitos);
              return (
                <button
                  key={day.id}
                  type="button"
                  className={`jacobina-row${day.id === diaId ? " is-on" : ""}`}
                  onClick={() => setDiaId(day.id)}
                >
                  <div className="jacobina-row-top">
                    <strong>
                      Dia {day.ordem} · {day.titulo}
                    </strong>
                    <span className={`jacobina-pill${st.completo ? " is-done" : st.parcial ? " is-partial" : ""}`}>
                      {st.completo ? "Feito" : st.parcial ? "No meio" : "A fazer"}
                    </span>
                  </div>
                  <span className="jacobina-meta">
                    {kmLabel(day.km)} · {day.ruas.length} ruas
                  </span>
                  <div className="jacobina-track" aria-hidden="true">
                    <span style={{ width: `${Math.round(st.pct * 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
