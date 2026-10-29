# Locgram Evolution — arquivos e portas

## Arquivos

| Path | Papel |
|---|---|
| `whatsapp-locgram/locgram-intercept.json` | Perfil: só coleta, não manda, não marca posição |
| `whatsapp-locgram/src/index.js` | HTTP `/webhook` e `/health` |
| `whatsapp-locgram/src/setup-webhook.js` | `POST` webhook na Evolution |
| `whatsapp-locgram/src/find-locgram-jid.js` | Lista chats com "Locgram" |
| `whatsapp-locgram/src/evolution.js` | Extrai texto/jid do payload |
| `whatsapp-locgram/configure-locgram.ps1` | .env + chats + webhook + autostart |
| `google-sheets/lib/parse-locgram-live.js` | `Nova ocorrência` ao vivo |
| `google-sheets/lib/localizados-service.js` | `ingestLocgramHit` |
| ZIP na raiz | Histórico Android, outro parser |

## Portas neste notebook

| Porta | Serviço |
|---|---|
| 8080 | Telegram Radar (`{"service":"telegram-radar"}`) — **não** é Evolution |
| 8790 | Worker Locgram (`{"service":"gps-ba-locgram-evolution"}`) |
| 8787 | API local `google-sheets/api-server.js` |

Evolution API tem URL própria no `.env` (`EVOLUTION_API_URL`). Não apontar Locgram para 8080 se o Radar já estiver nela.

## .env (`whatsapp-locgram/.env`)

```
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=
EVOLUTION_WEBHOOK_URL=http://127.0.0.1:8790/webhook
EVOLUTION_JID_LOCGRAM=
LOCGRAM_WEBHOOK_PORT=8790
```

Também precisa de `google-sheets/.env` (planilha + Google).

## Payload Evolution (MESSAGES_UPSERT)

Texto em `data.message.conversation` ou `extendedTextMessage.text`. Ignorar `key.fromMe`. Dedup em `whatsapp-locgram/data/seen-ids.txt`.

## Exemplo de mensagem

```
*Nova ocorrência - Jubiraci*
🚗 PLACA: QOB2D65
```

→ localizador BIRA, cidade Salvador, Posição? Pendente.

## Scripts

```
cd whatsapp-locgram
npm run chats
npm run setup
npm start
```

Em `google-sheets`: `npm run locgram:chats` / `locgram:setup` / `locgram:listen`.
