import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CASA = [-11.18215, -40.50666];

export default function JacobinaMap({
  segmentos = [],
  dia = null,
  feitos,
  casa,
  bairroId = "todos",
  active = true,
  posicao = null,
  seguir = false,
  onDrag,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const linesRef = useRef(new Map());
  const trilhaRef = useRef(null);
  const casaRef = useRef(null);
  const voceRef = useRef(null);
  const haloRef = useRef(null);
  const canvasRef = useRef(null);
  const fittedRef = useRef("");
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const canvas = L.canvas({ padding: 0.4 });
    canvasRef.current = canvas;
    const map = L.map(elRef.current, { zoomControl: true, preferCanvas: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      className: "jacobina-tiles",
    }).addTo(map);
    map.setView(casa ? [casa.lat, casa.lon] : CASA, 14);
    map.on("dragstart", () => onDragRef.current?.());
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      linesRef.current = new Map();
      trilhaRef.current = null;
      casaRef.current = null;
      voceRef.current = null;
      haloRef.current = null;
    };
  }, [casa]);

  useEffect(() => {
    if (!active || !mapRef.current) return undefined;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [active, dia?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;
    for (const line of linesRef.current.values()) line.remove();
    linesRef.current = new Map();
    if (casaRef.current) {
      casaRef.current.remove();
      casaRef.current = null;
    }
    for (const seg of segmentos) {
      if (!seg.coords || seg.coords.length < 2) continue;
      const line = L.polyline(seg.coords, {
        renderer: canvas,
        interactive: false,
        weight: 2,
        color: "#9aa3b2",
        opacity: 0.55,
      });
      line._bairro = seg.bairro || "";
      line.addTo(map);
      linesRef.current.set(seg.id, line);
    }
    const pin = casa ? [casa.lat, casa.lon] : CASA;
    const marker = L.marker(pin, {
      icon: L.divIcon({
        className: "casa-pin",
        html: "<span>Casa</span>",
        iconSize: [52, 22],
        iconAnchor: [26, 11],
      }),
      keyboard: false,
      zIndexOffset: 800,
    });
    marker.bindTooltip(casa?.endereco || "Casa", { direction: "top", offset: [0, -8] });
    marker.addTo(map);
    casaRef.current = marker;
    fittedRef.current = "";
  }, [segmentos, casa]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !linesRef.current.size) return;
    const dayIds = new Set(dia?.segmentos || []);
    const done = feitos || new Set();
    for (const [id, line] of linesRef.current) {
      const segOn = dayIds.has(id);
      const feito = done.has(id);
      const inBairro = bairroId === "todos" || line._bairro === bairroId || segOn;
      if (!inBairro) {
        line.setStyle({ opacity: 0, weight: 0 });
        continue;
      }
      if (segOn) line.setStyle({ color: "#e6c36a", weight: 5, opacity: 0.95 });
      else if (feito) line.setStyle({ color: "#7dcea0", weight: 3, opacity: 0.9 });
      else line.setStyle({ color: "#9aa3b2", weight: 2, opacity: 0.5 });
    }
    if (trilhaRef.current) {
      trilhaRef.current.remove();
      trilhaRef.current = null;
    }
    if (dia?.trilha?.length > 1) {
      trilhaRef.current = L.polyline(dia.trilha, {
        color: "#f4e2a8",
        weight: 2,
        opacity: 0.85,
        dashArray: "6 8",
        interactive: false,
      }).addTo(map);
      trilhaRef.current.bringToFront();
    }
    if (!seguir && dia?.id && fittedRef.current !== dia.id && dia.trilha?.length > 1) {
      fittedRef.current = dia.id;
      map.fitBounds(dia.trilha, { padding: [28, 28], maxZoom: 16 });
    }
  }, [dia, feitos, bairroId, segmentos, seguir]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!posicao) {
      voceRef.current?.remove();
      haloRef.current?.remove();
      voceRef.current = null;
      haloRef.current = null;
      return;
    }
    const ll = [posicao.lat, posicao.lon];
    if (!voceRef.current) {
      voceRef.current = L.circleMarker(ll, {
        radius: 8,
        color: "#f4f7fb",
        weight: 3,
        fillColor: "#5b8def",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      voceRef.current.setLatLng(ll);
    }
    const raio = Math.max(8, Math.min(posicao.accuracy || 20, 80));
    if (!haloRef.current) {
      haloRef.current = L.circle(ll, {
        radius: raio,
        color: "#8eb6f5",
        weight: 1,
        fillColor: "#5b8def",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    } else {
      haloRef.current.setLatLng(ll);
      haloRef.current.setRadius(raio);
    }
    voceRef.current.bringToFront();
    if (seguir) {
      if (map.getZoom() < 16) map.setView(ll, 17);
      else map.panTo(ll, { animate: true, duration: 0.4 });
    }
  }, [posicao, seguir]);

  return <div ref={elRef} className="jacobina-map" role="application" aria-label="Mapa das ruas de Jacobina" />;
}
