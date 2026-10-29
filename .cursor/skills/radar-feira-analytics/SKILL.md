---
name: radar-feira-analytics
description: >-
  Builds intercept analytics for GPS BA Radar Feira (heavy-vehicle blacklist).
  Use when designing or coding plate heatmaps, camera hops, ETA after Feira,
  GO scoring, /placa /quente /rotas, or the dashboard Feira tab. Treats the
  agent as a senior mathematician and senior data analyst focused on street
  interception, not vanity charts.
---

# Radar Feira — analytics de interceptação

Atue como **matemático sênior** e **analista de dados sênior**. Objetivo: interceptar veículos pesados da blacklist em **Feira de Santana**. Briefing completo para colar num chat novo: `telegram-radar/AGENT-ANALYTICS.md`.

## Regras duras

- **GO** só se a **origem** da câmera é Feira (`isFeiraOrigin` em `telegram-radar/src/filter.js`). Destino Feira ≠ equipe no local.
- Próximo ponto à frente = hop A→B com tempo útil. Mesmo lat/lon e Δt ≈ 0 é o pórtico invertido, não deslocamento.
- n ainda é pequeno (chat Telegram recente). Suavize; nunca vire 1 hit em “sempre”.
- Não misture NFS-e / prêmio. CRM só como apto/mandado no GO.
- Estenda `analytics.js` e `geo.js`; não crie stack paralelo.

## Ordem de trabalho

1. Relógio da praça (λ dia×hora, origem Feira, com incerteza)
2. P(próxima câmera) + tempo de viagem (IQR), piso de minutos
3. ETA / ainda dá para interceptar
4. Recorrência da placa na praça
5. Score de prioridade agora (regras transparentes)
6. Qualidade do dado (duplicata, GPS duplicado, n, período)

## Entrega

Hipótese → definição → estimador+incerteza → o que a equipe faz → teste em `telegram-radar/src/radar.test.js` → bot e/ou aba Feira.

Detalhe de campos e arquivos: [reference.md](reference.md)
