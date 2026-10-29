# Locgram via Evolution — coleta no notebook

Worker local. **Não vai para a Vercel.** Igual o radar Telegram: o Windows sobe, se cair tenta de novo.

Ele **só coleta** `Nova ocorrência` do Locgram e grava na aba **Localizados**.  
Quem confere posição com Bira/Carlos/Maciel é você, na aba **Local** do app.

Não manda Zap para o localizador. Não marca Sim/Não sozinho.

Perfil: `locgram-intercept.json`. Briefing para chat novo: `AGENT-LOCGRAM.md`.

## Uma vez

1. Evolution API rodando neste PC (WhatsApp já conectado). **Não use a porta 8080** se o Telegram Radar já estiver nela.
2. Preencha `whatsapp-locgram/.env` (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`).
3. Se a Evolution está em Docker: `EVOLUTION_WEBHOOK_URL=http://host.docker.internal:8790/webhook`.
4. Rode o configurador (copia `.env` se faltar, acha o chat Locgram, registra o webhook, coloca no autostart):

```powershell
cd "C:\Users\moarc\OneDrive\Área de Trabalho\GPS BA\whatsapp-locgram"
powershell -ExecutionPolicy Bypass -File .\configure-locgram.ps1
.\start-locgram.cmd
```

Ou passo a passo:

```powershell
copy .env.example .env
npm install
npm run chats
npm run setup
.\install-autostart.ps1
.\start-locgram.cmd
```

Precisa do `google-sheets/.env` (planilha + credencial Google), o mesmo do dashboard.

Worker: `http://127.0.0.1:8790/webhook` — evento `MESSAGES_UPSERT`.

## O que acontece

Locgram bate a placa → worker lê → placa entra **Pendente** no dia certo, na ordem da ronda.  
No app: aba **Local** → você manda o dia para o loc e marca Sim/Não.
