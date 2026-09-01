# Radar Telegram

Duas etapas:

1. **Agora** — pegar o alerta da blacklist, filtrar (Endrigo **ou** Feira de Santana) e te mandar no Telegram
2. **Depois** — gravar histórico e analytics de apreensão (`/placa`, `/horarios`, `/quente`)

Isto **não** vai para a Vercel. Roda no Northflank, ligado o tempo todo.

---

## Nesta tela do Northflank

Pode **Skip** no canto direito. Se quiser preencher:

| Pergunta | Resposta |
|---|---|
| What would you like to deploy? | `Always-on Node worker: Telegram listener that filters and forwards messages` |
| How did you hear about us? | Other / friend (qualquer um) |
| Where do you want to deploy? | **Northflank Cloud** (não BYOC / AWS) |
| Work or personal? | **Personal projects** |

Popup *Product analytics* no canto: **No**.

---

## Etapa 1 — pegar e enviar

Antes de criar o serviço no Northflank, faça **uma vez no PC** (gera token e IDs). Sem isso o container sobe vazio.

### 1.1 Bot que te avisa

1. Telegram → [@BotFather](https://t.me/BotFather) → `/newbot`
2. Nome: `Radar GPS BA`
3. Username: algo como `gpsba_radar_bot`
4. Copie o token

Não coloque esse bot no grupo da blacklist.

### 1.2 API da sua conta (ela que lê o grupo)

1. https://my.telegram.org → **API development tools**
2. Crie um app (`GPS BA Radar`)
3. Copie `api_id` e `api_hash`

### 1.3 Login e ID do grupo

No PowerShell:

```powershell
cd "C:\Users\moarc\OneDrive\Área de Trabalho\GPS BA\telegram-radar"
copy .env.example .env
notepad .env
```

Preencha:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_PHONE=55DDDNUMERO
```

Depois:

```powershell
npm install
npm run login
```

Cole o `TELEGRAM_SESSION=...` no `.env`. Em seguida:

```powershell
npm run chats
```

Copie o ID do grupo da blacklist → `TELEGRAM_SOURCE_CHAT_ID`.

Opcional, para já ter o destino:

```powershell
npm start
```

Abra o bot → `/start` → `/chatid`. Copie o **Chat ID** → `TELEGRAM_DEST_CHAT_ID`. Depois `Ctrl+C` no terminal.

### 1.4 Projeto no Northflank

1. **Projects** → Create project → nome `gps-ba` → região mais perto (US East ou EU) → Northflank Cloud
2. **Integrations** → conecte o **GitHub** e autorize o repositório GPS BA
3. O código do radar precisa estar no GitHub (pasta `telegram-radar/`). Se ainda não subiu, avise para fazermos o commit/push.

### 1.5 Serviço (Combined)

Dentro do projeto: **Create** → **Combined service**

- Name: `radar`
- Repository: o repo GPS BA, branch `main` (ou a que você usa)
- Build: **Dockerfile**
  - Dockerfile path: `/telegram-radar/Dockerfile`
  - Build context: `/telegram-radar`
- Networking: porta **8080**, HTTP. Pode ficar interna (não precisa de domínio público)
- Resources: o menor (256 MB / 0.1 CPU) — o Sandbox já limita isso
- Environment variables (cole as mesmas do `.env`, **sem** aspas):

```
TELEGRAM_BOT_TOKEN
TELEGRAM_API_ID
TELEGRAM_API_HASH
TELEGRAM_SESSION
TELEGRAM_SOURCE_CHAT_ID
TELEGRAM_DEST_CHAT_ID
RADAR_KEYWORDS=ENDRIGO,FEIRA DE SANTANA
PORT=8080
```

Create service. Nos logs deve aparecer:

```
Health → :8080
Filtro: ENDRIGO | FEIRA DE SANTANA
Bot @... no ar
Listener (conta) conectado
Ouvindo grupo -100...
```

Abra o bot e mande `/start`. Encaminhe um alerta de Feira e um do Endrigo: têm que chegar de volta. Patos/Pedro some.

---

## Etapa 2 — dados (ainda não)

Quando o encaminhamento estiver estável:

- histórico por placa
- horário/dia mais provável
- câmeras / sentido
- “quente agora”

Aí sim persistimos fora do container (planilha ou volume), porque no Northflank o disco some se o serviço reiniciar.
