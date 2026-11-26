import { useEffect, useMemo, useState } from "react";
import { apiFetch, loadSession } from "../lib/api";
import { formatBRL } from "../lib/format";
import {
  MOTIVOS_SUBSTITUICAO,
  TIPOS_NOTA,
  buildDescricaoNota,
  buildNomeArquivo,
  labelCodigoNacional,
  linhaUnica,
} from "../../../google-sheets/lib/nfse-nota.js";
import "./nfse.css";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseMoney(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) {
    return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(text.replace(",", ".")) || 0;
}

function moneyInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoDia(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function statusNota(emitida) {
  if (emitida.status === "authorized") return "autorizada";
  if (emitida.status === "cancelada") return "cancelada";
  if (emitida.status === "substituida") {
    return emitida.substituidaPor ? `substituída pela ${emitida.substituidaPor}` : "substituída";
  }
  if (emitida.status === "dry_run") return "conferida";
  if (emitida.status === "error") return "erro";
  if (emitida.status === "pending") return "pendente";
  return emitida.status || "";
}

function podeSubstituir(emitida) {
  return emitida.status === "authorized" && String(emitida.chaveAcesso || "").replace(/\D/g, "").length === 50;
}

function podeCancelar(emitida) {
  return podeSubstituir(emitida);
}

function podeVerPdf(emitida) {
  return Boolean(emitida.pdf || emitida.chaveAcesso);
}

const EMPTY_TOMADOR = {
  id: "",
  tipo: "CNPJ",
  documento: "",
  razaoSocial: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  cep: "",
  telefone: "",
  email: "",
};

const EMPTY_CHECKS = { apreensao: false, guincho: false, estadias: false, chaveiro: false };
const EMPTY_VALORES = { apreensao: "", guincho: "", estadias: "", chaveiro: "" };

export default function NfsePanel({
  data,
  loading,
  error,
  saving,
  onReload,
  runAction,
  searchQuery = "",
  phone = false,
}) {
  const tomadores = data?.tomadores || [];
  const config = data?.config || {};
  const emitidas = data?.emitidas || [];

  const [modo, setModo] = useState("uma");
  const [tomadorId, setTomadorId] = useState("");
  const [placa, setPlaca] = useState("");
  const [financiado, setFinanciado] = useState("");
  const [tipo, setTipo] = useState("apreensao");
  const [descricao, setDescricao] = useState("");
  const [referente, setReferente] = useState("");
  const [valor, setValor] = useState("");
  const [checks, setChecks] = useState(EMPTY_CHECKS);
  const [valores, setValores] = useState(EMPTY_VALORES);
  const [km, setKm] = useState("");
  const [diarias, setDiarias] = useState("");
  const [aliquota, setAliquota] = useState("16");
  const [dataFato, setDataFato] = useState(todayIso());
  const [dryRun, setDryRun] = useState(false);
  const [showTomadorForm, setShowTomadorForm] = useState(false);
  const [tomadorForm, setTomadorForm] = useState(EMPTY_TOMADOR);
  const [localMsg, setLocalMsg] = useState("");
  const [localErr, setLocalErr] = useState("");
  const [nomesProntos, setNomesProntos] = useState([]);
  const [step, setStep] = useState(0);
  const [tela, setTela] = useState("notas");
  const [filtroAssessoria, setFiltroAssessoria] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");
  const [substituir, setSubstituir] = useState(null);
  const [motivoSubst, setMotivoSubst] = useState("99");
  const [motivoTexto, setMotivoTexto] = useState("Correção dos dados da nota.");
  const [pdfAberto, setPdfAberto] = useState(null);
  const [abrindoPdf, setAbrindoPdf] = useState("");
  const [cancelandoId, setCancelandoId] = useState("");

  useEffect(() => {
    const token = loadSession()?.token;
    if (token) document.cookie = `gpsba=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
  }, []);

  const qNorm = searchQuery.trim().toUpperCase();
  const tomadoresVisiveis = useMemo(() => {
    const sorted = [...tomadores].sort((a, b) =>
      String(a.id).localeCompare(String(b.id), "pt"),
    );
    if (!qNorm) return sorted;
    const matched = sorted.filter((t) =>
      [t.id, t.razaoSocial, t.documento, t.municipio]
        .filter(Boolean)
        .join(" ")
        .toUpperCase()
        .includes(qNorm),
    );
    const current = sorted.find((t) => t.id === tomadorId || t.documento === tomadorId);
    if (current && !matched.some((t) => t.id === current.id)) return [current, ...matched];
    return matched;
  }, [tomadores, qNorm, tomadorId]);

  const assessorias = useMemo(() => {
    const map = new Map();
    for (const tomador of tomadores) {
      if (tomador.id) map.set(tomador.id, tomador.razaoSocial || tomador.id);
    }
    for (const emitida of emitidas) {
      const id = emitida.tomadorId || emitida.tomadorNome;
      if (id && !map.has(id)) map.set(id, emitida.tomadorNome || id);
    }
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt"));
  }, [tomadores, emitidas]);

  const emitidasVisiveis = useMemo(() => {
    return emitidas.filter((e) => {
      if (qNorm) {
        const blob = [e.nomeArquivo, e.numeroNf, e.placa, e.financiado, e.tomadorNome, e.tomadorId, e.tipo, e.status]
          .filter(Boolean)
          .join(" ")
          .toUpperCase();
        if (!blob.includes(qNorm)) return false;
      }
      if (filtroAssessoria && (e.tomadorId || e.tomadorNome) !== filtroAssessoria) return false;
      const dia = isoDia(e.dataFato) || isoDia(e.criadoEm);
      if (filtroDe && (!dia || dia < filtroDe)) return false;
      if (filtroAte && (!dia || dia > filtroAte)) return false;
      return true;
    });
  }, [emitidas, qNorm, filtroAssessoria, filtroDe, filtroAte]);

  useEffect(() => {
    if (aliquota === "") setAliquota("16");
  }, [aliquota]);

  useEffect(() => {
    if (!pdfAberto) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPdfAberto(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfAberto]);

  const selectedTomador = useMemo(
    () => tomadores.find((t) => t.id === tomadorId || t.documento === tomadorId) || null,
    [tomadores, tomadorId],
  );

  const bankText = config.dados_bancarios || "";
  const assessoria = selectedTomador?.id || "";
  const nomePrevisto = buildNomeArquivo({
    numero: "Nº",
    placa,
    financiado,
    assessoria,
  });

  const linhas = useMemo(() => {
    if (modo === "uma") {
      const spec = TIPOS_NOTA.find((t) => t.id === tipo);
      return [
        {
          tipo: spec,
          descricao: linhaUnica(descricao),
          valor: parseMoney(valor),
          nome: nomePrevisto,
        },
      ];
    }
    return TIPOS_NOTA.filter((t) => checks[t.id]).map((spec) => ({
      tipo: spec,
      descricao: buildDescricaoNota({
        tipo: spec.id,
        texto: referente,
        km,
        diarias,
      }),
      valor: parseMoney(valores[spec.id]),
      nome: nomePrevisto,
    }));
  }, [modo, tipo, descricao, valor, checks, referente, km, diarias, valores, nomePrevisto]);

  const total = linhas.reduce((sum, linha) => sum + (linha.valor || 0), 0);

  const codigoDe = (codigo) => labelCodigoNacional(codigo);

  const nomeDownload = (emitida) => {
    const padrao = buildNomeArquivo({
      numero: emitida.numeroNf,
      placa: emitida.placa,
      financiado: emitida.financiado,
      assessoria: emitida.tomadorId || emitida.tomadorNome,
    });
    return `${padrao || emitida.nomeArquivo || "nfse"}.pdf`;
  };

  const baixarArquivo = (emitida) => {
    const nome = nomeDownload(emitida);
    const link = document.createElement("a");
    link.href = `/api/nfse/pdf?id=${encodeURIComponent(emitida.id)}`;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setLocalErr("");
    setLocalMsg(`PDF baixado: ${nome}`);
  };

  const garantirPdf = async (emitida) => {
    if (emitida.pdf) return;
    const pedido = await apiFetch("/api/nfse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "baixar_pdf", id: emitida.id }),
    });
    const corpo = await pedido.json().catch(() => ({}));
    if (!pedido.ok) throw new Error(corpo.error || "Não gerei o PDF.");
    await onReload();
  };

  const verNota = async (emitida) => {
    setLocalErr("");
    setLocalMsg("");
    setAbrindoPdf(emitida.id);
    try {
      await garantirPdf(emitida);
      setPdfAberto({ id: emitida.id, nome: nomeDownload(emitida), abertoEm: Date.now() });
    } catch (err) {
      setLocalErr(err.message || "Não abri o PDF.");
    } finally {
      setAbrindoPdf("");
    }
  };

  const baixarNota = async (emitida) => {
    setLocalErr("");
    setLocalMsg("");
    setAbrindoPdf(emitida.id);
    try {
      await garantirPdf(emitida);
      baixarArquivo(emitida);
    } catch (err) {
      setLocalErr(err.message || "Não baixei o PDF.");
    } finally {
      setAbrindoPdf("");
    }
  };

  const editarNota = (emitida) => {
    if (!podeSubstituir(emitida)) {
      setLocalErr("Só dá para substituir uma nota autorizada.");
      return;
    }
    const spec =
      TIPOS_NOTA.find((item) => item.id === emitida.tipo) ||
      TIPOS_NOTA.find((item) => item.codigo === emitida.servicoCodigo || item.codigoNacional === emitida.servicoCodigo);
    setSubstituir(emitida);
    setTela("emitir");
    setModo("uma");
    setStep(0);
    setTomadorId(emitida.tomadorId || "");
    setPlaca(emitida.placa || "");
    setFinanciado(emitida.financiado || "");
    setTipo(spec?.id || "apreensao");
    setDescricao(emitida.descricao || "");
    setValor(moneyInput(emitida.valorUnitario ?? emitida.valorTotal));
    setAliquota(emitida.aliquota != null && emitida.aliquota !== "" ? String(emitida.aliquota).replace(".", ",") : "16");
    setDataFato(isoDia(emitida.dataFato) || todayIso());
    setDryRun(false);
    setMotivoSubst("99");
    setMotivoTexto("Correção dos dados da nota.");
    setNomesProntos([]);
    setLocalErr("");
    setLocalMsg(`Editando a NFS-e ${emitida.numeroNf || ""}. A emissão nova substitui a original.`);
  };

  const cancelarNota = async (emitida) => {
    if (!podeCancelar(emitida)) {
      setLocalErr("Só uma nota autorizada pode ser cancelada.");
      return;
    }
    const texto = window.prompt(
      `Cancelar a NFS-e ${emitida.numeroNf || ""}? Ela deixa de valer. Motivo:`,
      "Erro na emissão da nota.",
    );
    if (texto == null) return;
    setLocalErr("");
    setLocalMsg("");
    setCancelandoId(emitida.id);
    try {
      await runAction({ action: "cancelar", id: emitida.id, motivo: texto, cMotivo: "1" });
      if (pdfAberto?.id === emitida.id) setPdfAberto(null);
      setLocalMsg(`NFS-e ${emitida.numeroNf || ""} cancelada.`);
    } catch (err) {
      setLocalErr(err.message || "Não cancelei a nota.");
    } finally {
      setCancelandoId("");
    }
  };

  const cancelarEdicao = () => {
    setSubstituir(null);
    setLocalErr("");
    setLocalMsg("");
    setTela("notas");
  };

  const copyNome = async (nome) => {
    try {
      await navigator.clipboard.writeText(nome);
      setLocalErr("");
      setLocalMsg(`Nome copiado: ${nome}`);
    } catch {
      setLocalErr("Não consegui copiar o nome. Selecione o texto e copie.");
    }
  };

  const abrirCadastro = (tomador) => {
    setTela("assessorias");
    setShowTomadorForm(true);
    setTomadorForm(
      tomador
        ? {
            id: tomador.id || "",
            tipo: tomador.tipo || "CNPJ",
            documento: tomador.documento || "",
            razaoSocial: tomador.razaoSocial || "",
            logradouro: tomador.logradouro || "",
            numero: tomador.numero || "",
            complemento: tomador.complemento || "",
            bairro: tomador.bairro || "",
            municipio: tomador.municipio || "",
            uf: tomador.uf || "",
            cep: tomador.cep || "",
            telefone: tomador.telefone || "",
            email: tomador.email || "",
          }
        : EMPTY_TOMADOR,
    );
    setLocalErr("");
    setLocalMsg("");
  };

  const saveTomador = async (event) => {
    event.preventDefault();
    setLocalErr("");
    setLocalMsg("");
    if (!tomadorForm.id.trim()) {
      setLocalErr("Informe o nome curto da assessoria. É ele que aparece na lista e no arquivo da nota.");
      return;
    }
    if (!String(tomadorForm.documento || "").replace(/\D/g, "")) {
      setLocalErr("Informe o CPF ou CNPJ.");
      return;
    }
    if (!tomadorForm.razaoSocial.trim()) {
      setLocalErr("Informe a razão social.");
      return;
    }
    try {
      const result = await runAction({
        action: "upsert_tomador",
        ...tomadorForm,
        id: tomadorForm.id.trim().toUpperCase(),
      });
      const salvo = result.tomador?.id || result.tomador?.documento || "";
      setTomadorId(salvo);
      setShowTomadorForm(false);
      setTomadorForm(EMPTY_TOMADOR);
      setLocalMsg(`${salvo} salva. Já pode emitir a nota para ela.`);
    } catch (err) {
      setLocalErr(err.message || "Falha ao salvar assessoria");
    }
  };

  const erroDoFormulario = () => {
    if (!tomadorId) return "Selecione a assessoria.";
    if (!placa.trim()) return "Informe a placa.";
    if (!financiado.trim()) return "Informe o financiado.";
    if (modo === "uma") {
      if (!descricao.trim()) return "Cole a descrição.";
      if (parseMoney(valor) <= 0) return "Informe o valor.";
      return "";
    }
    if (!referente.trim()) return "Cole a descrição do caso.";
    if (!linhas.length) return "Marque ao menos um tipo de nota.";
    const semValor = linhas.find((linha) => linha.valor <= 0);
    if (semValor) return `Informe o valor de ${semValor.tipo.label.toLowerCase()}.`;
    return "";
  };

  const emit = async (event) => {
    event.preventDefault();
    setLocalErr("");
    setLocalMsg("");
    setNomesProntos([]);

    const problema = erroDoFormulario();
    if (problema) {
      setLocalErr(problema);
      return;
    }
    if (substituir && modo !== "uma") {
      setLocalErr("A substituição vale para uma nota de cada vez.");
      return;
    }
    if (substituir && !dryRun) {
      const seguiu = window.confirm(
        `Substituir a NFS-e ${substituir.numeroNf || ""}? A nota original deixa de valer quando a nova for autorizada.`,
      );
      if (!seguiu) return;
    }

    const comum = {
      tomadorId,
      placa,
      financiado,
      aliquota: Number(String(aliquota).replace(",", ".")) || undefined,
      dataFato,
      dryRun,
      ...(substituir
        ? {
            substituirId: substituir.id,
            motivoSubst,
            motivoTexto,
          }
        : {}),
    };

    try {
      if (modo === "uma") {
        const result = await runAction({
          action: "emit",
          ...comum,
          tipo,
          descricao: linhaUnica(descricao),
          quantidade: 1,
          valorUnitario: parseMoney(valor),
        });
        const nome = result.nomeArquivo || result.emitida?.nomeArquivo;
        if (nome) setNomesProntos([nome]);
        if (!dryRun) setSubstituir(null);
        if (result.avisoSubstituicao) setLocalErr(result.avisoSubstituicao);
        setLocalMsg(
          dryRun
            ? substituir
              ? "DPS de substituição conferida, sem emitir."
              : "DPS conferida, sem emitir."
            : nome
              ? substituir
                ? `Nota substituta pronta: ${nome}`
                : `Nota pronta: ${nome}`
              : "NFS-e enviada à Sefin Nacional.",
        );
        return;
      }

      const result = await runAction({
        action: "emit_lote",
        ...comum,
        referente: referente.trim(),
        notas: linhas.map((linha) => ({
          tipo: linha.tipo.id,
          valor: linha.valor,
          km: linha.tipo.id === "guincho" ? km : "",
          diarias: linha.tipo.id === "estadias" ? diarias : "",
        })),
      });
      const ok = (result.resultados || []).filter((item) => item.ok);
      const falha = (result.resultados || []).find((item) => !item.ok);
      const nomes = ok.map((item) => item.nomeArquivo).filter(Boolean);
      setNomesProntos(nomes);
      if (falha && !ok.length) {
        setLocalErr(falha.error || "Falha ao emitir.");
        return;
      }
      setLocalMsg(
        falha
          ? `${ok.length} nota(s) emitida(s). A seguinte parou: ${falha.error}`
          : dryRun
            ? `${ok.length} DPS conferida(s), sem emitir.`
            : `${ok.length} nota(s) emitida(s).`,
      );
    } catch (err) {
      setLocalErr(err.message || "Falha ao emitir");
    }
  };

  const goNext = () => {
    if (step === 0 && (!tomadorId || !placa.trim() || !financiado.trim())) {
      setLocalErr("Informe assessoria, placa e financiado.");
      return;
    }
    if (step === 1) {
      const problema = erroDoFormulario();
      if (problema) {
        setLocalErr(problema);
        return;
      }
    }
    setLocalErr("");
    setStep((s) => Math.min(2, s + 1));
  };

  const onSubmit = (event) => {
    if (phone && step < 2) {
      event.preventDefault();
      goNext();
      return;
    }
    emit(event);
  };

  if (loading && !data) {
    return <div className="empty-state">Carregando NFS-e…</div>;
  }

  return (
    <div className="nfse-panel">
      <div className="nfse-head">
        <div>
          <h2>
            {tela === "notas"
              ? "Notas emitidas"
              : tela === "assessorias"
                ? "Assessorias"
                : substituir
                  ? "Substituir NFS-e"
                  : "Emissão NFS-e"}
          </h2>
          <p className="nfse-sub">
            {tela === "assessorias"
              ? "Cadastre quem recebe a nota. O nome curto entra na lista e no arquivo."
              : tela === "notas"
                ? "Veja na tela, baixe ou substitua a nota"
                : substituir
                  ? `No lugar da NFS-e ${substituir.numeroNf || ""}`
                  : "Sefin Nacional · dados bancários entram sozinhos"}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => onReload()} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className="nfse-modes" role="tablist" aria-label="NFS-e">
        <button
          type="button"
          className={`nfse-chip${tela === "notas" ? " is-on" : ""}`}
          onClick={() => setTela("notas")}
        >
          Notas
        </button>
        <button
          type="button"
          className={`nfse-chip${tela === "emitir" ? " is-on" : ""}`}
          onClick={() => setTela("emitir")}
        >
          Emitir
        </button>
        <button
          type="button"
          className={`nfse-chip${tela === "assessorias" ? " is-on" : ""}`}
          onClick={() => setTela("assessorias")}
        >
          Assessorias
        </button>
      </div>

      {(error || localErr) && <div className="nfse-banner nfse-banner-error">{localErr || error}</div>}
      {localMsg && <div className="nfse-banner nfse-banner-ok">{localMsg}</div>}
      {nomesProntos.length > 0 && (
        <div className="nfse-card">
          <h3>Nome do arquivo</h3>
          {nomesProntos.map((nome) => (
            <div key={nome} className="nfse-nome-row">
              <code className="nfse-nome">{nome}</code>
              <button type="button" className="btn btn-ghost" onClick={() => copyNome(nome)}>
                Copiar
              </button>
            </div>
          ))}
        </div>
      )}

      {tela === "emitir" && !data?.workerConfigured && (
        <div className="nfse-banner">
          Cadastrar assessoria já funciona. Para emitir, o programa da nota precisa estar ligado neste computador: o certificado fica aqui e a emissão não sobe para a nuvem.
        </div>
      )}

      {tela === "notas" && (
        <section className="nfse-notas">
          <div className="nfse-filtros">
            <label>
              <span>Assessoria</span>
              <select value={filtroAssessoria} onChange={(e) => setFiltroAssessoria(e.target.value)}>
                <option value="">Todas</option>
                {assessorias.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {id} — {nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Data de</span>
              <input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)} />
            </label>
            <label>
              <span>Data até</span>
              <input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)} />
            </label>
            {(filtroAssessoria || filtroDe || filtroAte) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setFiltroAssessoria("");
                  setFiltroDe("");
                  setFiltroAte("");
                }}
              >
                Limpar
              </button>
            )}
          </div>
          <div className="nfse-notas-bar">
            <p>{emitidasVisiveis.length} nota(s)</p>
            {emitidasVisiveis.some((e) => e.status === "authorized" && e.pdf) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  emitidasVisiveis
                    .filter((e) => e.status === "authorized" && e.pdf)
                    .forEach(baixarArquivo)
                }
              >
                Baixar todas
              </button>
            )}
          </div>
          {!emitidasVisiveis.length && (
            <p className="nfse-hint">
              {emitidas.length ? "Nenhuma nota com esse filtro." : "Nenhuma nota emitida ainda."}
            </p>
          )}
          {emitidasVisiveis.map((e) => {
            const nome = nomeDownload(e);
            const tipoNotaItem = TIPOS_NOTA.find((t) => t.id === e.tipo)?.label || e.tipo || e.servicoCodigo;
            const original = e.chaveSubstituida
              ? emitidas.find((item) => item.chaveAcesso === e.chaveSubstituida)
              : null;
            return (
              <article key={e.id} className="nfse-nota">
                <div>
                  <strong className="nfse-nota-num">
                    NFS-e {e.numeroNf || "—"} · {formatBRL(e.valorTotal || 0)}
                  </strong>
                  <p>
                    {tipoNotaItem}
                    {e.placa ? ` · ${e.placa}` : ""}
                    {e.financiado ? ` · ${e.financiado}` : ""}
                  </p>
                  <p className="nfse-hint">
                    {e.tomadorId || e.tomadorNome} · {e.dataFato} · {statusNota(e)}
                    {e.erro ? ` · ${e.erro}` : ""}
                  </p>
                  {original?.numeroNf && <p className="nfse-hint">Substitui a NFS-e {original.numeroNf}</p>}
                  <p className="nfse-nota-nome">{nome}</p>
                </div>
                <div className="nfse-nota-actions">
                  {podeVerPdf(e) && (
                    <button type="button" className="btn btn-primary" onClick={() => verNota(e)} disabled={abrindoPdf === e.id}>
                      {abrindoPdf === e.id ? "Abrindo…" : "Ver"}
                    </button>
                  )}
                  {podeVerPdf(e) && (
                    <button type="button" className="btn btn-ghost" onClick={() => baixarNota(e)} disabled={abrindoPdf === e.id}>
                      Baixar
                    </button>
                  )}
                  {podeSubstituir(e) && (
                    <button type="button" className="btn btn-ghost" onClick={() => editarNota(e)}>
                      Editar
                    </button>
                  )}
                  {podeCancelar(e) && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => cancelarNota(e)}
                      disabled={cancelandoId === e.id}
                    >
                      {cancelandoId === e.id ? "Cancelando…" : "Cancelar"}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => copyNome(nome.replace(/\.pdf$/i, ""))}>
                    Copiar nome
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {tela === "assessorias" && (
        <section className="nfse-notas">
          <div className="nfse-notas-bar">
            <p>{tomadoresVisiveis.length} assessoria(s)</p>
            <button type="button" className="btn btn-primary" onClick={() => abrirCadastro(null)}>
              Nova assessoria
            </button>
          </div>
          <p className="nfse-hint">
            Use quando a nota for para alguém que ainda não está na lista. O mesmo CPF/CNPJ atualiza o cadastro existente.
          </p>
          {showTomadorForm && (
            <form className="nfse-card" onSubmit={saveTomador}>
              <h3>{tomadorForm.id ? "Assessoria" : "Nova assessoria"}</h3>
              <div className="nfse-grid">
                <label className="nfse-span-2">
                  <span>Nome curto</span>
                  <input
                    value={tomadorForm.id}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, id: e.target.value.toUpperCase() }))}
                    placeholder="BELLINATI PEREZ"
                    required
                  />
                </label>
                <label>
                  <span>Tipo</span>
                  <select
                    value={tomadorForm.tipo}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, tipo: e.target.value }))}
                  >
                    <option value="CNPJ">CNPJ</option>
                    <option value="CPF">CPF</option>
                  </select>
                </label>
                <label>
                  <span>CPF / CNPJ</span>
                  <input
                    value={tomadorForm.documento}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, documento: e.target.value }))}
                    required
                  />
                </label>
                <label className="nfse-span-2">
                  <span>Razão social</span>
                  <input
                    value={tomadorForm.razaoSocial}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, razaoSocial: e.target.value }))}
                    required
                  />
                </label>
                <label className="nfse-span-2">
                  <span>Logradouro</span>
                  <input
                    value={tomadorForm.logradouro}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, logradouro: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Número</span>
                  <input
                    value={tomadorForm.numero}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, numero: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Complemento</span>
                  <input
                    value={tomadorForm.complemento}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, complemento: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Bairro</span>
                  <input
                    value={tomadorForm.bairro}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, bairro: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Município</span>
                  <input
                    value={tomadorForm.municipio}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, municipio: e.target.value }))}
                  />
                </label>
                <label>
                  <span>UF</span>
                  <input
                    value={tomadorForm.uf}
                    maxLength={2}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, uf: e.target.value.toUpperCase() }))}
                  />
                </label>
                <label>
                  <span>CEP</span>
                  <input
                    value={tomadorForm.cep}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, cep: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Telefone</span>
                  <input
                    value={tomadorForm.telefone}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, telefone: e.target.value }))}
                  />
                </label>
                <label className="nfse-span-2">
                  <span>E-mail</span>
                  <input
                    value={tomadorForm.email}
                    onChange={(e) => setTomadorForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>
              </div>
              <div className="nfse-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar assessoria"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowTomadorForm(false);
                    setTomadorForm(EMPTY_TOMADOR);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {!tomadoresVisiveis.length && <p className="nfse-hint">Nenhuma assessoria com esse filtro.</p>}
          {tomadoresVisiveis.map((t) => (
            <article key={t.id || t.documento} className="nfse-nota">
              <div>
                <strong className="nfse-nota-num">{t.id}</strong>
                <p>{t.razaoSocial || "Sem razão social"}</p>
                <p className="nfse-hint">
                  {t.documento || "sem documento"}
                  {t.municipio ? ` · ${t.municipio}${t.uf ? `/${t.uf}` : ""}` : ""}
                </p>
              </div>
              <div className="nfse-nota-actions">
                <button type="button" className="btn btn-ghost" onClick={() => abrirCadastro(t)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setTomadorId(t.id);
                    setTela("emitir");
                    setLocalErr("");
                    setLocalMsg(`${t.id} selecionada para a nota.`);
                  }}
                >
                  Emitir
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tela === "emitir" && <form className="nfse-form" onSubmit={onSubmit}>
        {substituir && (
          <div className="nfse-banner">
            Esta emissão substitui a NFS-e {substituir.numeroNf || substituir.id}. A original deixa de valer quando a nova for autorizada.
            <div className="nfse-actions">
              <button type="button" className="btn btn-ghost" onClick={cancelarEdicao}>
                Cancelar edição
              </button>
            </div>
          </div>
        )}
        {phone && (
          <p className="nfse-step-label">
            {["Caso", "Notas", "Emitir"][step]} · {step + 1} de 3
          </p>
        )}

        {(!phone || step === 0) && (
          <>
            {!substituir && (
            <div className="nfse-modes" role="group" aria-label="Quantidade de notas">
              <button
                type="button"
                className={`nfse-chip${modo === "uma" ? " is-on" : ""}`}
                onClick={() => setModo("uma")}
              >
                Uma nota
              </button>
              <button
                type="button"
                className={`nfse-chip${modo === "varias" ? " is-on" : ""}`}
                onClick={() => setModo("varias")}
              >
                Várias do mesmo caso
              </button>
            </div>
            )}

            <label className="nfse-field">
              <span>Assessoria</span>
              <div className="nfse-row">
                <select value={tomadorId} onChange={(e) => setTomadorId(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {tomadoresVisiveis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} — {t.razaoSocial || t.documento}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-ghost" onClick={() => abrirCadastro(null)}>
                  Cadastrar
                </button>
              </div>
            </label>

            {selectedTomador && (
              <p className="nfse-hint">
                {selectedTomador.logradouro}
                {selectedTomador.numero ? `, ${selectedTomador.numero}` : ""}
                {selectedTomador.municipio
                  ? ` · ${selectedTomador.municipio}/${selectedTomador.uf}`
                  : ""}
              </p>
            )}

            <div className="nfse-grid">
              <label>
                <span>Placa</span>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  placeholder="PLB2379"
                  required
                />
              </label>
              <label>
                <span>Financiado</span>
                <input
                  value={financiado}
                  onChange={(e) => setFinanciado(e.target.value)}
                  placeholder="Nome do financiado"
                  required
                />
              </label>
            </div>

          </>
        )}

        {(!phone || step === 1) && (
          <>
            {modo === "uma" ? (
              <>
                <div className="nfse-modes" role="group" aria-label="Tipo da nota">
                  {TIPOS_NOTA.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`nfse-chip${tipo === item.id ? " is-on" : ""}`}
                      onClick={() => setTipo(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="nfse-hint">{codigoDe(TIPOS_NOTA.find((t) => t.id === tipo)?.codigo)}</p>
                <label className="nfse-field">
                  <span>Valor</span>
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                  />
                </label>
                <label className="nfse-field">
                  <span>Descrição</span>
                  <textarea
                    rows={4}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Cole a descrição do serviço"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <label className="nfse-field">
                  <span>Descrição do caso</span>
                  <textarea
                    rows={4}
                    value={referente}
                    onChange={(e) => setReferente(e.target.value)}
                    placeholder="VEICULO - [MARCA/MODELO] - PLACA: … CHASSI: …"
                    required
                  />
                </label>
                <p className="nfse-hint">
                  Cada nota recebe o prefixo do serviço. KM e diárias só entram se você preencher.
                </p>
                <div className="nfse-tipos">
                  {TIPOS_NOTA.map((item) => (
                    <div key={item.id} className={`nfse-tipo${checks[item.id] ? " is-on" : ""}`}>
                      <label className="nfse-check">
                        <input
                          type="checkbox"
                          checked={checks[item.id]}
                          onChange={(e) =>
                            setChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))
                          }
                        />
                        <span>
                          {item.label}
                          <small> {codigoDe(item.codigo)}</small>
                        </span>
                      </label>
                      {checks[item.id] && (
                        <>
                          <label>
                            <span>Valor</span>
                            <input
                              value={valores[item.id]}
                              onChange={(e) =>
                                setValores((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              inputMode="decimal"
                              placeholder="0,00"
                            />
                          </label>
                          {item.id === "guincho" && (
                            <label>
                              <span>KM utilizado (opcional)</span>
                              <input
                                value={km}
                                onChange={(e) => setKm(e.target.value)}
                                placeholder="59,3"
                              />
                            </label>
                          )}
                          {item.id === "estadias" && (
                            <label>
                              <span>Nº de diárias (opcional)</span>
                              <input
                                value={diarias}
                                onChange={(e) => setDiarias(e.target.value)}
                                placeholder="10"
                              />
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="nfse-grid">
              <label>
                <span>Data fato gerador</span>
                <input type="date" value={dataFato} onChange={(e) => setDataFato(e.target.value)} />
              </label>
              <label>
                <span>Alíquota do Simples (%)</span>
                <input
                  value={aliquota}
                  onChange={(e) => setAliquota(e.target.value)}
                  inputMode="decimal"
                />
              </label>
            </div>
          </>
        )}

        {(!phone || step === 2) && (
          <>
            <div className="nfse-card">
              <h3>{linhas.length > 1 ? "Preview das notas" : "Preview da nota"}</h3>
              <div className="nfse-items">
                {linhas.map((linha) => (
                  <div key={linha.tipo?.id || "nota"} className="nfse-item">
                    <div className="nfse-item-top">
                      <strong>{linha.tipo?.label || "Nota"}</strong>
                      <span>{formatBRL(linha.valor)}</span>
                    </div>
                    <pre className="nfse-item-desc">{linha.descricao || "—"}</pre>
                    <p className="nfse-nome">{linha.nome || "Nº - PLACA - FINANCIADO - ASSESSORIA"}</p>
                  </div>
                ))}
                <div className="nfse-item">
                  <div className="nfse-item-top">
                    <strong>Dados bancários</strong>
                    <span>{formatBRL(0)}</span>
                  </div>
                  <pre className="nfse-item-desc">{bankText || "—"}</pre>
                  <div className="nfse-item-meta">Entra em toda nota · qtd 0 · valor 0</div>
                </div>
              </div>
              <p className="nfse-total">
                Soma: <strong>{formatBRL(total)}</strong>
              </p>
            </div>

            <label className="nfse-check">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              <span>Conferir a DPS sem emitir</span>
            </label>

            {substituir && (
              <div className="nfse-grid">
                <label className="nfse-span-2">
                  <span>Motivo da substituição</span>
                  <select value={motivoSubst} onChange={(e) => setMotivoSubst(e.target.value)}>
                    {MOTIVOS_SUBSTITUICAO.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id} — {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {motivoSubst === "99" && (
                  <label className="nfse-span-2">
                    <span>Texto do motivo</span>
                    <input
                      value={motivoTexto}
                      onChange={(e) => setMotivoTexto(e.target.value)}
                      maxLength={255}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="nfse-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving
                  ? "Emitindo…"
                  : dryRun
                    ? "Conferir DPS"
                    : substituir
                      ? "Substituir NFS-e"
                      : linhas.length > 1
                        ? `Emitir ${linhas.length} notas`
                        : "Emitir NFS-e"}
              </button>
            </div>
          </>
        )}

        {phone && (
          <div className="nfse-step-nav">
            {step > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setLocalErr("");
                  setStep((s) => Math.max(0, s - 1));
                }}
              >
                Voltar
              </button>
            )}
            {step < 2 && (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Continuar
              </button>
            )}
          </div>
        )}
      </form>}
      {pdfAberto && (
        <div className="nfse-viewer" role="dialog" aria-modal="true" aria-label="Nota fiscal">
          <div className="nfse-viewer-card">
            <div className="nfse-viewer-bar">
              <strong>{pdfAberto.nome}</strong>
              <div className="nfse-nota-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = `/api/nfse/pdf?id=${encodeURIComponent(pdfAberto.id)}`;
                    link.download = pdfAberto.nome;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  }}
                >
                  Baixar
                </button>
                {podeCancelar(emitidas.find((item) => item.id === pdfAberto.id) || {}) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => cancelarNota(emitidas.find((item) => item.id === pdfAberto.id))}
                    disabled={cancelandoId === pdfAberto.id}
                  >
                    {cancelandoId === pdfAberto.id ? "Cancelando…" : "Cancelar"}
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => setPdfAberto(null)}>
                  Fechar
                </button>
              </div>
            </div>
            <iframe title={pdfAberto.nome} src={`/api/nfse/pdf?id=${encodeURIComponent(pdfAberto.id)}&inline=1&v=${pdfAberto.abertoEm || ""}`} />
          </div>
        </div>
      )}
    </div>
  );
}
