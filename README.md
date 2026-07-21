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
