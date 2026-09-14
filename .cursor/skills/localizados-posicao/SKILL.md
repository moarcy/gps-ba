---
name: localizados-posicao
description: >-
  Operação GPS BA de veículos localizados: Locgram, Bira/Carlos/Maciel,
  checklist de posição, lotes de WhatsApp, aba Localizados e mensagens
  para assessoria. Use quando o assunto for placa, lote, Posição?,
  Locgram ZIP, Barreiras, Salvador ou cobrar status no escritório.
---

# Localizados — posição e lotes

Leia e siga `CONTEXTO-LOCALIZADOS.md`. Não reconstrua o fluxo do zero.

## Fazer

- Aba operacional: **Localizados** (local, data da última batida, Posição?).
- No dashboard: aba **Local** — um dia inteiro, copiar Zap, Sim/Não. API `/api/localizados`.
- Coleta ao vivo: Evolution no notebook (`whatsapp-locgram/`), só Locgram.
- Checklist: Pendente / Sim / Não. Preservar no sync (`readChecklist` em todas as abas relevantes).
- Zap: todos os carros daquela data, dia mais recente primeiro, no dia início → fim.
- 1 placa = último hit. Lista Bira/Maciel fora do ZIP continua na aba.
- `npm run localizados:status` em `google-sheets` para republicar.

## Não fazer

- Não misturar datas no mesmo Zap — um dia de cada vez.
- Não cobrar assessoria de quem está Pendente ou Não.
- Não misturar Radar Feira / NFS-e / prêmio com este checklist.
- Não apagar Sim/Não já marcado.
