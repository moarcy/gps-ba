# Briefing — interceptar Locgram no WhatsApp (Evolution)

Cole este arquivo num chat novo quando o assunto for **Evolution, webhook, Locgram ao vivo, interceptar Nova ocorrência**. Depois leia `CONTEXTO-LOCALIZADOS.md`.

## Ideia (não negociável)

O Locgram manda *Nova ocorrência* no WhatsApp. Este notebook (Evolution + worker) **só coleta** a placa e joga na aba **Localizados** como **Pendente**.

A conferência de posição **não** é automática:

1. Locgram bate a placa → sistema registra.
2. Moarcy confirma posição com Bira / Carlos / Maciel (aba **Local** do app, Zap do **dia inteiro**).
3. Só se Posição = **Sim**, cobra a assessoria.

**Não** mandar Zap para o localizador pela Evolution. **Não** marcar Sim/Não sozinho. **Não** ingest na Vercel.

## Onde está a config

| O quê | Onde |
|---|---|
| Perfil da interceptação | `whatsapp-locgram/locgram-intercept.json` |
| Worker webhook | porta **8790**, `whatsapp-locgram/src/index.js` |
| Registrar na Evolution | `npm run setup` em `whatsapp-locgram` |
| Achar o chat Locgram | `npm run chats` → `EVOLUTION_JID_LOCGRAM` |
| Um clique | `whatsapp-locgram/configure-locgram.ps1` |
| Skill Cursor | `.cursor/skills/locgram-evolution/SKILL.md` |

Radar Telegram usa a porta **8080**. Não misturar.

## Locators

- Bira (Jubiraci) e Carlos = Salvador
- Maciel = Barreiras
- Outros nomes no Locgram = OUTROS

1 placa = última data. No dia, ordem da ronda. Dia recente em cima.

## Ligar de verdade

Precisa da Evolution API **rodando** neste PC, com `.env` preenchido (URL, API key, nome da instância). Sem isso os scripts de webhook falham, mas a configuração no repo já está pronta para reaproveitar.
