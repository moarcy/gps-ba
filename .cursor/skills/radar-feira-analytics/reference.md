# Dados e arquivos — Radar Feira

## Arquivos

| Path | Papel |
|---|---|
| `telegram-radar/data/sightings.jsonl` | Passagens (não commitar) |
| `telegram-radar/src/filter.js` | `isFeiraOrigin`, `isFeiraCorridor`, `decideTrack` |
| `telegram-radar/src/geo.js` | Câmeras, transições ≤12h, `nextAfterFeira`, haversine |
| `telegram-radar/src/analytics.js` | Heatmap, ouro, `/placa` |
| `telegram-radar/src/parse-alerta.js` | Parse do alerta RK |
| `google-sheets/lib/radar-service.js` | `GET /api/radar`, aba `Radar Feira` |
| `dashboard/src/radar/` | Mapa e lista de placas |

## Recorte

- Origem Feira: `FEIRA DE SANTANA/BA SENT JEQUIÉ/BA`
- Não GO: `JEQUIÉ/BA SENT FEIRA DE SANTANA/BA`
- Transição válida: 0 < minutos ≤ 720, câmeras distintas; ignore ~0 min no mesmo GPS
- Catch-up: avisar GO só se `iso` ≤ 4h (`shouldNotifyMissed`)

## Já medido (ponto de partida)

Contagem bruta dia×hora, moda do slot, mediana de intervalo, confiança por n (`<3`, `≥8`, `≥20`), mediana de minutos A→B. Falta suavização, IQR, filtro de pórtico invertido, ETA e score.
