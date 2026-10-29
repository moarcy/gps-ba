import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const FEIRA_CENTER = [-12.2669, -38.9663];

export default function RadarMap({
  cameras = [],
  trajectory = [],
  selectedCamera,
  onSelectCamera,
  active,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      className: "radar-tiles",
    }).addTo(map);
    map.setView(FEIRA_CENTER, 8);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active || !mapRef.current) return undefined;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const bounds = [];
    const grouped = new Map();
    for (const cam of cameras) {
      if (cam.lat == null || cam.lon == null) continue;
      const key = `${Number(cam.lat).toFixed(5)}|${Number(cam.lon).toFixed(5)}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          lat: cam.lat,
          lon: cam.lon,
          feira: Boolean(cam.feira),
          portico: Boolean(cam.porticoInvertido),
          count: cam.count || 0,
          plates: cam.plates || 0,
          names: [cam.name || cam.id],
          ids: [cam.id],
        });
      } else {
        const g = grouped.get(key);
        g.feira = g.feira || Boolean(cam.feira);
        g.portico = g.portico || Boolean(cam.porticoInvertido);
        g.count += cam.count || 0;
        g.plates += cam.plates || 0;
        g.names.push(cam.name || cam.id);
        g.ids.push(cam.id);
      }
    }

    for (const cam of grouped.values()) {
      const isSel = cam.ids.includes(selectedCamera);
      const marker = L.circleMarker([cam.lat, cam.lon], {
        radius: cam.feira ? (isSel ? 12 : 9) : isSel ? 9 : 6,
        color: cam.feira ? "#9be7c4" : "#d4b36a",
        fillColor: cam.feira ? "#6f9b84" : "#c4a35a",
        fillOpacity: isSel ? 1 : 0.78,
        weight: 2,
      });
      const title = cam.names.join("<br>");
      const extra = cam.portico && cam.feira ? "<br>Pórtico: dois sentidos no mesmo GPS" : "";
      marker.bindTooltip(
        `<strong>${title}</strong><br>${cam.count} passagens · ${cam.plates} placas${extra}`,
        { sticky: true },
      );
      marker.on("click", () => {
        const pick = cam.ids.find((id) => id === selectedCamera) || cam.ids[0];
        onSelectCamera?.(pick);
      });
      marker.addTo(group);
      bounds.push([cam.lat, cam.lon]);
    }

    const path = (trajectory || [])
      .filter((p) => p.lat != null && p.lon != null)
      .map((p) => [p.lat, p.lon]);
    if (path.length >= 2) {
      L.polyline(path, { color: "#7aa2f0", weight: 3, opacity: 0.9 }).addTo(group);
      path.forEach((ll) => bounds.push(ll));
    }

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: path.length ? 10 : 11 });
    }
  }, [cameras, trajectory, selectedCamera, onSelectCamera]);

  return <div ref={elRef} className="radar-map" />;
}
