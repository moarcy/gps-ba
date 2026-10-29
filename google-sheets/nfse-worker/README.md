# NFS-e Worker (portal Camaçari)

Robô Playwright que faz login no portal STM e preenche a emissão.
Roda **fora** da Vercel (PC local ou Fly.io).

## Setup local

```bash
cd google-sheets/nfse-worker
npm install
npm run install:browsers
```

Crie `.env` nesta pasta:

```env
NFSE_PORTAL_USER=seu_usuario
NFSE_PORTAL_PASSWORD=sua_senha
NFSE_WORKER_SECRET=troque-este-segredo
NFSE_WORKER_PORT=8791
# NFSE_HEADED=1
# NFSE_DRY_RUN=1
```

No `google-sheets/.env` (API / Vercel):

```env
NFSE_WORKER_URL=http://127.0.0.1:8791
NFSE_WORKER_SECRET=troque-este-segredo
```

Suba o worker:

```bash
npm start
```

Na primeira calibração use `NFSE_HEADED=1` e `NFSE_DRY_RUN=1` para ver o formulário sem confirmar.

## Health

`GET http://127.0.0.1:8791/health`
