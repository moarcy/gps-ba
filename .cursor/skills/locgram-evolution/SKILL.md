---
name: locgram-evolution
description: >-
  Configures GPS BA Locgram intercept via Evolution WhatsApp: webhook on
  the notebook, Nova ocorrência ingest into aba Localizados, JID of Locgram
  Atendimento, ports 8790 vs Telegram 8080. Use when the user mentions
  Evolution, Locgram ao vivo, webhook WhatsApp, interceptar mensagens do
  Locgram, configure-locgram, or collecting hits without messaging locators.
---

# Locgram via Evolution — interceptar batidas

Leia `CONTEXTO-LOCALIZADOS.md` e `whatsapp-locgram/AGENT-LOCGRAM.md`. Config canônica: `whatsapp-locgram/locgram-intercept.json`.

## O que isso faz

WhatsApp (Locgram Atendimento) → Evolution neste PC → worker `whatsapp-locgram` na porta **8790** → aba **Localizados** (Posição? = Pendente).

A organização e o checklist continuam no app, aba **Local**. Moarcy copia o Zap do dia e marca Sim/Não.

## O que isso NÃO faz

- Não manda WhatsApp para Bira, Carlos ou Maciel.
- Não marca Sim/Não sozinho.
- Não cobra assessoria.
- Não roda na Vercel (`POST ingest` lá é 403).
- Não usa a porta **8080** — essa é do Telegram Radar.

## Ligar neste PC

1. Evolution API **ligada** (instância WhatsApp já conectada). URL e chave em `whatsapp-locgram/.env`.
2. Worker escutando: `whatsapp-locgram/start-locgram.cmd` → `http://127.0.0.1:8790/webhook`.
3. Registrar webhook: `cd whatsapp-locgram; npm run setup` (ou `configure-locgram.ps1`).
4. Opcional, filtrar o chat: `npm run chats` → `EVOLUTION_JID_LOCGRAM=...`.
5. Autostart Windows: `install-autostart.ps1`.

Se a Evolution está em Docker: `EVOLUTION_WEBHOOK_URL=http://host.docker.internal:8790/webhook`.

Sem Evolution ligada, a **configuração** (JSON + scripts + contexto) já existe; o registro do webhook falha até a API subir.

## Parse

Mensagem ao vivo (não o ZIP Android): `*Nova ocorrência - Jubiraci*` + placa. `jubiraci` → BIRA. Arquivo: `google-sheets/lib/parse-locgram-live.js`.

1 placa = última data. Sync não apaga Sim/Não. Detalhe: [reference.md](reference.md).
