# Locgram via Evolution — coleta no notebook

Worker local. **Não vai para a Vercel.** Igual o radar Telegram: o Windows sobe, se cair tenta de novo.

Ele **só coleta** `Nova ocorrência` do Locgram e grava na aba **Localizados**.  
Quem confere posição com Bira/Carlos/Maciel é você, na aba **Local** do app.

Não manda Zap para o localizador. Não marca Sim/Não sozinho.

## Uma vez

1. Evolution API rodando neste PC (instância WhatsApp já conectada).
2. Copie `.env.example` → `.env` e preencha a instância.
3. Na Evolution, webhook:

   - URL: `http://127.0.0.1:8790/webhook`
   - Evento: `messages.upsert`

4. Opcional: `EVOLUTION_JID_LOCGRAM` = jid do chat Locgram Atendimento.

```powershell
cd "C:\Users\moarc\OneDrive\Área de Trabalho\GPS BA\whatsapp-locgram"
copy .env.example .env
npm install
.\install-autostart.ps1
.\start-locgram.cmd
```

Precisa do `google-sheets/.env` (planilha + credencial Google), o mesmo do dashboard.

## O que acontece

Locgram bate a placa → worker lê → placa entra **Pendente** no dia certo, na ordem da ronda.  
No app: aba **Local** → você manda o dia para o loc e marca Sim/Não.
