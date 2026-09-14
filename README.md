# GPS BA — Controle de Diligências

Dashboard web + sincronização com planilhas Excel no Google Drive.

## Estrutura

| Pasta | Função |
|---|---|
| `dashboard/` | Interface React (Vite) |
| `google-sheets/` | Sync Excel + API local |
| `api/` | Endpoint serverless (`/api/dashboard`) para Vercel |

## Desenvolvimento local

```bash
# Terminal 1 — API
cd google-sheets
npm install
npm run api

# Terminal 2 — UI
cd dashboard
npm install
npm run dev
```

Abra http://localhost:5173

## Variáveis de ambiente

Copie `.env.example` → `google-sheets/.env` (e na Vercel as mesmas chaves):

- `SPREADSHEET_ID_1` — planilha do gestor
- `SPREADSHEET_ID_2` — planilha de produção
- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON da service account (Vercel)
- ou `credentials.json` em `google-sheets/` (local)

## Deploy Vercel

1. Importe este repositório na Vercel
2. Root Directory: `.` (raiz do repo)
3. Configure as env vars acima
4. Deploy

A UI chama `/api/dashboard`, servida pela function em `api/dashboard.js`.

### Localizados (posição)

Aba **Local** no app. Confirma com Bira, Carlos ou Maciel se ainda tem a posição — um lote de até 6, texto pronto para o Zap. Marca Sim/Não; grava na aba `Localizados` da planilha.

- `GET /api/localizados` — lotes e checklist
- `POST /api/localizados` — `{ placa, posicao: "Pendente" | "Sim" | "Não" }`

Não mistura com Radar Feira, NFS-e nem prêmio. Detalhes em `CONTEXTO-LOCALIZADOS.md`.

### Adicionar veículo

No header, use **+**. O `POST /api/vehicles` grava na planilha do **gestor** (`Planilha1`), fonte do sync.

### CRM de diligências

Aba **CRM** no app. Dados nas abas `CRM Pipeline`, `CRM Timeline` e `CRM Pagamentos` da planilha do gestor.

- `GET /api/crm` — filas, follow-ups, pátio, pagamentos, timeline
- `POST /api/crm` — `action`: `create` | `update` | `timeline` | `pagamento` | `bridge` | `preview`

### NFS-e (Camaçari)

Aba **NFS-e** no app. Catálogos nas abas `NFS-e Tomadores`, `NFS-e Servicos`, `NFS-e Config`, `NFS-e Emitidas`.

- `GET /api/nfse` — tomadores, serviços, config, histórico
- `POST /api/nfse` — `action`: `emit` | `upsert_tomador`

A emissão real usa um **worker Playwright** (portal com login/senha), fora da Vercel:

```bash
cd google-sheets/nfse-worker
npm install && npm run install:browsers
# configure .env com NFSE_PORTAL_USER / NFSE_PORTAL_PASSWORD
npm start
```

Na API/Vercel: `NFSE_WORKER_URL` + `NFSE_WORKER_SECRET`. Detalhes em `google-sheets/nfse-worker/README.md`.
