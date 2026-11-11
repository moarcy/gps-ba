import { useEffect, useRef } from "react";
import { formatShortDate } from "./status";
import { vehicleFacts } from "./vehicle-facts";

function statusFromPoint(clientX, clientY) {
  const cols = document.querySelectorAll("[data-crm-status]");
  for (const col of cols) {
    const r = col.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return col.getAttribute("data-crm-status");
    }
  }
  return null;
}

function clearDropHighlights() {
  document.querySelectorAll(".crm-column.is-drop-target").forEach((el) => {
    el.classList.remove("is-drop-target");
  });
}

function highlightDropStatus(status) {
  document.querySelectorAll("[data-crm-status]").forEach((el) => {
    el.classList.toggle("is-drop-target", el.getAttribute("data-crm-status") === status);
  });
}

/**
 * Drag do kanban — arquitetura à prova de scroll:
 * - A alça (.crm-card-handle) tem touch-action:none → o browser NÃO rouba o gesto.
 * - Listener nativo {passive:false} na alça → preventDefault funciona no mobile.
 * - Handlers/estado em refs → sobrevivem a re-renders do CRM durante o arraste.
 * - Long-press no card inteiro foi abandonado (overflow do board cancelava o pointer).
 */
export default function CrmCard({ item, onOpen, onMoveToStatus, locator = false }) {
  const cardRef = useRef(null);
  const handleRef = useRef(null);
  const sessionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const itemRef = useRef(item);
  const onOpenRef = useRef(onOpen);
  const onMoveRef = useRef(onMoveToStatus);

  itemRef.current = item;
  onOpenRef.current = onOpen;
  onMoveRef.current = onMoveToStatus;

  const endDrag = (clientX, clientY) => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;

    window.removeEventListener("pointermove", s.onMove);
    window.removeEventListener("pointerup", s.onEnd);
    window.removeEventListener("pointercancel", s.onEnd);
    s.captureEl?.removeEventListener?.("lostpointercapture", s.onLost);

    try {
      if (s.captureEl?.hasPointerCapture?.(s.pointerId)) {
        s.captureEl.releasePointerCapture(s.pointerId);
      }
    } catch {
      /* ignore */
    }

    const status = s.overStatus || statusFromPoint(clientX, clientY);
    const didMove = s.moved;
    s.ghost?.remove();
    s.sourceEl?.classList.remove("is-drag-source");
    clearDropHighlights();
    document.body.classList.remove("crm-dragging");

    if (didMove) suppressClickRef.current = true;

    const current = itemRef.current;
    if (status && current && status !== current.status) {
      onMoveRef.current?.(current.placa, status);
    }
  };

  const beginDrag = (pointerEvent, captureEl) => {
    const sourceEl = cardRef.current;
    if (!sourceEl || sessionRef.current) return false;

    const pointerId = pointerEvent.pointerId;
    const clientX = pointerEvent.clientX;
    const clientY = pointerEvent.clientY;
    const target = captureEl || sourceEl;

    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }

    const rect = sourceEl.getBoundingClientRect();
    const ghost = sourceEl.cloneNode(true);
    ghost.classList.add("crm-card-ghost");
    ghost.removeAttribute("data-placa");
    ghost.setAttribute("aria-hidden", "true");
    ghost.tabIndex = -1;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    document.body.appendChild(ghost);

    sourceEl.classList.add("is-drag-source");
    document.body.classList.add("crm-dragging");

    const session = {
      pointerId,
      ghost,
      sourceEl,
      captureEl: target,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      overStatus: itemRef.current.status,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      moved: false,
      onMove: null,
      onEnd: null,
      onLost: null,
    };

    const onMove = (ev) => {
      if (ev.pointerId !== session.pointerId) return;
      if (ev.cancelable) ev.preventDefault();
      session.lastX = ev.clientX;
      session.lastY = ev.clientY;
      if (
        !session.moved &&
        Math.hypot(ev.clientX - session.startX, ev.clientY - session.startY) > 2
      ) {
        session.moved = true;
      }
      const x = ev.clientX - session.offsetX;
      const y = ev.clientY - session.offsetY;
      session.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const status = statusFromPoint(ev.clientX, ev.clientY);
      if (status) session.overStatus = status;
      highlightDropStatus(session.overStatus);

      const board = session.sourceEl.closest(".crm-kanban");
      if (board) {
        const b = board.getBoundingClientRect();
        if (ev.clientX > b.right - 56) board.scrollLeft += 18;
        if (ev.clientX < b.left + 56) board.scrollLeft -= 18;
      }
    };

    session.onMove = onMove;
    session.onEnd = (ev) => {
      if (ev.pointerId !== session.pointerId) return;
      endDrag(ev.clientX, ev.clientY);
    };
    session.onLost = () => {
      if (!sessionRef.current || sessionRef.current !== session) return;
      endDrag(session.lastX, session.lastY);
    };

    sessionRef.current = session;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", session.onEnd);
    window.addEventListener("pointercancel", session.onEnd);
    target.addEventListener("lostpointercapture", session.onLost);

    onMove({
      pointerId,
      clientX,
      clientY,
      cancelable: false,
      preventDefault() {},
    });

    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }

    return true;
  };

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return undefined;

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (sessionRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      beginDrag(e, handle);
    };

    handle.addEventListener("pointerdown", onPointerDown, { passive: false });
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      const s = sessionRef.current;
      if (!s) return;
      window.removeEventListener("pointermove", s.onMove);
      window.removeEventListener("pointerup", s.onEnd);
      window.removeEventListener("pointercancel", s.onEnd);
      s.captureEl?.removeEventListener?.("lostpointercapture", s.onLost);
      try {
        if (s.captureEl?.hasPointerCapture?.(s.pointerId)) {
          s.captureEl.releasePointerCapture(s.pointerId);
        }
      } catch {
        /* ignore */
      }
      s.ghost?.remove();
      s.sourceEl?.classList.remove("is-drag-source");
      sessionRef.current = null;
      clearDropHighlights();
      document.body.classList.remove("crm-dragging");
    };
    // beginDrag usa só refs; amarra o DOM da alça uma vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBodyClick = (e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (sessionRef.current) {
      e.preventDefault();
      return;
    }
    onOpenRef.current?.(itemRef.current.placa);
  };

  const facts = vehicleFacts(item);

  return (
    <article ref={cardRef} className="crm-card" data-placa={item.placa}>
      {!locator && (
      <button
        ref={handleRef}
        type="button"
        className="crm-card-handle"
        aria-label={`Arrastar ${item.placa}`}
        title="Arrastar para outra coluna"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      )}
      <div
        className="crm-card-main"
        role="button"
        tabIndex={0}
        onClick={onBodyClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenRef.current?.(itemRef.current.placa);
          }
        }}
      >
        <div className="crm-card-top">
          <strong className="placa">{item.placa}</strong>
        </div>
        {(item.rastreado || item.localizado) && (
          <div className="crm-row-tags">
            {item.rastreado && <span className="tag-rastreado">Rastreado</span>}
            {item.localizado && <span className="tag-localizado">Localizado</span>}
          </div>
        )}
        <p className="crm-card-sub">
          {locator ? facts.veiculo || "Sem descrição" : item.assessoria || "Sem assessoria"}
        </p>
        <p className="crm-card-meta">
          {locator
            ? [facts.cor, facts.comarca, facts.uf].filter(Boolean).join(" · ") || "—"
            : [item.localizador, item.veiculo].filter(Boolean).join(" · ") || "—"}
        </p>
        {!locator && (
          <div className="crm-card-foot">
            <span>Contato {formatShortDate(item.proximoContato)}</span>
          </div>
        )}
      </div>
    </article>
  );
}
